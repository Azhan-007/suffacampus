'use client';

import { useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery, useCrudList, useCrudModal } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { TeacherService } from '@/services/teacherService';
import { Teacher, Class, ClassAssignment } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button, Modal, Input, Select, EmptyState, ConfirmDialog, Badge,
  ProfileAvatar, PhotoUpload, SortableHeader, PaginationBar, FilterChips,
} from '@/components/common';
import type { FilterChip } from '@/components/common/FilterChips';
import { FormSection } from '@/components/common/FormField';
import StatCard from '@/components/dashboard/StatCard';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import {
  Plus, Pencil, Trash2, Search, Download, Eye, X,
  UserCheck, UserX, GraduationCap, Phone, Mail, MapPin,
  Calendar, Hash, User2, Clock, Briefcase, Building2,
  Printer, RefreshCw, LayoutGrid, List, CheckCircle2, BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { toDate, getErrorMessage } from '@/lib/utils';
import { teacherSchema, validateFormData } from '@/lib/schemas';
import { DEFAULT_SUBJECTS, DEFAULT_DEPARTMENTS } from '@/lib/constants';

type SortField = 'name' | 'department' | 'joiningDate' | 'teacherId';

interface TeacherFormData {
  teacherId: string; firstName: string; lastName: string; email: string; phone: string;
  subjects: string[]; department: string; assignedClasses: ClassAssignment[]; joiningDate: string;
  gender: 'Male' | 'Female' | 'Other'; address: string; photoURL: string; isActive: boolean;
}

const DEFAULT_FORM_DATA: TeacherFormData = {
  teacherId: '', firstName: '', lastName: '', email: '', phone: '',
  subjects: [], department: '', assignedClasses: [],
  joiningDate: new Date().toISOString().split('T')[0],
  gender: 'Male', address: '', photoURL: '', isActive: true,
};

const entityToForm = (teacher: Teacher): TeacherFormData => ({
  teacherId: teacher.teacherId,
  firstName: teacher.firstName, lastName: teacher.lastName,
  email: teacher.email, phone: teacher.phone,
  subjects: teacher.subjects, department: teacher.department, assignedClasses: teacher.assignedClasses || [],
  joiningDate: format(new Date(teacher.joiningDate), 'yyyy-MM-dd'),
  gender: teacher.gender, address: teacher.address,
  photoURL: teacher.photoURL || '', isActive: teacher.isActive,
});

export default function TeachersPage() {
  useDocumentTitle('Teachers');
  const queryClient = useQueryClient();

  // â”€â”€ Data fetching via React Query â”€â”€
  const { data: teachers = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Teacher[]>({
    queryKey: ['teachers'],
    path: '/teachers',
    select: (raw: Record<string, unknown>[]) =>
      raw.map((r) => ({
        ...(r as unknown as Teacher),
        joiningDate: toDate(r.joiningDate),
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      })),
  });

  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // â”€â”€ Fetch classes for class assignment picker â”€â”€
  const { data: classes = [] } = useApiQuery<Class[]>({
    queryKey: ['classes'],
    path: '/classes/all',
  });

  // Build flat list of class+section combos for the picker
  const classSectionOptions = useMemo(() => {
    const options: { classId: string; sectionId: string; label: string; className: string; sectionName: string }[] = [];
    for (const cls of classes) {
      if (!cls.isActive) continue;
      for (const sec of cls.sections || []) {
        options.push({
          classId: cls.id,
          sectionId: sec.id,
          label: `${cls.className} - ${sec.sectionName}`,
          className: cls.className,
          sectionName: sec.sectionName,
        });
      }
    }
    return options;
  }, [classes]);

  // â”€â”€ Entity-specific filter state â”€â”€
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');

  // â”€â”€ CRUD List hook (search, filter, sort, paginate, select) â”€â”€
  const list = useCrudList<Teacher, SortField>({
    items: teachers,
    defaultSortField: 'name',
    filterFn: (items, searchTerm) => {
      let result = items;
      if (filterStatus === 'active') result = result.filter(t => t.isActive);
      else if (filterStatus === 'inactive') result = result.filter(t => !t.isActive);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        result = result.filter(t =>
          (t.firstName ?? '').toLowerCase().includes(q) ||
          (t.lastName ?? '').toLowerCase().includes(q) ||
          (t.teacherId ?? '').toLowerCase().includes(q) ||
          (t.email ?? '').toLowerCase().includes(q) ||
          (t.phone ?? '').includes(q) ||
          (Array.isArray(t.subjects) ? t.subjects : []).some(s => (s ?? '').toLowerCase().includes(q))
        );
      }
      if (filterDepartment) result = result.filter(t => t.department === filterDepartment);
      if (filterSubject) result = result.filter(t => t.subjects.includes(filterSubject));
      return result;
    },
    filterDeps: [filterDepartment, filterSubject, filterStatus],
    compareFn: (a, b, field) => {
      switch (field) {
        case 'name': return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case 'department': return a.department.localeCompare(b.department);
        case 'joiningDate': return new Date(a.joiningDate).getTime() - new Date(b.joiningDate).getTime();
        case 'teacherId': return a.teacherId.localeCompare(b.teacherId);
        default: return 0;
      }
    },
  });

  // â”€â”€ CRUD Modal hook (modal, form, delete dialog) â”€â”€
  const modal = useCrudModal<Teacher, TeacherFormData>({
    defaultFormData: DEFAULT_FORM_DATA,
    entityToForm,
  });

  // â”€â”€ Extra UI state â”€â”€
  const [viewTab, setViewTab] = useState<'personal' | 'professional' | 'contact'>('personal');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [customDepartments, setCustomDepartments] = useState<string[]>([]);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [isCustomDept, setIsCustomDept] = useState(false);
  const [customDeptInput, setCustomDeptInput] = useState('');
  const [customSubjectInput, setCustomSubjectInput] = useState('');

  // â”€â”€â”€ Derived: filter â†’ sort â†’ paginate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const activeCount = useMemo(() => teachers.filter(t => t.isActive).length, [teachers]);
  const inactiveCount = useMemo(() => teachers.filter(t => !t.isActive).length, [teachers]);

  const deptDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    teachers.filter(t => t.isActive).forEach(t => { map[t.department] = (map[t.department] || 0) + 1; });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [teachers]);

  // â”€â”€ Merged lists (default + custom) â”€â”€
  const allDepartments = useMemo(() => {
    const merged = [...DEFAULT_DEPARTMENTS, ...customDepartments];
    // Also include departments from existing teachers
    teachers.forEach(t => { if (t.department && !merged.includes(t.department)) merged.push(t.department); });
    return [...new Set(merged)].sort();
  }, [customDepartments, teachers]);

  const allSubjects = useMemo(() => {
    const merged = [...DEFAULT_SUBJECTS, ...customSubjects];
    teachers.forEach(t => t.subjects.forEach(s => { if (!merged.includes(s)) merged.push(s); }));
    return [...new Set(merged)].sort();
  }, [customSubjects, teachers]);

  const DEPARTMENT_OPTIONS = useMemo(() => allDepartments.map(d => ({ value: d, label: d })), [allDepartments]);
  const SUBJECT_OPTIONS = useMemo(() => allSubjects.map(s => ({ value: s, label: s })), [allSubjects]);

  // â”€â”€ Active filter chips â”€â”€
  const activeFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filterDepartment) chips.push({ key: 'dept', label: filterDepartment, clear: () => setFilterDepartment('') });
    if (filterSubject) chips.push({ key: 'subject', label: filterSubject, clear: () => setFilterSubject('') });
    if (list.searchChip) chips.push(list.searchChip);
    return chips;
  }, [filterDepartment, filterSubject, list.searchChip]);

  // â”€â”€ Wrap close modal to also reset custom dept â”€â”€
  const handleCloseModal = useCallback(() => {
    modal.closeModal();
    setIsCustomDept(false);
    setCustomDeptInput('');
    setCustomSubjectInput('');
  }, [modal]);

  const handleOpenModal = useCallback((teacher?: Teacher) => {
    setIsCustomDept(false);
    setCustomDeptInput('');
    setCustomSubjectInput('');
    modal.openModal(teacher);
  }, [modal]);

  // â”€â”€â”€ Form helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const validateForm = () => {
    const errors = validateFormData(teacherSchema, modal.formData);
    modal.setFormErrors(errors ?? {});
    return errors === null;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { toast.error('Please fill in all required fields'); return; }
    modal.setIsSaving(true);
    try {
      if (modal.editingEntity) {
        await TeacherService.updateTeacher(modal.editingEntity.id, {
          ...modal.formData,
          joiningDate: new Date(modal.formData.joiningDate),
        });
        toast.success('Teacher updated successfully');
      } else {
        const result = await TeacherService.createTeacher({
          ...modal.formData,
          joiningDate: new Date(modal.formData.joiningDate),
        });
        if (result.credentials) {
          setCreatedCredentials(result.credentials);
        }
        toast.success('Teacher created successfully');
      }
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      handleCloseModal();
      if (!createdCredentials) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2200);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      modal.setIsSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    modal.openDelete(id, name);
  };

  const confirmDelete = async () => {
    if (!modal.deleteDialog.id) return;
    modal.setIsDeleting(true);
    try {
      await TeacherService.deleteTeacher(modal.deleteDialog.id);
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      toast.success('Teacher deleted successfully');
      modal.closeDelete();
      list.setSelectedIds(prev => { const n = new Set(prev); n.delete(modal.deleteDialog.id!); return n; });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      modal.setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (list.selectedIds.size === 0) return;
    modal.openDelete('__bulk__', `${list.selectedIds.size} teacher${list.selectedIds.size > 1 ? 's' : ''}`);
  };

  const confirmBulkDelete = async () => {
    modal.setIsDeleting(true);
    try {
      const ids = Array.from(list.selectedIds);
      for (const id of ids) await TeacherService.deleteTeacher(id);
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      toast.success(`${ids.length} teacher(s) deleted`);
      list.clearSelection();
      modal.closeDelete();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      modal.setIsDeleting(false);
    }
  };

  const handleViewTeacher = (teacher: Teacher) => {
    modal.setViewingEntity(teacher);
    setViewTab('personal');
    modal.setIsViewModalOpen(true);
  };

  const handleExportPrint = () => {
    const headers = ['Teacher ID', 'Name', 'Department', 'Subjects', 'Phone', 'Email', 'Status'];
    const rows = list.filtered.map(t => [
      t.teacherId, `${t.firstName} ${t.lastName}`, t.department,
      t.subjects.join(', '), t.phone, t.email,
      t.isActive ? 'Active' : 'Inactive',
    ]);
    exportToPrint({
      title: 'Teacher Records',
      schoolName: 'SuffaCampus School',
      headers,
      rows,
      filename: 'teacher-records',
    });
    toast.success('Print view opened');
  };

  const handleExportCSV = () => {
    const headers = ['Teacher ID', 'Name', 'Email', 'Phone', 'Department', 'Subjects', 'Joining Date', 'Status'];
    const rows = list.filtered.map(t => [
      t.teacherId, `${t.firstName} ${t.lastName}`, t.email, t.phone,
      t.department, t.subjects.join('; '),
      format(new Date(t.joiningDate), 'yyyy-MM-dd'),
      t.isActive ? 'Active' : 'Inactive',
    ]);
    exportToCSV({ title: 'Teacher Records', schoolName: 'SuffaCampus School', headers, rows, filename: `teachers-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('CSV downloaded');
  };

  const handleSubjectToggle = (subject: string) => {
    const subjects = modal.formData.subjects.includes(subject)
      ? modal.formData.subjects.filter(s => s !== subject)
      : [...modal.formData.subjects, subject];
    modal.setFormData(prev => ({ ...prev, subjects }));
  };

  const handleClassToggle = (classId: string, sectionId: string) => {
    const exists = modal.formData.assignedClasses.some(
      (a) => a.classId === classId && a.sectionId === sectionId
    );
    const opt = classSectionOptions.find(o => o.classId === classId && o.sectionId === sectionId);
    if (exists) {
      modal.setFormData(prev => ({
        ...prev,
        assignedClasses: prev.assignedClasses.filter(
          (a) => !(a.classId === classId && a.sectionId === sectionId)
        ),
      }));
    } else if (opt) {
      modal.setFormData(prev => ({
        ...prev,
        assignedClasses: [
          ...prev.assignedClasses,
          { classId, sectionId, className: opt.className, sectionName: opt.sectionName },
        ],
      }));
    }
  };

  const clearAllFilters = () => {
    list.setSearchTerm(''); setFilterDepartment('');
    setFilterSubject(''); setFilterStatus('active');
  };

  // â”€â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading teachers...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• HEADER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div className="flex items-center justify-between">
          <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Teachers</h1>
              <p className="text-base text-slate-500 mt-1">
                Manage teacher records, departments & subjects
              </p>
              {lastSynced && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-xs text-emerald-600 font-medium">Live synced Â· {format(lastSynced, 'h:mm:ss a')}</span>
                </div>
              )}
          </div>
          <div className="flex items-center gap-2">
            {list.selectedIds.size > 0 && (
              <Button variant="secondary" onClick={handleBulkDelete}>
                <Trash2 className="w-4 h-4 text-red-500" />
                <span className="text-red-600">Delete ({list.selectedIds.size})</span>
              </Button>
            )}
            <Button variant="secondary" onClick={handleExportPrint}>
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="secondary" onClick={handleExportCSV}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="w-4 h-4" />
              <span>Add Teacher</span>
            </Button>
          </div>
        </div>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STAT CARDS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Teachers" value={teachers.length} icon={GraduationCap} color="blue" subtitle="All registered teachers" />
          <StatCard title="Active" value={activeCount} icon={UserCheck} color="emerald" subtitle={`${teachers.length > 0 ? Math.round((activeCount / teachers.length) * 100) : 0}% of total`} />
          <StatCard title="Inactive" value={inactiveCount} icon={UserX} color="rose" subtitle="Marked inactive" />
          <StatCard title="Departments" value={deptDistribution.length} icon={Building2} color="violet" subtitle={deptDistribution.slice(0, 2).map(([d]) => d).join(', ') || 'None'} />
        </div>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• FILTERS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          {/* Search + dropdowns */}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, ID, email, phone or subject..."
                value={list.searchTerm}
                onChange={e => list.setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <div className="w-[150px]">
                <Select
                  value={filterDepartment}
                  onChange={e => setFilterDepartment(e.target.value)}
                  placeholder="All Depts"
                  options={DEPARTMENT_OPTIONS}
                />
              </div>
              <div className="w-[160px]">
                <Select
                  value={filterSubject}
                  onChange={e => setFilterSubject(e.target.value)}
                  placeholder="All Subjects"
                  options={SUBJECT_OPTIONS}
                />
              </div>
            </div>
          </div>

          {/* Status tabs + active chips */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <div className="filter-tabs mr-2">
              {(['all', 'active', 'inactive'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`filter-tab ${filterStatus === status ? 'filter-tab-active' : 'filter-tab-inactive'}`}
                >
                  {status === 'all' ? 'All' : status === 'active' ? 'Active' : 'Inactive'}
                  <span className="ml-1.5 text-xs opacity-70">
                    {status === 'all' ? teachers.length : status === 'active' ? activeCount : inactiveCount}
                  </span>
                </button>
              ))}
            </div>

            {/* Active filter chips */}
            <FilterChips chips={activeFilters} onClearAll={clearAllFilters} />

            {/* Results count */}
            <span className="ml-auto text-xs text-slate-400 tabular-nums">
              {list.filtered.length} result{list.filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TABLE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          {/* Table header bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold text-slate-700">Teacher Records</h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">
                  {list.sorted.length}
                </span>
              </div>
              {/* View mode toggle */}
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 ml-2">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-md transition-all duration-150 ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Table View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-md transition-all duration-150 ${viewMode === 'cards' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Card View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <PaginationBar
                page={list.page}
                totalPages={list.totalPages}
                setPage={list.setPage}
                pageSize={list.pageSize}
                setPageSize={list.setPageSize}
                totalItems={list.sorted.length}
                showPageSize
              />
            </div>
          </div>

          {list.paginated.length > 0 ? (
            <>
              {/* â”€â”€ TABLE VIEW â”€â”€ */}
              {viewMode === 'table' && (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="pl-5 pr-2 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={list.allOnPageSelected}
                          ref={el => { if (el) el.indeterminate = list.someOnPageSelected && !list.allOnPageSelected; }}
                          onChange={list.toggleSelectAll}
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                        />
                      </th>
                      {[
                        { label: 'Teacher', field: 'name' as SortField, w: 'min-w-[220px]' },
                        { label: 'ID', field: 'teacherId' as SortField, w: '' },
                        { label: 'Department', field: 'department' as SortField, w: '' },
                        { label: 'Subjects', field: null, w: 'min-w-[180px]' },
                        { label: 'Contact', field: null, w: 'min-w-[150px]' },
                        { label: 'Joined', field: 'joiningDate' as SortField, w: '' },
                        { label: 'Status', field: null, w: '' },
                        { label: 'Actions', field: null, w: 'w-[110px]' },
                      ].map((col, i) => (
                        <th
                          key={i}
                          className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.w} ${col.field ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}`}
                        >
                          {col.field ? (
                            <SortableHeader field={col.field} label={col.label} {...list.sortProps} />
                          ) : (
                            col.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.paginated.map(teacher => {
                      const isSelected = list.selectedIds.has(teacher.id);
                      return (
                        <tr
                          key={teacher.id}
                          className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        >
                          {/* Checkbox */}
                          <td className="pl-5 pr-2 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => list.toggleSelect(teacher.id)}
                              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                            />
                          </td>

                          {/* Teacher Name + Avatar */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProfileAvatar
                                name={`${teacher.firstName} ${teacher.lastName}`}
                                src={teacher.photoURL}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <button
                                  onClick={() => handleViewTeacher(teacher)}
                                  className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left block truncate"
                                >
                                  {teacher.firstName} {teacher.lastName}
                                </button>
                                <p className="text-xs text-slate-400">{teacher.email}</p>
                              </div>
                            </div>
                          </td>

                          {/* Teacher ID */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md">{teacher.teacherId}</span>
                          </td>

                          {/* Department */}
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-slate-700">{teacher.department}</span>
                          </td>

                          {/* Subjects */}
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {teacher.subjects.slice(0, 2).map((subject, idx) => (
                                <span key={idx} className="text-xs font-medium text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                  {subject}
                                </span>
                              ))}
                              {teacher.subjects.length > 2 && (
                                <span className="text-xs text-slate-400 font-medium">+{teacher.subjects.length - 2}</span>
                              )}
                            </div>
                          </td>

                          {/* Contact */}
                          <td className="px-4 py-3">
                            <p className="text-sm text-slate-700 font-medium">{teacher.phone}</p>
                          </td>

                          {/* Joined */}
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-500 whitespace-nowrap">{format(new Date(teacher.joiningDate), 'dd MMM yyyy')}</span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${
                              teacher.isActive
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-red-600 bg-red-50'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                teacher.isActive ? 'bg-emerald-500' : 'bg-red-400'
                              }`} />
                              {teacher.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <button
                                onClick={() => handleViewTeacher(teacher)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenModal(teacher)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(teacher.id, `${teacher.firstName} ${teacher.lastName}`)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}

              {/* â”€â”€ CARD VIEW â”€â”€ */}
              {viewMode === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
                  {list.paginated.map(teacher => {
                    const isSelected = list.selectedIds.has(teacher.id);
                    return (
                      <div
                        key={teacher.id}
                        className={`group relative bg-white rounded-xl border p-4 transition-all duration-200 hover:shadow-md cursor-default ${
                          isSelected ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Selection checkbox */}
                        <div className="absolute top-3 right-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => list.toggleSelect(teacher.id)}
                            className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                          />
                        </div>

                        {/* Profile area */}
                        <div className="flex items-start gap-3 mb-3">
                          <ProfileAvatar
                            name={`${teacher.firstName} ${teacher.lastName}`}
                            src={teacher.photoURL}
                            size="lg"
                          />
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => handleViewTeacher(teacher)}
                              className="font-semibold text-slate-800 text-[14px] hover:text-blue-600 transition-colors text-left block truncate"
                            >
                              {teacher.firstName} {teacher.lastName}
                            </button>
                            <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 mt-0.5 inline-block">{teacher.teacherId}</span>
                            <div className="mt-1">
                              <Badge variant={teacher.isActive ? 'success' : 'danger'} size="sm" dot>
                                {teacher.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium">{teacher.department}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{teacher.phone}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{teacher.email}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Joined {format(new Date(teacher.joiningDate), 'dd MMM yyyy')}</span>
                          </div>
                        </div>

                        {/* Subjects */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {teacher.subjects.slice(0, 3).map((subject, idx) => (
                            <span key={idx} className="text-xs font-medium text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                              {subject}
                            </span>
                          ))}
                          {teacher.subjects.length > 3 && (
                            <span className="text-xs text-slate-400 font-medium">+{teacher.subjects.length - 3}</span>
                          )}
                        </div>

                        {/* Card actions */}
                        <div className="flex items-center gap-1 pt-3 border-t border-slate-100">
                          <button
                            onClick={() => handleViewTeacher(teacher)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                          <button
                            onClick={() => handleOpenModal(teacher)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(teacher.id, `${teacher.firstName} ${teacher.lastName}`)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {list.totalPages > 1 && (
                <div className="px-5 py-3 border-t border-slate-100 bg-white">
                  <PaginationBar
                    page={list.page}
                    totalPages={list.totalPages}
                    setPage={list.setPage}
                    pageSize={list.pageSize}
                    setPageSize={list.setPageSize}
                    totalItems={list.sorted.length}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="p-8">
              <EmptyState
                icon={<GraduationCap className="w-16 h-16" />}
                title="No teachers found"
                description={
                  list.searchTerm || filterDepartment || filterSubject || filterStatus !== 'all'
                    ? 'Try adjusting your filters or search criteria'
                    : 'Get started by adding your first teacher'
                }
                action={
                  !list.searchTerm && !filterDepartment && !filterSubject
                    ? { label: 'Add Teacher', onClick: () => handleOpenModal() }
                    : undefined
                }
              />
            </div>
          )}
        </div>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ADD / EDIT MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <Modal
          isOpen={modal.isModalOpen}
          onClose={handleCloseModal}
          title={modal.editingEntity ? 'Edit Teacher' : 'Add New Teacher'}
          subtitle={modal.editingEntity ? `Editing ${modal.editingEntity.firstName} ${modal.editingEntity.lastName}` : 'Fill in the teacher details below'}
          size="xl"
        >
          <div className="space-y-6">
            {/* Section: Identity */}
            <FormSection title="Personal Information" icon={User2} color="blue">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Teacher ID *"
                  value={modal.formData.teacherId}
                  onChange={e => modal.setFormData(prev => ({ ...prev, teacherId: e.target.value }))}
                  error={modal.formErrors.teacherId}
                  placeholder="TCH001"
                />
                <Input
                  label="First Name *"
                  value={modal.formData.firstName}
                  onChange={e => modal.setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  error={modal.formErrors.firstName}
                  placeholder="John"
                />
                <Input
                  label="Last Name *"
                  value={modal.formData.lastName}
                  onChange={e => modal.setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  error={modal.formErrors.lastName}
                  placeholder="Doe"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <Select
                  label="Gender *"
                  value={modal.formData.gender}
                  onChange={e => modal.setFormData(prev => ({ ...prev, gender: e.target.value as any }))}
                  options={[
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
                <Input
                  label="Joining Date *"
                  type="date"
                  value={modal.formData.joiningDate}
                  onChange={e => modal.setFormData(prev => ({ ...prev, joiningDate: e.target.value }))}
                  error={modal.formErrors.joiningDate}
                />
              </div>
              <div className="mt-4">
                <PhotoUpload
                  value={modal.formData.photoURL}
                  onChange={(url: string) => modal.setFormData(prev => ({ ...prev, photoURL: url }))}
                  onRemove={() => modal.setFormData(prev => ({ ...prev, photoURL: '' }))}
                  size="md"
                  shape="rounded"
                />
              </div>
            </FormSection>

            <div className="h-px bg-slate-100" />

            {/* Section: Professional */}
            <FormSection title="Professional Details" icon={Briefcase} color="violet">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!isCustomDept ? (
                  <div>
                    <Select
                      label="Department *"
                      value={modal.formData.department}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setIsCustomDept(true);
                          modal.setFormData(prev => ({ ...prev, department: '' }));
                        } else {
                          modal.setFormData(prev => ({ ...prev, department: e.target.value }));
                        }
                      }}
                      error={modal.formErrors.department}
                      options={[
                        ...DEPARTMENT_OPTIONS,
                        { value: '__custom__', label: '+ Create New Department' },
                      ]}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      New Department *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customDeptInput}
                        onChange={e => setCustomDeptInput(e.target.value)}
                        placeholder="Department name"
                        className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500 transition-all"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customDeptInput.trim()) {
                            const name = customDeptInput.trim();
                            if (!allDepartments.includes(name)) setCustomDepartments(prev => [...prev, name]);
                            modal.setFormData(prev => ({ ...prev, department: name }));
                            setIsCustomDept(false);
                            setCustomDeptInput('');
                          }
                        }}
                        className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 transition-colors"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsCustomDept(false); setCustomDeptInput(''); }}
                        className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Subjects * {modal.formErrors.subjects && <span className="text-red-500 text-xs">({modal.formErrors.subjects})</span>}
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {allSubjects.map(subject => (
                    <label
                      key={subject}
                      className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer transition-colors text-sm ${
                        modal.formData.subjects.includes(subject)
                          ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={modal.formData.subjects.includes(subject)}
                        onChange={() => handleSubjectToggle(subject)}
                        className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20"
                      />
                      {subject}
                    </label>
                  ))}
                </div>
                {/* Add custom subject */}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={customSubjectInput}
                    onChange={e => setCustomSubjectInput(e.target.value)}
                    placeholder="Add custom subject..."
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customSubjectInput.trim()) {
                        e.preventDefault();
                        const name = customSubjectInput.trim();
                        if (!allSubjects.includes(name)) setCustomSubjects(prev => [...prev, name]);
                        if (!modal.formData.subjects.includes(name)) modal.setFormData(prev => ({ ...prev, subjects: [...prev.subjects, name] }));
                        setCustomSubjectInput('');
                      }
                    }}
                    className="flex-1 max-w-[240px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customSubjectInput.trim()) {
                        const name = customSubjectInput.trim();
                        if (!allSubjects.includes(name)) setCustomSubjects(prev => [...prev, name]);
                        if (!modal.formData.subjects.includes(name)) modal.setFormData(prev => ({ ...prev, subjects: [...prev.subjects, name] }));
                        setCustomSubjectInput('');
                      }
                    }}
                    className="px-3 py-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 inline mr-1" />
                    Add Subject
                  </button>
                </div>
              </div>
            </FormSection>

            <div className="h-px bg-slate-100" />

            {/* Section: Class Assignments */}
            <FormSection title="Class Assignments" icon={BookOpen} color="amber">
              {classSectionOptions.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No classes available. Create classes first.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {classSectionOptions.map((opt) => {
                    const isSelected = modal.formData.assignedClasses.some(
                      (a) => a.classId === opt.classId && a.sectionId === opt.sectionId
                    );
                    return (
                      <button
                        key={`${opt.classId}-${opt.sectionId}`}
                        type="button"
                        onClick={() => handleClassToggle(opt.classId, opt.sectionId)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                          isSelected
                            ? 'bg-amber-100 border-amber-400 text-amber-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </FormSection>

            <div className="h-px bg-slate-100" />

            {/* Section: Contact */}
            <FormSection title="Contact Details" icon={Phone} color="emerald">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Email *"
                  type="email"
                  value={modal.formData.email}
                  onChange={e => modal.setFormData(prev => ({ ...prev, email: e.target.value }))}
                  error={modal.formErrors.email}
                  placeholder="teacher@SuffaCampus.com"
                />
                <Input
                  label="Phone *"
                  value={modal.formData.phone}
                  onChange={e => modal.setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  error={modal.formErrors.phone}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="mt-4">
                <Input
                  label="Address"
                  value={modal.formData.address}
                  onChange={e => modal.setFormData(prev => ({ ...prev, address: e.target.value }))}
                  error={modal.formErrors.address}
                  placeholder="123 Street Name, City, State - 400001"
                />
              </div>
            </FormSection>

            <div className="h-px bg-slate-100" />

            {/* Status toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => modal.setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${modal.formData.isActive ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${modal.formData.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <p className="text-sm font-medium text-slate-700">Active Teacher</p>
                <p className="text-xs text-slate-400">Inactive teachers will not appear in timetable or class assignments</p>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <Button variant="secondary" onClick={handleCloseModal} disabled={modal.isSaving}>Cancel</Button>
            <Button onClick={handleSubmit} isLoading={modal.isSaving}>
              {modal.editingEntity ? 'Save Changes' : 'Create Teacher'}
            </Button>
          </div>
        </Modal>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• VIEW MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <Modal
          isOpen={modal.isViewModalOpen}
          onClose={() => modal.setIsViewModalOpen(false)}
          title="Teacher Profile"
          subtitle="Detailed teacher information"
          size="lg"
        >
          {modal.viewingEntity && (
            <div className="space-y-5">
              {/* Profile header */}
              <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <ProfileAvatar
                  name={`${modal.viewingEntity.firstName} ${modal.viewingEntity.lastName}`}
                  src={modal.viewingEntity.photoURL}
                  size="xl"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">
                    {modal.viewingEntity.firstName} {modal.viewingEntity.lastName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">{modal.viewingEntity.teacherId}</span>
                    <Badge variant={modal.viewingEntity.isActive ? 'success' : 'danger'} size="sm" dot>
                      {modal.viewingEntity.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {modal.viewingEntity.department}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Joined {format(new Date(modal.viewingEntity.joiningDate), 'MMMM dd, yyyy')}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {([
                  { id: 'personal' as const, label: 'Personal', icon: User2 },
                  { id: 'professional' as const, label: 'Professional', icon: Briefcase },
                  { id: 'contact' as const, label: 'Contact', icon: Phone },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setViewTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      viewTab === tab.id
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {viewTab === 'personal' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow icon={User2} label="Full Name" value={`${modal.viewingEntity.firstName} ${modal.viewingEntity.lastName}`} />
                  <InfoRow icon={Hash} label="Teacher ID" value={modal.viewingEntity.teacherId} mono />
                  <InfoRow icon={User2} label="Gender" value={modal.viewingEntity.gender} />
                  <InfoRow icon={Calendar} label="Joining Date" value={format(new Date(modal.viewingEntity.joiningDate), 'MMMM dd, yyyy')} />
                  <InfoRow icon={MapPin} label="Address" value={modal.viewingEntity.address} span2 />
                </div>
              )}

              {viewTab === 'professional' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InfoRow icon={Building2} label="Department" value={modal.viewingEntity.department} />
                    <InfoRow icon={Clock} label="Record Created" value={format(new Date(modal.viewingEntity.createdAt), 'MMMM dd, yyyy')} />
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Subjects</p>
                    <div className="flex flex-wrap gap-2">
                      {modal.viewingEntity.subjects.map((subject, idx) => (
                        <span key={idx} className="text-xs font-medium text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Assigned Classes</p>
                    <div className="flex flex-wrap gap-2">
                      {(modal.viewingEntity.assignedClasses ?? []).length > 0 ? (
                        modal.viewingEntity.assignedClasses!.map((ac, idx) => (
                          <span key={idx} className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                            {ac.className || ac.classId} - {ac.sectionName || ac.sectionId}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No classes assigned</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {viewTab === 'contact' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow icon={Mail} label="Email" value={modal.viewingEntity.email} />
                  <InfoRow icon={Phone} label="Phone" value={modal.viewingEntity.phone} />
                  <InfoRow icon={MapPin} label="Address" value={modal.viewingEntity.address} span2 />
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button variant="secondary" onClick={() => modal.setIsViewModalOpen(false)}>Close</Button>
                <Button onClick={() => { modal.setIsViewModalOpen(false); handleOpenModal(modal.viewingEntity!); }}>
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Teacher
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• CREDENTIALS MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {createdCredentials && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md mx-4 animate-scale-in">
              <div className="flex flex-col items-center gap-2 mb-4">
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Teacher Login Credentials</h3>
                <p className="text-sm text-slate-500">Share these login credentials with the teacher</p>
              </div>
              <div className="space-y-3 bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex justify-between items-center bg-white rounded px-3 py-2 border">
                  <span className="text-sm text-slate-500">Email</span>
                  <span className="text-base font-mono font-semibold text-slate-800">{createdCredentials.email}</span>
                </div>
                <div className="flex justify-between items-center bg-white rounded px-3 py-2 border">
                  <span className="text-sm text-slate-500">Password</span>
                  <span className="text-base font-mono font-semibold text-slate-800">{createdCredentials.password}</span>
                </div>
                <p className="text-xs text-blue-700">Teacher can change their password after first login. These credentials are only shown once.</p>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`);
                    toast.success('Credentials copied!');
                  }}
                >
                  Copy
                </Button>
                <Button
                  onClick={() => { setCreatedCredentials(null); setShowSuccess(true); setTimeout(() => setShowSuccess(false), 2200); }}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• SUCCESS ANIMATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {showSuccess && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl p-8 shadow-lg flex flex-col items-center gap-3 animate-scale-in">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </div>
              <p className="text-lg font-semibold text-slate-800">Saved!</p>
              <p className="text-sm text-slate-400">Teacher record has been saved successfully</p>
            </div>
          </div>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• DELETE DIALOG â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <ConfirmDialog
          isOpen={modal.deleteDialog.isOpen}
          onClose={modal.closeDelete}
          onConfirm={modal.deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete}
          title={modal.deleteDialog.id === '__bulk__' ? 'Delete Teachers' : 'Delete Teacher'}
          message={`Are you sure you want to delete ${modal.deleteDialog.name}? This action will mark ${modal.deleteDialog.id === '__bulk__' ? 'them' : 'the teacher'} as inactive.`}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
          isLoading={modal.isDeleting}
        />
      </div>
    </DashboardLayout>
  );
}

// â”€â”€â”€ View Modal Info Row Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function InfoRow({ icon: Icon, label, value, mono, span2 }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  span2?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 ${span2 ? 'sm:col-span-2' : ''}`}>
      <div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-medium text-slate-700 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

