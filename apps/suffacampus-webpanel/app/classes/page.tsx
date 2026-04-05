'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ClassService } from '@/services/classService';
import { Class, Section } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Input, Select, EmptyState, ConfirmDialog, Badge, ProfileAvatar } from '@/components/common';
import StatCard from '@/components/dashboard/StatCard';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import {
  Plus, Pencil, Trash2, Search, Download, Eye, X, Users, GraduationCap,
  Users2, BookOpen, Layers, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp,
  ArrowDown, ChevronLeft, ChevronRight, Hash, User2, Building2, Printer, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { PAGE_SIZE_OPTIONS, getErrorMessage } from '@/lib/utils';

type SortField = 'className' | 'grade' | 'sections' | 'capacity';
type SortDir = 'asc' | 'desc';

export default function ClassesPage() {
  useDocumentTitle('Classes');
  const { currentSchool } = useAuthStore();
  const queryClient = useQueryClient();

  // â”€â”€ Data fetching via React Query â”€â”€
  const { data: classes = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Class[]>({
    queryKey: ['classes'],
    path: '/classes/all',
  });
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active'>('active');

  // Sort & pagination
  const [sortField, setSortField] = useState<SortField>('grade');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [editingSection, setEditingSection] = useState<{ classId: string; section: Section | null } | null>(null);
  const [viewingClass, setViewingClass] = useState<Class | null>(null);
  const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(new Set());

  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string | null; name: string; type: 'class' | 'section'; classId?: string }>({
    isOpen: false, id: null, name: '', type: 'class',
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Class form
  const [classFormData, setClassFormData] = useState({ className: '', grade: 1, capacity: 60, isActive: true });
  // Section form
  const [sectionFormData, setSectionFormData] = useState({ id: '', sectionName: '', capacity: 60, teacherId: '', teacherName: '', studentsCount: 0 });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Stats
  const [stats, setStats] = useState({ totalClasses: 0, totalSections: 0, totalCapacity: 0, totalStudents: 0, averageClassSize: 0, occupancyRate: 0 });

  useEffect(() => {
    const loadStats = async () => {
      const s = await ClassService.getClassStats();
      setStats(s);
    };
    loadStats();
  }, [classes]);

  // Filter â†’ Sort â†’ Paginate
  const filteredClasses = useMemo(() => {
    let list = classes;
    if (filterStatus === 'active') list = list.filter(c => c.isActive !== false);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.className.toLowerCase().includes(q) ||
        c.grade.toString().includes(q) ||
        c.sections.some(s => s.sectionName.toLowerCase().includes(q) || s.teacherName?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [classes, searchTerm, filterStatus]);

  const sortedClasses = useMemo(() => {
    const sorted = [...filteredClasses];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'className': cmp = a.className.localeCompare(b.className); break;
        case 'grade': cmp = a.grade - b.grade; break;
        case 'sections': cmp = a.sections.length - b.sections.length; break;
        case 'capacity': cmp = a.capacity - b.capacity; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredClasses, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedClasses.length / pageSize));
  const paginatedClasses = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedClasses.slice(start, start + pageSize);
  }, [sortedClasses, page, pageSize]);

  useEffect(() => { setPage(1); }, [searchTerm, filterStatus, sortField, sortDir]);

  // Selection
  const allOnPageSelected = paginatedClasses.length > 0 && paginatedClasses.every(c => selectedIds.has(c.id));
  const someOnPageSelected = paginatedClasses.some(c => selectedIds.has(c.id));
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) paginatedClasses.forEach(c => next.delete(c.id));
      else paginatedClasses.forEach(c => next.add(c.id));
      return next;
    });
  }, [allOnPageSelected, paginatedClasses]);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  // Sort toggle
  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  // Expand toggle
  const toggleExpand = (id: string) => {
    setExpandedClassIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  // Active filters
  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (searchTerm) chips.push({ key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') });
    return chips;
  }, [searchTerm]);

  // â”€â”€ Form Helpers â”€â”€
  const resetClassForm = () => { setClassFormData({ className: '', grade: 1, capacity: 60, isActive: true }); setFormErrors({}); setEditingClass(null); };
  const resetSectionForm = () => { setSectionFormData({ id: '', sectionName: '', capacity: 60, teacherId: '', teacherName: '', studentsCount: 0 }); setFormErrors({}); setEditingSection(null); };

  const handleOpenClassModal = (classData?: Class) => {
    if (classData) { setEditingClass(classData); setClassFormData({ className: classData.className, grade: classData.grade, capacity: classData.capacity, isActive: classData.isActive }); }
    else resetClassForm();
    setIsClassModalOpen(true);
  };
  const handleCloseClassModal = () => { setIsClassModalOpen(false); resetClassForm(); };

  const handleOpenSectionModal = (classId: string, section?: Section) => {
    if (section) { setEditingSection({ classId, section }); setSectionFormData({ ...section, teacherId: section.teacherId || '', teacherName: section.teacherName || '' }); }
    else { setEditingSection({ classId, section: null }); resetSectionForm(); }
    setIsSectionModalOpen(true);
  };
  const handleCloseSectionModal = () => { setIsSectionModalOpen(false); resetSectionForm(); };

  const validateClassForm = () => {
    const errors: Record<string, string> = {};
    if (!classFormData.className) errors.className = 'Class name is required';
    if (!classFormData.grade || classFormData.grade < 1 || classFormData.grade > 12) errors.grade = 'Valid grade (1-12) is required';
    if (!classFormData.capacity || classFormData.capacity <= 0) errors.capacity = 'Valid capacity is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSectionForm = () => {
    const errors: Record<string, string> = {};
    if (!sectionFormData.sectionName) errors.sectionName = 'Section name is required';
    if (!sectionFormData.capacity || sectionFormData.capacity <= 0) errors.capacity = 'Valid capacity is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitClass = async () => {
    if (!validateClassForm()) { toast.error('Please fill in all required fields'); return; }
    setIsSaving(true);
    try {
      if (editingClass) {
        await ClassService.updateClass(editingClass.id, { ...classFormData, sections: editingClass.sections });
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        toast.success('Class updated successfully');
      } else {
        await ClassService.createClass({ ...classFormData, sections: [] });
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        toast.success('Class created successfully');
      }
      handleCloseClassModal();
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setIsSaving(false); }
  };

  const handleSubmitSection = async () => {
    if (!validateSectionForm()) { toast.error('Please fill in all required fields'); return; }
    if (!editingSection) return;
    setIsSaving(true);
    try {
      if (editingSection.section) {
        await ClassService.updateSection(editingSection.classId, editingSection.section.id, sectionFormData);
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        toast.success('Section updated successfully');
      } else {
        const newSection: Section = { ...sectionFormData, id: `sec-${Date.now()}` };
        await ClassService.addSection(editingSection.classId, newSection);
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        toast.success('Section added successfully');
      }
      handleCloseSectionModal();
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setIsSaving(false); }
  };

  const handleDeleteClass = (id: string, name: string) => { setDeleteDialog({ isOpen: true, id, name, type: 'class' }); };
  const handleDeleteSection = (classId: string, sectionId: string, sectionName: string) => { setDeleteDialog({ isOpen: true, id: sectionId, name: sectionName, type: 'section', classId }); };

  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    setIsDeleting(true);
    try {
      if (deleteDialog.type === 'class') {
        await ClassService.deleteClass(deleteDialog.id);
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        toast.success('Class deleted successfully');
      } else if (deleteDialog.classId) {
        await ClassService.deleteSection(deleteDialog.classId, deleteDialog.id);
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        toast.success('Section deleted successfully');
      }
      setDeleteDialog({ isOpen: false, id: null, name: '', type: 'class' });
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setIsDeleting(false); }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setDeleteDialog({ isOpen: true, id: '__bulk__', name: `${selectedIds.size} class${selectedIds.size > 1 ? 'es' : ''}`, type: 'class' });
  };
  const confirmBulkDelete = async () => {
    setIsDeleting(true);
    try {
      for (const id of Array.from(selectedIds)) await ClassService.deleteClass(id);
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success(`${selectedIds.size} class(es) deleted`);
      setSelectedIds(new Set());
      setDeleteDialog({ isOpen: false, id: null, name: '', type: 'class' });
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setIsDeleting(false); }
  };

  const handleViewClass = (classData: Class) => { setViewingClass(classData); setIsViewModalOpen(true); };

  const classExportHeaders = ['Class', 'Grade', 'Section', 'Capacity', 'Teacher', 'Students', 'Occupancy %'];
  const classExportRows = filteredClasses.flatMap(c => c.sections.map(s => [
    c.className, String(c.grade), s.sectionName, String(s.capacity), s.teacherName || '', String(s.studentsCount), String(Math.round((s.studentsCount / s.capacity) * 100)),
  ]));

  const handlePrint = () => {
    exportToPrint({ title: 'Classes & Sections', schoolName: currentSchool?.name || 'SuffaCampus School', headers: classExportHeaders, rows: classExportRows, filename: `classes-${format(new Date(), 'yyyy-MM-dd')}` });
  };
  const handleCSV = () => {
    exportToCSV({ title: 'Classes & Sections', schoolName: currentSchool?.name || 'SuffaCampus School', headers: classExportHeaders, rows: classExportRows, filename: `classes-${format(new Date(), 'yyyy-MM-dd')}` });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading classes...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Classes & Sections</h1>
              <p className="text-base text-slate-500 mt-1">Manage school classes and their sections</p>
              {lastSynced && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-xs text-emerald-600 font-medium">Live synced Â· {format(lastSynced, 'h:mm:ss a')}</span>
                </div>
              )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button variant="secondary" onClick={handleBulkDelete}>
                <Trash2 className="w-4 h-4 text-red-500" /><span className="text-red-600">Delete ({selectedIds.size})</span>
              </Button>
            )}
            <Button variant="secondary" onClick={handlePrint}><Printer className="w-4 h-4" /><span className="hidden sm:inline">Print</span></Button>
            <Button variant="secondary" onClick={handleCSV}><Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span></Button>
            <Button onClick={() => handleOpenClassModal()}><Plus className="w-4 h-4" /><span>Add Class</span></Button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Classes" value={stats.totalClasses} icon={GraduationCap} color="blue" subtitle="Total active classes" loading={loading} />
          <StatCard title="Total Students" value={stats.totalStudents} icon={Users2} color="emerald" subtitle={`${stats.occupancyRate}% occupancy`} loading={loading} />
          <StatCard title="Sections" value={stats.totalSections} icon={Layers} color="amber" subtitle="Across all classes" loading={loading} />
          <StatCard title="Capacity" value={stats.totalCapacity} icon={BookOpen} color="violet" subtitle="Total seat capacity" loading={loading} />
        </div>

        {/* Filter bar */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search by class name, grade, section or teacher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <div className="filter-tabs mr-2">
              {(['all', 'active'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`filter-tab ${filterStatus === s ? 'filter-tab-active' : 'filter-tab-inactive'}`}>
                  {s === 'all' ? 'All' : 'Active'}<span className="ml-1.5 text-xs opacity-70">{s === 'all' ? classes.length : classes.filter(c => c.isActive !== false).length}</span>
                </button>
              ))}
            </div>
            {activeFilters.map(chip => (
              <span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-100">
                {chip.label}<button onClick={chip.clear} className="hover:text-blue-800 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {activeFilters.length > 0 && (
              <button onClick={() => { setSearchTerm(''); setFilterStatus('active'); }} className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 ml-1 transition-colors"><X className="w-3 h-3" /> Clear all</button>
            )}
            <span className="ml-auto text-xs text-slate-400 tabular-nums">{filteredClasses.length} result{filteredClasses.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-slate-700">Class Records</h3>
              <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">{sortedClasses.length}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Showing {sortedClasses.length > 0 ? (page - 1) * pageSize + 1 : 0}â€“{Math.min(page * pageSize, sortedClasses.length)}</span>
              <div className="w-[100px]">
                <Select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n} rows` }))} />
              </div>
            </div>
          </div>

          {paginatedClasses.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="pl-5 pr-2 py-3 w-10">
                        <input type="checkbox" checked={allOnPageSelected}
                          ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                          onChange={toggleSelectAll}
                          className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" />
                      </th>
                      <th className="px-4 py-3 w-8"></th>
                      {[
                        { label: 'Class', field: 'className' as SortField },
                        { label: 'Grade', field: 'grade' as SortField },
                        { label: 'Sections', field: 'sections' as SortField },
                        { label: 'Capacity', field: 'capacity' as SortField },
                        { label: 'Occupancy', field: null },
                        { label: 'Status', field: null },
                        { label: 'Actions', field: null },
                      ].map((col, i) => (
                        <th key={i} onClick={() => col.field && toggleSort(col.field)}
                          className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.field ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}`}>
                          <span className="flex items-center gap-1">{col.label}{col.field && <SortIcon field={col.field} />}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedClasses.map(cls => {
                      const isSelected = selectedIds.has(cls.id);
                      const isExpanded = expandedClassIds.has(cls.id);
                      const totalStudents = cls.sections.reduce((s, sec) => s + sec.studentsCount, 0);
                      const totalCap = cls.sections.reduce((s, sec) => s + sec.capacity, 0) || cls.capacity;
                      const occupancy = totalCap > 0 ? Math.round((totalStudents / totalCap) * 100) : 0;
                      return (
                        <>
                          <tr key={cls.id} className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                            <td className="pl-5 pr-2 py-3">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(cls.id)} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" />
                            </td>
                            <td className="px-2 py-3">
                              <button onClick={() => toggleExpand(cls.id)} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <ProfileAvatar name={cls.className} size="sm" />
                                <button onClick={() => handleViewClass(cls)} className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left">{cls.className}</button>
                              </div>
                            </td>
                            <td className="px-4 py-3"><span className="font-mono text-sm font-medium text-slate-700 bg-slate-50 px-2 py-0.5 rounded-md">{cls.grade}</span></td>
                            <td className="px-4 py-3"><span className="text-sm font-medium text-slate-700">{cls.sections.length}</span></td>
                            <td className="px-4 py-3"><span className="text-sm text-slate-700">{cls.capacity}</span></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 rounded-full h-1.5 w-20">
                                  <div className={`h-1.5 rounded-full ${occupancy >= 90 ? 'bg-red-500' : occupancy >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(occupancy, 100)}%` }} />
                                </div>
                                <span className="text-xs font-medium text-slate-500 tabular-nums">{occupancy}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${cls.isActive ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cls.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />{cls.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                <button onClick={() => handleOpenSectionModal(cls.id)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Add Section"><Plus className="w-4 h-4" /></button>
                                <button onClick={() => handleViewClass(cls)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                                <button onClick={() => handleOpenClassModal(cls)} className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteClass(cls.id, cls.className)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                          {/* Expanded sections */}
                          {isExpanded && cls.sections.map(sec => {
                            const secOcc = sec.capacity > 0 ? Math.round((sec.studentsCount / sec.capacity) * 100) : 0;
                            return (
                              <tr key={sec.id} className="bg-slate-50 border-l-2 border-blue-200">
                                <td className="pl-5 pr-2 py-2.5"></td>
                                <td className="px-2 py-2.5"></td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2 pl-6">
                                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Section {sec.sectionName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5"></td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-1">
                                    <Users className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-xs font-medium text-slate-600">{sec.studentsCount}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5"><span className="text-xs text-slate-600">{sec.capacity}</span></td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-slate-200 rounded-full h-1.5 w-16"><div className={`h-1.5 rounded-full ${secOcc >= 90 ? 'bg-red-500' : secOcc >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(secOcc, 100)}%` }} /></div>
                                    <span className="text-xs font-medium text-slate-400 tabular-nums">{secOcc}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-xs text-slate-500">{sec.teacherName || 'No teacher'}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => handleOpenSectionModal(cls.id, sec)} className="p-1 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit Section"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteSection(cls.id, sec.id, `Section ${sec.sectionName}`)} className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete Section"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
                  <p className="text-xs text-slate-400">Page <span className="font-semibold text-slate-600">{page}</span> of <span className="font-semibold text-slate-600">{totalPages}</span></p>
                  <div className="flex items-center gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let num: number;
                      if (totalPages <= 5) num = i + 1; else if (page <= 3) num = i + 1; else if (page >= totalPages - 2) num = totalPages - 4 + i; else num = page - 2 + i;
                      return (<button key={num} onClick={() => setPage(num)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${page === num ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-700 border border-transparent hover:border-slate-200'}`}>{num}</button>);
                    })}
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8"><EmptyState icon={<GraduationCap className="w-16 h-16" />} title="No classes found" description={searchTerm ? 'Try adjusting your search' : 'Get started by adding your first class'} action={!searchTerm ? { label: 'Add Class', onClick: () => handleOpenClassModal() } : undefined} /></div>
          )}
        </div>

        {/* Class Modal */}
        <Modal isOpen={isClassModalOpen} onClose={handleCloseClassModal} title={editingClass ? 'Edit Class' : 'Add New Class'} subtitle={editingClass ? `Editing ${editingClass.className}` : 'Fill in the class details'}>
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><GraduationCap className="w-3.5 h-3.5 text-blue-600" /></div>
                <h4 className="text-sm font-medium text-slate-700">Class Details</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Class Name *" value={classFormData.className} onChange={e => setClassFormData({ ...classFormData, className: e.target.value })} error={formErrors.className} placeholder="Class 10" />
                <Input label="Grade *" type="number" value={classFormData.grade.toString()} onChange={e => setClassFormData({ ...classFormData, grade: parseInt(e.target.value) || 0 })} error={formErrors.grade} placeholder="10" />
                <Input label="Capacity *" type="number" value={classFormData.capacity.toString()} onChange={e => setClassFormData({ ...classFormData, capacity: parseInt(e.target.value) || 0 })} error={formErrors.capacity} placeholder="60" />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setClassFormData({ ...classFormData, isActive: !classFormData.isActive })} className={`relative w-11 h-6 rounded-full transition-colors ${classFormData.isActive ? 'bg-blue-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${classFormData.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div><p className="text-sm font-medium text-slate-700">Active Class</p><p className="text-xs text-slate-400">Inactive classes will be hidden from timetable</p></div>
            </div>
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={handleCloseClassModal} disabled={isSaving}>Cancel</Button><Button onClick={handleSubmitClass} isLoading={isSaving}>{editingClass ? 'Save Changes' : 'Create Class'}</Button></div>
        </Modal>

        {/* Section Modal */}
        <Modal isOpen={isSectionModalOpen} onClose={handleCloseSectionModal} title={editingSection?.section ? 'Edit Section' : 'Add Section'} subtitle={editingSection?.section ? `Editing Section ${editingSection.section.sectionName}` : 'Add a new section to the class'}>
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Layers className="w-3.5 h-3.5 text-violet-600" /></div>
                <h4 className="text-sm font-medium text-slate-700">Section Details</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Section Name *" value={sectionFormData.sectionName} onChange={e => setSectionFormData({ ...sectionFormData, sectionName: e.target.value })} error={formErrors.sectionName} placeholder="A" />
                <Input label="Capacity *" type="number" value={sectionFormData.capacity.toString()} onChange={e => setSectionFormData({ ...sectionFormData, capacity: parseInt(e.target.value) || 0 })} error={formErrors.capacity} placeholder="60" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Input label="Class Teacher Name" value={sectionFormData.teacherName} onChange={e => setSectionFormData({ ...sectionFormData, teacherName: e.target.value })} placeholder="Rajesh Kumar" />
                <Input label="Teacher ID" value={sectionFormData.teacherId} onChange={e => setSectionFormData({ ...sectionFormData, teacherId: e.target.value })} placeholder="TCH001" />
              </div>
            </div>
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={handleCloseSectionModal} disabled={isSaving}>Cancel</Button><Button onClick={handleSubmitSection} isLoading={isSaving}>{editingSection?.section ? 'Save Changes' : 'Add Section'}</Button></div>
        </Modal>

        {/* View Modal */}
        <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Class Details" subtitle="Overview of class and sections" size="lg">
          {viewingClass && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <ProfileAvatar name={viewingClass.className} size="xl" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">{viewingClass.className}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">Grade {viewingClass.grade}</span>
                    <Badge variant={viewingClass.isActive ? 'success' : 'danger'} size="sm" dot>{viewingClass.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{viewingClass.sections.length} sections â€¢ Capacity: {viewingClass.capacity}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">Sections</p>
                {viewingClass.sections.length > 0 ? (
                  <div className="space-y-2">
                    {viewingClass.sections.map(sec => {
                      const occ = sec.capacity > 0 ? Math.round((sec.studentsCount / sec.capacity) * 100) : 0;
                      return (
                        <div key={sec.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Section {sec.sectionName}</span>
                            <span className="text-xs text-slate-500">{sec.teacherName || 'No teacher assigned'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">{sec.studentsCount}/{sec.capacity} students</span>
                            <div className="flex items-center gap-1.5">
                              <div className="bg-slate-200 rounded-full h-1.5 w-14"><div className={`h-1.5 rounded-full ${occ >= 90 ? 'bg-red-500' : occ >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(occ, 100)}%` }} /></div>
                              <span className="text-xs text-slate-400 tabular-nums">{occ}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-xs text-slate-400 italic">No sections added yet</p>}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button>
                <Button onClick={() => { setIsViewModalOpen(false); handleOpenClassModal(viewingClass); }}><Pencil className="w-3.5 h-3.5" /> Edit Class</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Delete Dialog */}
        <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, id: null, name: '', type: 'class' })}
          onConfirm={deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete}
          title={`Delete ${deleteDialog.type === 'class' ? 'Class' : 'Section'}`}
          message={`Are you sure you want to delete ${deleteDialog.name}? This action cannot be undone.`}
          confirmText="Delete" cancelText="Cancel" type="danger" isLoading={isDeleting} />
      </div>
    </DashboardLayout>
  );
}

