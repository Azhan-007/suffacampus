'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDocumentTitle, useApiQuery, useCrudList, useCrudModal } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { StudentService } from '@/services/studentService';
import { ClassService } from '@/services/classService';
import { Student } from '@/types';
import { useAuthStore } from '@/store/authStore';
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
  Plus, Pencil, Trash2, Search, Download, Users, Eye, X,
  UserCheck, UserX, BookOpen, Phone, Mail, MapPin,
  Calendar, Hash, User2, Clock, Shield, Printer,
  RefreshCw, LayoutGrid, List, CheckCircle2,
  Heart, AlertTriangle, Briefcase, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { toDate, getErrorMessage } from '@/lib/utils';
import { studentSchema, validateFormData } from '@/lib/schemas';
import { Class } from '@/types';

type SortField = 'name' | 'classId' | 'rollNumber' | 'enrollmentDate';

interface StudentFormData {
  studentId: string; firstName: string; lastName: string; email: string; phone: string;
  parentPhone: string; parentEmail: string; classId: string; sectionId: string;
  rollNumber: string; dateOfBirth: string; gender: 'Male' | 'Female' | 'Other';
  address: string; photoURL: string; enrollmentDate: string; isActive: boolean;
  // Additional info
  alternatePhone: string; bloodGroup: string; nationality: string; religion: string;
  city: string; state: string; postalCode: string;
  emergencyContactName: string; emergencyContact: string; emergencyRelation: string;
  medicalConditions: string; allergies: string; previousSchool: string;
  fatherName: string; fatherPhone: string; fatherEmail: string; fatherOccupation: string; fatherWorkplace: string;
  motherName: string; motherPhone: string; motherEmail: string; motherOccupation: string; motherWorkplace: string;
  guardianName: string; guardianRelation: string; guardianPhone: string; guardianEmail: string;
}

const DEFAULT_FORM_DATA: StudentFormData = {
  studentId: '', firstName: '', lastName: '', email: '', phone: '',
  parentPhone: '', parentEmail: '', classId: '', sectionId: '',
  rollNumber: '', dateOfBirth: '', gender: 'Male',
  address: '', photoURL: '',
  enrollmentDate: new Date().toISOString().split('T')[0],
  isActive: true,
  alternatePhone: '', bloodGroup: '', nationality: '', religion: '',
  city: '', state: '', postalCode: '',
  emergencyContactName: '', emergencyContact: '', emergencyRelation: '',
  medicalConditions: '', allergies: '', previousSchool: '',
  fatherName: '', fatherPhone: '', fatherEmail: '', fatherOccupation: '', fatherWorkplace: '',
  motherName: '', motherPhone: '', motherEmail: '', motherOccupation: '', motherWorkplace: '',
  guardianName: '', guardianRelation: '', guardianPhone: '', guardianEmail: '',
};

const entityToForm = (student: Student): StudentFormData => ({
  studentId: student.studentId,
  firstName: student.firstName, lastName: student.lastName,
  email: student.email || '', phone: student.phone || '',
  parentPhone: student.parentPhone, parentEmail: student.parentEmail || '',
  classId: student.classId, sectionId: student.sectionId,
  rollNumber: student.rollNumber,
  dateOfBirth: format(new Date(student.dateOfBirth), 'yyyy-MM-dd'),
  gender: student.gender, address: student.address,
  photoURL: student.photoURL || '',
  enrollmentDate: format(new Date(student.enrollmentDate), 'yyyy-MM-dd'),
  isActive: student.isActive,
  alternatePhone: student.alternatePhone || '', bloodGroup: student.bloodGroup || '',
  nationality: student.nationality || '', religion: student.religion || '',
  city: student.city || '', state: student.state || '', postalCode: student.postalCode || '',
  emergencyContactName: student.emergencyContactName || '', emergencyContact: student.emergencyContact || '',
  emergencyRelation: student.emergencyRelation || '',
  medicalConditions: student.medicalConditions || '', allergies: student.allergies || '',
  previousSchool: student.previousSchool || '',
  fatherName: student.fatherName || '', fatherPhone: student.fatherPhone || '',
  fatherEmail: student.fatherEmail || '', fatherOccupation: student.fatherOccupation || '',
  fatherWorkplace: student.fatherWorkplace || '',
  motherName: student.motherName || '', motherPhone: student.motherPhone || '',
  motherEmail: student.motherEmail || '', motherOccupation: student.motherOccupation || '',
  motherWorkplace: student.motherWorkplace || '',
  guardianName: student.guardianName || '', guardianRelation: student.guardianRelation || '',
  guardianPhone: student.guardianPhone || '', guardianEmail: student.guardianEmail || '',
});

export default function StudentsPage() {
  useDocumentTitle('Students');
  const router = useRouter();
  const { currentSchool, user } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || 'default';
  const queryClient = useQueryClient();

  // â”€â”€ Data fetching via React Query â”€â”€
  const { data: students = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Student[]>({
    queryKey: ['students', schoolId],
    path: '/students',
    select: (raw: Record<string, unknown>[]) =>
      raw.map((r) => ({
        ...(r as unknown as Student),
        dateOfBirth: toDate(r.dateOfBirth),
        enrollmentDate: toDate(r.enrollmentDate),
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      })),
  });

  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // â”€â”€ Fetch classes for dynamic class/section dropdowns â”€â”€
  const { data: classesRaw = [], isLoading: classesLoading, error: classesError } = useApiQuery<Class[]>({
    queryKey: ['classes', schoolId],
    path: '/classes/all',
    enabled: Boolean(schoolId && schoolId !== 'default'),
  });

  useEffect(() => {
    if (classesError) {
      toast.error(`Failed to load classes: ${getErrorMessage(classesError)}`);
    }
  }, [classesError]);

  // Ensure isActive is always set (backend uses isDeleted, frontend expects isActive)
  const classes = useMemo(
    () => classesRaw.map(c => ({ ...c, isActive: c.isActive ?? true } as Class)),
    [classesRaw],
  );

  const classMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c.className])) as Record<string, string>,
    [classes],
  );

  const classOptions = useMemo(
    () => classes.filter(c => c.isActive !== false).map(c => ({ value: c.id, label: c.className })),
    [classes],
  );

  /** All unique sections across all classes â€” used for list filters */
  const allSectionOptions = useMemo(() => {
    const names = new Set<string>();
    classes.filter(c => c.isActive !== false).forEach(c => c.sections?.forEach(s => names.add(s.sectionName)));
    return [...names].sort().map(n => ({ value: n, label: `Section ${n}` }));
  }, [classes]);

  // â”€â”€ Entity-specific filter state â”€â”€
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');

  // â”€â”€ CRUD List hook (search, filter, sort, paginate, select) â”€â”€
  const list = useCrudList<Student, SortField>({
    items: students,
    defaultSortField: 'name',
    filterFn: (items, searchTerm) => {
      let result = items;
      if (filterStatus === 'active') result = result.filter(s => s.isActive);
      else if (filterStatus === 'inactive') result = result.filter(s => !s.isActive);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        result = result.filter(s =>
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q) ||
          s.studentId.toLowerCase().includes(q) ||
          s.rollNumber.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.parentPhone.includes(q)
        );
      }
      if (filterClass) result = result.filter(s => s.classId === filterClass);
      if (filterSection) result = result.filter(s => s.sectionId === filterSection);
      if (filterGender) result = result.filter(s => s.gender === filterGender);
      return result;
    },
    filterDeps: [filterClass, filterSection, filterGender, filterStatus],
    compareFn: (a, b, field) => {
      switch (field) {
        case 'name': return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case 'classId': return a.classId.localeCompare(b.classId) || a.rollNumber.localeCompare(b.rollNumber);
        case 'rollNumber': return a.rollNumber.localeCompare(b.rollNumber);
        case 'enrollmentDate': return new Date(a.enrollmentDate).getTime() - new Date(b.enrollmentDate).getTime();
        default: return 0;
      }
    },
  });

  // â”€â”€ CRUD Modal hook (modal, form, delete dialog) â”€â”€
  const modal = useCrudModal<Student, StudentFormData>({
    defaultFormData: DEFAULT_FORM_DATA,
    entityToForm,
  });

  /** Sections for the currently-selected class in the modal form */
  const formSectionOptions = useMemo(() => {
    const cls = classes.find(c => c.id === modal.formData.classId);
    if (!cls?.sections?.length) return allSectionOptions;
    return cls.sections.map(s => ({ value: s.sectionName, label: `Section ${s.sectionName}` }));
  }, [classes, modal.formData.classId, allSectionOptions]);

  // â”€â”€ Extra UI state â”€â”€
  const [viewTab, setViewTab] = useState<'personal' | 'academic' | 'contact'>('personal');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showSuccess, setShowSuccess] = useState(false);
  const [customSection, setCustomSection] = useState('');
  const [isCustomSection, setIsCustomSection] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; email: string; password: string } | null>(null);
  const [showAdditional, setShowAdditional] = useState(false);
  const [isCreatingDefaultClass, setIsCreatingDefaultClass] = useState(false);

  // â”€â”€â”€ Derived stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const activeCount = useMemo(() => students.filter(s => s.isActive).length, [students]);
  const inactiveCount = useMemo(() => students.filter(s => !s.isActive).length, [students]);

  const classDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    students.filter(s => s.isActive).forEach(s => { map[s.classId] = (map[s.classId] || 0) + 1; });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [students]);

  // â”€â”€ Active filter chips â”€â”€
  const activeFilters = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filterClass) chips.push({ key: 'class', label: classMap[filterClass] || filterClass, clear: () => setFilterClass('') });
    if (filterSection) chips.push({ key: 'section', label: `Section ${filterSection}`, clear: () => setFilterSection('') });
    if (filterGender) chips.push({ key: 'gender', label: filterGender, clear: () => setFilterGender('') });
    if (list.searchChip) chips.push(list.searchChip);
    return chips;
  }, [filterClass, filterSection, filterGender, list.searchChip, classMap]);

  // â”€â”€ Wrap close modal to also reset custom section â”€â”€
  const handleCloseModal = useCallback(() => {
    modal.closeModal();
    setIsCustomSection(false);
    setCustomSection('');
  }, [modal]);

  const handleOpenModal = useCallback((student?: Student) => {
    setIsCustomSection(false);
    setCustomSection('');
    modal.openModal(student);
  }, [modal]);

  // â”€â”€â”€ Form helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const validateForm = () => {
    const errors = validateFormData(studentSchema, modal.formData);
    modal.setFormErrors(errors ?? {});
    return errors === null;
  };

  const handleSubmit = async () => {
    if (!modal.editingEntity && classOptions.length === 0) {
      toast.error('No classes found for this school. Create a class first.');
      return;
    }

    if (!validateForm()) { toast.error('Please fill in all required fields'); return; }
    modal.setIsSaving(true);
    try {
      const cleaned = Object.fromEntries(Object.entries(modal.formData).filter(([, v]) => v !== '')) as typeof modal.formData;
      const payload = { ...cleaned, dateOfBirth: new Date(modal.formData.dateOfBirth), enrollmentDate: new Date(modal.formData.enrollmentDate) };
      if (modal.editingEntity) {
        await StudentService.updateStudent(schoolId, modal.editingEntity.id, payload);
        toast.success('Student updated successfully');
      } else {
        const result = await StudentService.createStudent(schoolId, payload as any);
        toast.success('Student created successfully');
        queryClient.invalidateQueries({ queryKey: ['students'] });
        handleCloseModal();
        setCreatedCredentials(result.credentials);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['students'] });
      handleCloseModal();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2200);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      modal.setIsSaving(false);
    }
  };

  const handleCreateDefaultClass = async () => {
    if (isCreatingDefaultClass) return;
    setIsCreatingDefaultClass(true);
    try {
      const defaultSectionName = 'A';
      const classId = await ClassService.createClass({
        className: 'Class 1',
        grade: 1,
        capacity: 60,
        isActive: true,
        sections: [
          {
            id: `sec-${Date.now()}`,
            sectionName: defaultSectionName,
            capacity: 60,
            studentsCount: 0,
          },
        ],
      } as any);

      await queryClient.invalidateQueries({ queryKey: ['classes', schoolId] });

      modal.setFormData({
        ...modal.formData,
        classId,
        sectionId: defaultSectionName,
      });

      toast.success('Default class created. You can continue adding the student.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsCreatingDefaultClass(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    modal.openDelete(id, name);
  };

  const confirmDelete = async () => {
    if (!modal.deleteDialog.id) return;
    modal.setIsDeleting(true);
    try {
      await StudentService.deleteStudent(schoolId, modal.deleteDialog.id);
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Student deleted successfully');
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
    const names = students.filter(s => list.selectedIds.has(s.id)).map(s => `${s.firstName} ${s.lastName}`);
    modal.setDeleteDialog({ isOpen: true, id: '__bulk__', name: `${names.length} student${names.length > 1 ? 's' : ''}` });
  };

  const confirmBulkDelete = async () => {
    modal.setIsDeleting(true);
    try {
      const ids = Array.from(list.selectedIds);
      for (const id of ids) await StudentService.deleteStudent(schoolId, id);
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success(`${ids.length} student(s) deleted`);
      list.clearSelection();
      modal.closeDelete();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      modal.setIsDeleting(false);
    }
  };

  const handleViewStudent = (student: Student) => {
    modal.setViewingEntity(student);
    setViewTab('personal');
    modal.setIsViewModalOpen(true);
  };

  const handleExportPrint = () => {
    const headers = ['Student ID', 'Name', 'Class', 'Section', 'Roll No', 'Gender', 'Parent Phone', 'Status'];
    const rows = list.filtered.map(s => [
      s.studentId, `${s.firstName} ${s.lastName}`,
      classMap[s.classId] || s.classId, s.sectionId,
      s.rollNumber, s.gender, s.parentPhone,
      s.isActive ? 'Active' : 'Inactive',
    ]);
    exportToPrint({
      title: 'Student Records',
      schoolName: currentSchool?.name || 'SuffaCampus School',
      headers,
      rows,
      filename: 'student-records',
    });
    toast.success('Print view opened');
  };

  const handleExportCSV = () => {
    const headers = ['Student ID', 'Name', 'Class', 'Section', 'Roll No', 'Email', 'Phone', 'Parent Phone', 'Status'];
    const rows = list.filtered.map(s => [
      s.studentId, `${s.firstName} ${s.lastName}`,
      classMap[s.classId] || s.classId, s.sectionId,
      s.rollNumber, s.email || '', s.phone || '', s.parentPhone,
      s.isActive ? 'Active' : 'Inactive',
    ]);
    exportToCSV({ title: 'Student Records', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `students-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('CSV downloaded');
  };

  const clearAllFilters = () => {
    list.setSearchTerm(''); setFilterClass(''); setFilterSection('');
    setFilterGender(''); setFilterStatus('active');
  };

  // â”€â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading students...</p>
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
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Students</h1>
              <p className="text-base text-slate-500 mt-1">
                Manage student records, enrollment & information
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
              <span>Add Student</span>
            </Button>
          </div>
        </div>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STAT CARDS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Students"
            value={students.length}
            icon={Users}
            color="blue"
            subtitle="All enrolled students"
            loading={loading}
          />
          <StatCard
            title="Active Students"
            value={activeCount}
            icon={UserCheck}
            color="emerald"
            trend={students.length > 0 ? { value: Math.round((activeCount / students.length) * 100), isPositive: true } : undefined}
            subtitle="Currently active"
            loading={loading}
          />
          <StatCard
            title="Inactive"
            value={inactiveCount}
            icon={UserX}
            color="rose"
            subtitle="Marked inactive"
            loading={loading}
          />
          <StatCard
            title="Classes"
            value={classDistribution.length}
            icon={BookOpen}
            color="violet"
            subtitle={classDistribution.length > 0 ? classDistribution.slice(0, 3).map(([cls, count]) => `${classMap[cls] || cls}: ${count}`).join(' Â· ') : 'No classes'}
            loading={loading}
          />
        </div>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• FILTERS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          {/* Search + dropdowns */}
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, ID, roll number, email or phone..."
                value={list.searchTerm}
                onChange={e => list.setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <div className="w-[140px]">
                <Select
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                  placeholder="All Classes"
                  options={classOptions}
                />
              </div>
              <div className="w-[140px]">
                <Select
                  value={filterSection}
                  onChange={e => setFilterSection(e.target.value)}
                  placeholder="All Sections"
                  options={allSectionOptions}
                />
              </div>
              <div className="w-[130px]">
                <Select
                  value={filterGender}
                  onChange={e => setFilterGender(e.target.value)}
                  placeholder="Gender"
                  options={[
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                    { value: 'Other', label: 'Other' },
                  ]}
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
                    {status === 'all' ? students.length : status === 'active' ? activeCount : inactiveCount}
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
                <h3 className="text-[14px] font-semibold text-slate-700">Student Records</h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">
                  {list.sorted.length}
                </span>
              </div>
              {/* View toggle */}
              <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 ml-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-md transition-all duration-150 ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Table view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-md transition-all duration-150 ${viewMode === 'cards' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Card view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                Showing {(list.page - 1) * list.pageSize + 1}â€“{Math.min(list.page * list.pageSize, list.sorted.length)}
              </span>
              <div className="w-[100px]">
                <Select
                  value={String(list.pageSize)}
                  onChange={e => { list.setPageSize(Number(e.target.value)); list.setPage(1); }}
                  options={[10, 25, 50, 100].map(n => ({ value: String(n), label: `${n} rows` }))}
                />
              </div>
            </div>
          </div>

          {list.paginated.length > 0 ? (
            <>
              {viewMode === 'table' ? (
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[220px] cursor-pointer select-none hover:text-slate-700 transition-colors">
                        <SortableHeader<SortField> field="name" label="Student" {...list.sortProps} />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-slate-700 transition-colors">
                        <SortableHeader<SortField> field="classId" label="Class" {...list.sortProps} />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-slate-700 transition-colors">
                        <SortableHeader<SortField> field="rollNumber" label="Roll No" {...list.sortProps} />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        Gender
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[180px]">
                        Contact
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-slate-700 transition-colors">
                        <SortableHeader<SortField> field="enrollmentDate" label="Enrolled" {...list.sortProps} />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap w-[110px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.paginated.map(student => {
                      const isSelected = list.selectedIds.has(student.id);
                      return (
                        <tr
                          key={student.id}
                          className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                        >
                          {/* Checkbox */}
                          <td className="pl-5 pr-2 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => list.toggleSelect(student.id)}
                              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                            />
                          </td>

                          {/* Student Name + Avatar */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ProfileAvatar
                                name={`${student.firstName} ${student.lastName}`}
                                src={student.photoURL}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <button
                                  onClick={() => handleViewStudent(student)}
                                  className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left block truncate"
                                >
                                  {student.firstName} {student.lastName}
                                </button>
                                <p className="text-xs text-slate-400 font-mono">{student.studentId}</p>
                              </div>
                            </div>
                          </td>

                          {/* Class / Section */}
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-slate-700">
                              {classMap[student.classId] || student.classId} &middot; {student.sectionId}
                            </span>
                          </td>

                          {/* Roll No */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md">{student.rollNumber}</span>
                          </td>

                          {/* Gender */}
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-600">
                              {student.gender}
                            </span>
                          </td>

                          {/* Contact */}
                          <td className="px-4 py-3">
                            <p className="text-sm text-slate-700 font-medium">{student.parentPhone}</p>
                            {student.email && (
                              <p className="text-xs text-slate-400 truncate max-w-[180px]">{student.email}</p>
                            )}
                          </td>

                          {/* Enrolled */}
                          <td className="px-4 py-3">
                            <span className="text-sm text-slate-500 whitespace-nowrap">{format(new Date(student.enrollmentDate), 'dd MMM yyyy')}</span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${
                              student.isActive
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-red-600 bg-red-50'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                student.isActive ? 'bg-emerald-500' : 'bg-red-400'
                              }`} />
                              {student.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <button
                                onClick={() => handleViewStudent(student)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenModal(student)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(student.id, `${student.firstName} ${student.lastName}`)}
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
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
                {list.paginated.map(student => {
                  const isSelected = list.selectedIds.has(student.id);
                  return (
                    <div
                      key={student.id}
                      className={`rounded-xl border p-4 hover:shadow-lg transition-all duration-200 group cursor-default ${
                        isSelected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                      }`}
                      style={{ boxShadow: 'var(--shadow-card)' }}
                    >
                      <div className="flex items-start gap-3">
                        <ProfileAvatar
                          name={`${student.firstName} ${student.lastName}`}
                          src={student.photoURL}
                          size="lg"
                        />
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => handleViewStudent(student)}
                            className="font-semibold text-slate-800 text-[14px] hover:text-blue-600 transition-colors text-left block truncate"
                          >
                            {student.firstName} {student.lastName}
                          </button>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{student.studentId}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant={student.isActive ? 'success' : 'danger'} size="sm" dot>
                              {student.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => list.toggleSelect(student.id)}
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer mt-1"
                        />
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-y-2.5 gap-x-4">
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Class</p>
                          <p className="text-sm font-medium text-slate-700 mt-0.5">{student.classId.replace('class-', 'Class ')} Â· {student.sectionId}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Roll No</p>
                          <p className="text-sm font-mono font-medium text-slate-700 mt-0.5">{student.rollNumber}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Contact</p>
                          <p className="text-sm text-slate-700 truncate mt-0.5">{student.parentPhone}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gender</p>
                          <p className="text-sm text-slate-600 mt-0.5">{student.gender}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-0.5 mt-3 pt-3 border-t border-slate-100">
                        <button onClick={() => handleViewStudent(student)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleOpenModal(student)} className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(student.id, `${student.firstName} ${student.lastName}`)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}

              {/* Pagination */}
              {list.totalPages > 1 && (
                <PaginationBar
                  page={list.page}
                  totalPages={list.totalPages}
                  setPage={list.setPage}
                  pageSize={list.pageSize}
                  setPageSize={list.setPageSize}
                  totalItems={list.sorted.length}
                  showPageSize={false}
                />
              )}
            </>
          ) : (
            <div className="p-8">
              <EmptyState
                icon={<Users className="w-16 h-16" />}
                title="No students found"
                description={
                  list.searchTerm || filterClass || filterSection || filterStatus !== 'all'
                    ? 'Try adjusting your filters or search criteria'
                    : 'Get started by adding your first student'
                }
                action={
                  !list.searchTerm && !filterClass && !filterSection
                    ? { label: 'Add Student', onClick: () => handleOpenModal() }
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
          title={modal.editingEntity ? 'Edit Student' : 'Add New Student'}
          subtitle={modal.editingEntity ? `Editing ${modal.editingEntity.firstName} ${modal.editingEntity.lastName}` : 'Fill in the student details below'}
          size="xl"
        >
          <div className="space-y-6">
            {/* Section: Identity */}
            <div>
              <FormSection title="Personal Information" icon={User2} color="blue">
                <div />
              </FormSection>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Student ID *"
                  value={modal.formData.studentId}
                  onChange={e => modal.setFormData({ ...modal.formData, studentId: e.target.value })}
                  error={modal.formErrors.studentId}
                  placeholder="STU001"
                />
                <Input
                  label="First Name *"
                  value={modal.formData.firstName}
                  onChange={e => modal.setFormData({ ...modal.formData, firstName: e.target.value })}
                  error={modal.formErrors.firstName}
                  placeholder="John"
                />
                <Input
                  label="Last Name *"
                  value={modal.formData.lastName}
                  onChange={e => modal.setFormData({ ...modal.formData, lastName: e.target.value })}
                  error={modal.formErrors.lastName}
                  placeholder="Doe"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <Select
                  label="Gender *"
                  value={modal.formData.gender}
                  onChange={e => modal.setFormData({ ...modal.formData, gender: e.target.value as 'Male' | 'Female' | 'Other' })}
                  options={[
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
                <Input
                  label="Date of Birth *"
                  type="date"
                  value={modal.formData.dateOfBirth}
                  onChange={e => modal.setFormData({ ...modal.formData, dateOfBirth: e.target.value })}
                  error={modal.formErrors.dateOfBirth}
                />
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Student Photo</label>
                <PhotoUpload
                  value={modal.formData.photoURL}
                  onChange={(url: string) => modal.setFormData({ ...modal.formData, photoURL: url })}
                  onRemove={() => modal.setFormData({ ...modal.formData, photoURL: '' })}
                  size="md"
                  shape="rounded"
                />
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Section: Academic */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                  <BookOpen className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <h4 className="text-sm font-medium text-slate-700">Academic Details</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Select
                  label="Class *"
                  value={modal.formData.classId}
                  onChange={e => modal.setFormData({ ...modal.formData, classId: e.target.value })}
                  error={modal.formErrors.classId}
                  options={classOptions}
                />
                <div>
                  {isCustomSection ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Section *</label>
                      <div className="flex gap-2">
                        <Input
                          value={customSection}
                          onChange={e => { setCustomSection(e.target.value); modal.setFormData({ ...modal.formData, sectionId: e.target.value }); }}
                          placeholder="e.g. E, F, Science"
                          error={modal.formErrors.sectionId}
                        />
                        <Button variant="secondary" size="sm" onClick={() => { setIsCustomSection(false); setCustomSection(''); modal.setFormData({ ...modal.formData, sectionId: '' }); }}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Select
                      label="Section *"
                      value={modal.formData.sectionId}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setIsCustomSection(true);
                          modal.setFormData({ ...modal.formData, sectionId: '' });
                        } else {
                          modal.setFormData({ ...modal.formData, sectionId: e.target.value });
                        }
                      }}
                      error={modal.formErrors.sectionId}
                      options={[...formSectionOptions, { value: '__custom__', label: '+ Create Custom Section' }]}
                    />
                  )}
                </div>
                <Input
                  label="Roll Number *"
                  value={modal.formData.rollNumber}
                  onChange={e => modal.setFormData({ ...modal.formData, rollNumber: e.target.value })}
                  error={modal.formErrors.rollNumber}
                  placeholder="001"
                />
                <Input
                  label="Enrollment Date"
                  type="date"
                  value={modal.formData.enrollmentDate}
                  onChange={e => modal.setFormData({ ...modal.formData, enrollmentDate: e.target.value })}
                />
              </div>

              {classOptions.length === 0 && !classesLoading && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-amber-800">
                      No classes available for this school yet. Create at least one class and section first.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCreateDefaultClass}
                        isLoading={isCreatingDefaultClass}
                      >
                        Create Default Class
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          handleCloseModal();
                          router.push('/classes');
                        }}
                      >
                        Go to Classes
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-slate-100" />

            {/* Section: Contact */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h4 className="text-sm font-medium text-slate-700">Contact & Guardian</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Student Email"
                  type="email"
                  value={modal.formData.email}
                  onChange={e => modal.setFormData({ ...modal.formData, email: e.target.value })}
                  placeholder="student@email.com"
                />
                <Input
                  label="Student Phone"
                  value={modal.formData.phone}
                  onChange={e => modal.setFormData({ ...modal.formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
                <Input
                  label="Parent Phone *"
                  value={modal.formData.parentPhone}
                  onChange={e => modal.setFormData({ ...modal.formData, parentPhone: e.target.value })}
                  error={modal.formErrors.parentPhone}
                  placeholder="+91 98765 43210"
                />
                <Input
                  label="Parent Email"
                  type="email"
                  value={modal.formData.parentEmail}
                  onChange={e => modal.setFormData({ ...modal.formData, parentEmail: e.target.value })}
                  placeholder="parent@email.com"
                />
              </div>
              <div className="mt-4">
                <Input
                  label="Address *"
                  value={modal.formData.address}
                  onChange={e => modal.setFormData({ ...modal.formData, address: e.target.value })}
                  error={modal.formErrors.address}
                  placeholder="123 Street Name, City, State - 400001"
                />
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* â”€â”€ Additional Information (collapsible) â”€â”€ */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdditional(prev => !prev)}
                className="flex items-center gap-2 w-full text-left mb-4"
              >
                <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                  <ChevronDown className={`w-3.5 h-3.5 text-violet-600 transition-transform ${showAdditional ? 'rotate-180' : ''}`} />
                </div>
                <h4 className="text-sm font-medium text-slate-700">Additional Information</h4>
                <span className="text-xs text-slate-400 ml-auto">Click to {showAdditional ? 'collapse' : 'expand'}</span>
              </button>

              {showAdditional && (
                <div className="space-y-6">

                  {/* Personal Details */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded bg-blue-50 flex items-center justify-center">
                        <User2 className="w-3 h-3 text-blue-600" />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Personal Details</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        label="Alternate Phone"
                        value={modal.formData.alternatePhone}
                        onChange={e => modal.setFormData({ ...modal.formData, alternatePhone: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                      <Select
                        label="Blood Group"
                        value={modal.formData.bloodGroup}
                        onChange={e => modal.setFormData({ ...modal.formData, bloodGroup: e.target.value })}
                        options={[
                          { value: '', label: 'Select' },
                          { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' },
                          { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' },
                          { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' },
                          { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' },
                        ]}
                      />
                      <Input
                        label="Nationality"
                        value={modal.formData.nationality}
                        onChange={e => modal.setFormData({ ...modal.formData, nationality: e.target.value })}
                        placeholder="Indian"
                      />
                      <Input
                        label="Religion"
                        value={modal.formData.religion}
                        onChange={e => modal.setFormData({ ...modal.formData, religion: e.target.value })}
                        placeholder="Religion"
                      />
                      <Input
                        label="City"
                        value={modal.formData.city}
                        onChange={e => modal.setFormData({ ...modal.formData, city: e.target.value })}
                        placeholder="City"
                      />
                      <Input
                        label="State"
                        value={modal.formData.state}
                        onChange={e => modal.setFormData({ ...modal.formData, state: e.target.value })}
                        placeholder="State"
                      />
                      <Input
                        label="Postal Code"
                        value={modal.formData.postalCode}
                        onChange={e => modal.setFormData({ ...modal.formData, postalCode: e.target.value })}
                        placeholder="400001"
                      />
                      <Input
                        label="Previous School"
                        value={modal.formData.previousSchool}
                        onChange={e => modal.setFormData({ ...modal.formData, previousSchool: e.target.value })}
                        placeholder="Previous school name"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-50" />

                  {/* Emergency Contact */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded bg-red-50 flex items-center justify-center">
                        <AlertTriangle className="w-3 h-3 text-red-600" />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Emergency Contact</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        label="Contact Name"
                        value={modal.formData.emergencyContactName}
                        onChange={e => modal.setFormData({ ...modal.formData, emergencyContactName: e.target.value })}
                        placeholder="Emergency contact name"
                      />
                      <Input
                        label="Contact Phone"
                        value={modal.formData.emergencyContact}
                        onChange={e => modal.setFormData({ ...modal.formData, emergencyContact: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                      <Input
                        label="Relation"
                        value={modal.formData.emergencyRelation}
                        onChange={e => modal.setFormData({ ...modal.formData, emergencyRelation: e.target.value })}
                        placeholder="Uncle, Neighbour, etc."
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-50" />

                  {/* Medical Information */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded bg-pink-50 flex items-center justify-center">
                        <Heart className="w-3 h-3 text-pink-600" />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Medical Information</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Medical Conditions"
                        value={modal.formData.medicalConditions}
                        onChange={e => modal.setFormData({ ...modal.formData, medicalConditions: e.target.value })}
                        placeholder="Any known medical conditions"
                      />
                      <Input
                        label="Allergies"
                        value={modal.formData.allergies}
                        onChange={e => modal.setFormData({ ...modal.formData, allergies: e.target.value })}
                        placeholder="Any known allergies"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-50" />

                  {/* Father Information */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded bg-amber-50 flex items-center justify-center">
                        <Briefcase className="w-3 h-3 text-amber-600" />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Father Information</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        label="Father Name"
                        value={modal.formData.fatherName}
                        onChange={e => modal.setFormData({ ...modal.formData, fatherName: e.target.value })}
                        placeholder="Father's full name"
                      />
                      <Input
                        label="Father Phone"
                        value={modal.formData.fatherPhone}
                        onChange={e => modal.setFormData({ ...modal.formData, fatherPhone: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                      <Input
                        label="Father Email"
                        type="email"
                        value={modal.formData.fatherEmail}
                        onChange={e => modal.setFormData({ ...modal.formData, fatherEmail: e.target.value })}
                        placeholder="father@email.com"
                      />
                      <Input
                        label="Occupation"
                        value={modal.formData.fatherOccupation}
                        onChange={e => modal.setFormData({ ...modal.formData, fatherOccupation: e.target.value })}
                        placeholder="Occupation"
                      />
                      <Input
                        label="Workplace"
                        value={modal.formData.fatherWorkplace}
                        onChange={e => modal.setFormData({ ...modal.formData, fatherWorkplace: e.target.value })}
                        placeholder="Workplace / Company"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-50" />

                  {/* Mother Information */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded bg-amber-50 flex items-center justify-center">
                        <Briefcase className="w-3 h-3 text-amber-600" />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mother Information</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        label="Mother Name"
                        value={modal.formData.motherName}
                        onChange={e => modal.setFormData({ ...modal.formData, motherName: e.target.value })}
                        placeholder="Mother's full name"
                      />
                      <Input
                        label="Mother Phone"
                        value={modal.formData.motherPhone}
                        onChange={e => modal.setFormData({ ...modal.formData, motherPhone: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                      <Input
                        label="Mother Email"
                        type="email"
                        value={modal.formData.motherEmail}
                        onChange={e => modal.setFormData({ ...modal.formData, motherEmail: e.target.value })}
                        placeholder="mother@email.com"
                      />
                      <Input
                        label="Occupation"
                        value={modal.formData.motherOccupation}
                        onChange={e => modal.setFormData({ ...modal.formData, motherOccupation: e.target.value })}
                        placeholder="Occupation"
                      />
                      <Input
                        label="Workplace"
                        value={modal.formData.motherWorkplace}
                        onChange={e => modal.setFormData({ ...modal.formData, motherWorkplace: e.target.value })}
                        placeholder="Workplace / Company"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-50" />

                  {/* Guardian Information */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded bg-teal-50 flex items-center justify-center">
                        <User2 className="w-3 h-3 text-teal-600" />
                      </div>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Guardian Information</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Guardian Name"
                        value={modal.formData.guardianName}
                        onChange={e => modal.setFormData({ ...modal.formData, guardianName: e.target.value })}
                        placeholder="Guardian's full name"
                      />
                      <Input
                        label="Relation"
                        value={modal.formData.guardianRelation}
                        onChange={e => modal.setFormData({ ...modal.formData, guardianRelation: e.target.value })}
                        placeholder="Relation to student"
                      />
                      <Input
                        label="Guardian Phone"
                        value={modal.formData.guardianPhone}
                        onChange={e => modal.setFormData({ ...modal.formData, guardianPhone: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                      <Input
                        label="Guardian Email"
                        type="email"
                        value={modal.formData.guardianEmail}
                        onChange={e => modal.setFormData({ ...modal.formData, guardianEmail: e.target.value })}
                        placeholder="guardian@email.com"
                      />
                    </div>
                  </div>

                </div>
              )}
            </div>

            <div className="h-px bg-slate-100" />

            {/* Status toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => modal.setFormData({ ...modal.formData, isActive: !modal.formData.isActive })}
                className={`relative w-11 h-6 rounded-full transition-colors ${modal.formData.isActive ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${modal.formData.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <p className="text-sm font-medium text-slate-700">Active Student</p>
                <p className="text-xs text-slate-400">Inactive students will not appear in attendance or class lists</p>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <Button variant="secondary" onClick={handleCloseModal} disabled={modal.isSaving}>Cancel</Button>
            <Button onClick={handleSubmit} isLoading={modal.isSaving}>
              {modal.editingEntity ? 'Save Changes' : 'Create Student'}
            </Button>
          </div>
        </Modal>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• VIEW MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <Modal
          isOpen={modal.isViewModalOpen}
          onClose={() => modal.setIsViewModalOpen(false)}
          title="Student Profile"
          subtitle="Detailed student information"
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
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">{modal.viewingEntity.studentId}</span>
                    <Badge variant={modal.viewingEntity.isActive ? 'success' : 'danger'} size="sm" dot>
                      {modal.viewingEntity.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="info" size="sm">
                      {modal.viewingEntity.classId.replace('class-', 'Class ')} &middot; {modal.viewingEntity.sectionId}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Enrolled {format(new Date(modal.viewingEntity.enrollmentDate), 'MMMM dd, yyyy')}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {([
                  { id: 'personal' as const, label: 'Personal', icon: User2 },
                  { id: 'academic' as const, label: 'Academic', icon: BookOpen },
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
                  <InfoRow icon={Hash} label="Student ID" value={modal.viewingEntity.studentId} mono />
                  <InfoRow icon={Shield} label="Gender" value={modal.viewingEntity.gender} />
                  <InfoRow icon={Calendar} label="Date of Birth" value={format(new Date(modal.viewingEntity.dateOfBirth), 'MMMM dd, yyyy')} />
                  <InfoRow icon={MapPin} label="Address" value={modal.viewingEntity.address} span2 />
                </div>
              )}

              {viewTab === 'academic' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow icon={BookOpen} label="Class & Section" value={`${modal.viewingEntity.classId.replace('class-', 'Class ')} â€” Section ${modal.viewingEntity.sectionId}`} />
                  <InfoRow icon={Hash} label="Roll Number" value={modal.viewingEntity.rollNumber} mono />
                  <InfoRow icon={Calendar} label="Enrollment Date" value={format(new Date(modal.viewingEntity.enrollmentDate), 'MMMM dd, yyyy')} />
                  <InfoRow icon={Clock} label="Record Created" value={format(new Date(modal.viewingEntity.createdAt), 'MMMM dd, yyyy')} />
                </div>
              )}

              {viewTab === 'contact' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow icon={Mail} label="Student Email" value={modal.viewingEntity.email || 'Not provided'} />
                  <InfoRow icon={Phone} label="Student Phone" value={modal.viewingEntity.phone || 'Not provided'} />
                  <InfoRow icon={Phone} label="Parent Phone" value={modal.viewingEntity.parentPhone} />
                  <InfoRow icon={Mail} label="Parent Email" value={modal.viewingEntity.parentEmail || 'Not provided'} />
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button variant="secondary" onClick={() => modal.setIsViewModalOpen(false)}>Close</Button>
                <Button onClick={() => { modal.setIsViewModalOpen(false); handleOpenModal(modal.viewingEntity!); }}>
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Student
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• DELETE DIALOG â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <ConfirmDialog
          isOpen={modal.deleteDialog.isOpen}
          onClose={modal.closeDelete}
          onConfirm={modal.deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete}
          title={modal.deleteDialog.id === '__bulk__' ? 'Delete Students' : 'Delete Student'}
          message={`Are you sure you want to delete ${modal.deleteDialog.name}? This action will mark ${modal.deleteDialog.id === '__bulk__' ? 'them' : 'the student'} as inactive.`}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
          isLoading={modal.isDeleting}
        />
      </div>

      {/* â•â•â•â•â•â• CREDENTIALS MODAL â•â•â•â•â•â• */}
      {createdCredentials && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Student Account Created</h2>
                <p className="text-sm text-slate-500">Share these login credentials with the student</p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Username</p>
                <p className="text-base font-mono font-semibold text-slate-800">{createdCredentials.username}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Password</p>
                <p className="text-base font-mono font-semibold text-slate-800">{createdCredentials.password}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
                <span className="text-blue-500 text-sm">â„¹ï¸</span>
                <p className="text-xs text-blue-700">Student can change their password after first login. These credentials are only shown once.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(`Username: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`);
                  toast.success('Copied to clipboard');
                }}
              >
                Copy
              </Button>
              <Button
                className="flex-1"
                onClick={() => { setCreatedCredentials(null); setShowSuccess(true); setTimeout(() => setShowSuccess(false), 2200); }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â• SUCCESS ANIMATION OVERLAY â•â•â•â•â•â• */}
      {showSuccess && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 flex flex-col items-center gap-3 animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-lg font-semibold text-slate-800">Saved!</p>
            <p className="text-sm text-slate-400">Student record updated successfully</p>
          </div>
        </div>
      )}
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

