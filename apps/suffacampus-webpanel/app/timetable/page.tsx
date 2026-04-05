'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { TimetableService } from '@/services/timetableService';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import { Timetable, Period } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Input, Select, EmptyState, ConfirmDialog } from '@/components/common';
import StatCard from '@/components/dashboard/StatCard';
import { useAuthStore } from '@/store/authStore';
import {
  Plus, Pencil, Trash2, Search, Download, Eye, X,
  Clock, CalendarDays, LayoutGrid, BookOpen, Timer,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  GraduationCap, User2, Hash, MapPin, Printer, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { PAGE_SIZE_OPTIONS, getErrorMessage } from '@/lib/utils';
import { timetableSchema, validateFormData } from '@/lib/schemas';
import { DEFAULT_SUBJECTS, DAYS } from '@/lib/constants';

const SUBJECTS = [...DEFAULT_SUBJECTS];
const DAY_COLORS: Record<string, string> = { Monday: 'bg-blue-500', Tuesday: 'bg-violet-500', Wednesday: 'bg-emerald-500', Thursday: 'bg-amber-500', Friday: 'bg-rose-500', Saturday: 'bg-cyan-500' };

type SortField = 'className' | 'day' | 'periods';
type SortDir = 'asc' | 'desc';

export default function TimetablePage() {
  useDocumentTitle('Timetable');
  const { currentSchool } = useAuthStore();
  const queryClient = useQueryClient();

  // â”€â”€ Data fetching via React Query â”€â”€
  const { data: timetables = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Timetable[]>({
    queryKey: ['timetable'],
    path: '/timetable?limit=1000',
  });
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [sortField, setSortField] = useState<SortField>('day');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingTimetable, setEditingTimetable] = useState<Timetable | null>(null);
  const [viewingTimetable, setViewingTimetable] = useState<Timetable | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    classId: '', sectionId: '', className: '', day: '', isActive: true,
    periods: [{ periodNumber: 1, subject: '', teacherId: '', teacherName: '', startTime: '08:00', endTime: '08:45', roomNumber: '' }] as Period[],
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const classOptions = useMemo(() => {
    const unique = [...new Set(timetables.map(t => t.classId))].sort();
    return unique.map(c => ({ value: c, label: c.replace('class-', 'Class ') }));
  }, [timetables]);

  const totalPeriods = useMemo(() => timetables.reduce((s, t) => s + (t.periods?.length || 0), 0), [timetables]);
  const activeDays = useMemo(() => new Set(timetables.filter(t => t.isActive).map(t => t.day)).size, [timetables]);

  const filteredTimetables = useMemo(() => {
    let list = timetables;
    if (searchTerm) { const q = searchTerm.toLowerCase(); list = list.filter(t => (t.className || t.classId).toLowerCase().includes(q) || t.day.toLowerCase().includes(q) || t.periods?.some(p => p.subject.toLowerCase().includes(q))); }
    if (filterDay) list = list.filter(t => t.day === filterDay);
    if (filterClass) list = list.filter(t => t.classId === filterClass);
    return list;
  }, [timetables, searchTerm, filterDay, filterClass]);

  const sortedTimetables = useMemo(() => {
    const dayOrder = Object.fromEntries(DAYS.map((d, i) => [d, i]));
    const sorted = [...filteredTimetables];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'className': cmp = (a.className || a.classId).localeCompare(b.className || b.classId); break;
        case 'day': cmp = (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99); break;
        case 'periods': cmp = (a.periods?.length || 0) - (b.periods?.length || 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredTimetables, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedTimetables.length / pageSize));
  const paginatedTimetables = useMemo(() => { const s = (page - 1) * pageSize; return sortedTimetables.slice(s, s + pageSize); }, [sortedTimetables, page, pageSize]);
  useEffect(() => { setPage(1); }, [searchTerm, filterDay, filterClass, sortField, sortDir]);

  const allOnPageSelected = paginatedTimetables.length > 0 && paginatedTimetables.every(t => selectedIds.has(t.id));
  const someOnPageSelected = paginatedTimetables.some(t => selectedIds.has(t.id));
  const toggleSelectAll = useCallback(() => { setSelectedIds(prev => { const n = new Set(prev); if (allOnPageSelected) paginatedTimetables.forEach(t => n.delete(t.id)); else paginatedTimetables.forEach(t => n.add(t.id)); return n; }); }, [allOnPageSelected, paginatedTimetables]);
  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);

  const toggleSort = (f: SortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc'); } };
  const SortIcon = ({ field }: { field: SortField }) => { if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />; return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />; };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterDay) chips.push({ key: 'day', label: filterDay, clear: () => setFilterDay('') });
    if (filterClass) chips.push({ key: 'class', label: filterClass.replace('class-', 'Class '), clear: () => setFilterClass('') });
    if (searchTerm) chips.push({ key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') });
    return chips;
  }, [filterDay, filterClass, searchTerm]);
  const clearAllFilters = () => { setSearchTerm(''); setFilterDay(''); setFilterClass(''); };

  const resetForm = () => { setFormData({ classId: '', sectionId: '', className: '', day: '', isActive: true, periods: [{ periodNumber: 1, subject: '', teacherId: '', teacherName: '', startTime: '08:00', endTime: '08:45', roomNumber: '' }] }); setFormErrors({}); setEditingTimetable(null); };
  const handleOpenModal = (t?: Timetable) => {
    if (t) { setEditingTimetable(t); setFormData({ classId: t.classId, sectionId: t.sectionId, className: t.className || '', day: t.day, isActive: t.isActive, periods: t.periods?.length ? t.periods : [{ periodNumber: 1, subject: '', teacherId: '', teacherName: '', startTime: '08:00', endTime: '08:45', roomNumber: '' }] }); }
    else resetForm();
    setIsModalOpen(true);
  };
  const handleCloseModal = () => { setIsModalOpen(false); resetForm(); };

  const addPeriod = () => {
    const last = formData.periods[formData.periods.length - 1];
    setFormData(prev => ({ ...prev, periods: [...prev.periods, { periodNumber: prev.periods.length + 1, subject: '', teacherId: '', teacherName: '', startTime: last?.endTime || '09:00', endTime: '', roomNumber: '' }] }));
  };
  const removePeriod = (idx: number) => { setFormData(prev => ({ ...prev, periods: prev.periods.filter((_, i) => i !== idx).map((p, i) => ({ ...p, periodNumber: i + 1 })) })); };
  const updatePeriod = (idx: number, field: keyof Period, value: string | number) => { setFormData(prev => ({ ...prev, periods: prev.periods.map((p, i) => i === idx ? { ...p, [field]: value } : p) })); };

  const validateForm = () => {
    const errors = validateFormData(timetableSchema, formData);
    setFormErrors(errors ?? {});
    return errors === null;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { toast.error('Please fill required fields'); return; }
    setIsSaving(true);
    try {
      if (editingTimetable) { await TimetableService.updateTimetable(editingTimetable.id, formData); queryClient.invalidateQueries({ queryKey: ['timetable'] }); toast.success('Timetable updated'); }
      else { await TimetableService.createTimetable(formData); queryClient.invalidateQueries({ queryKey: ['timetable'] }); toast.success('Timetable created'); }
      handleCloseModal();
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsSaving(false); }
  };

  const handleDelete = (id: string, name: string) => { setDeleteDialog({ isOpen: true, id, name }); };
  const confirmDelete = async () => { if (!deleteDialog.id) return; setIsDeleting(true); try { await TimetableService.deleteTimetable(deleteDialog.id); queryClient.invalidateQueries({ queryKey: ['timetable'] }); toast.success('Deleted'); setDeleteDialog({ isOpen: false, id: null, name: '' }); setSelectedIds(p => { const n = new Set(p); n.delete(deleteDialog.id!); return n; }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };
  const handleBulkDelete = () => { if (selectedIds.size === 0) return; setDeleteDialog({ isOpen: true, id: '__bulk__', name: `${selectedIds.size} timetable${selectedIds.size > 1 ? 's' : ''}` }); };
  const confirmBulkDelete = async () => { setIsDeleting(true); try { for (const id of Array.from(selectedIds)) await TimetableService.deleteTimetable(id); queryClient.invalidateQueries({ queryKey: ['timetable'] }); toast.success(`${selectedIds.size} deleted`); setSelectedIds(new Set()); setDeleteDialog({ isOpen: false, id: null, name: '' }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };

  const handleViewTimetable = (t: Timetable) => { setViewingTimetable(t); setIsViewModalOpen(true); };

  const handleExportPrint = () => {
    const headers = ['Class', 'Day', 'Periods', 'Subjects'];
    const rows = filteredTimetables.map(t => [t.className || t.classId, t.day, String(t.periods?.length || 0), (t.periods?.map(p => p.subject).join('; ')) || '']);
    exportToPrint({ title: 'Timetable', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `timetable-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('Print preview opened');
  };

  const handleExportCSV = () => {
    const headers = ['Class', 'Day', 'Periods', 'Subjects'];
    const rows = filteredTimetables.map(t => [t.className || t.classId, t.day, String(t.periods?.length || 0), (t.periods?.map(p => p.subject).join('; ')) || '']);
    exportToCSV({ title: 'Timetable', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `timetable-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('CSV exported');
  };

  if (loading) { return (<DashboardLayout><div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Loading timetable...</p></div></div></DashboardLayout>); }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Timetable</h1>
              <p className="text-base text-slate-500 mt-1">Manage class schedules and periods</p>
              {lastSynced && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-xs text-emerald-600 font-medium">Live synced Â· {format(lastSynced, 'h:mm:ss a')}</span>
                </div>
              )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && <Button variant="secondary" onClick={handleBulkDelete}><Trash2 className="w-4 h-4 text-red-500" /><span className="text-red-600">Delete ({selectedIds.size})</span></Button>}
            <Button variant="secondary" onClick={handleExportPrint}><Printer className="w-4 h-4" /><span className="hidden sm:inline">Print</span></Button>
            <Button variant="secondary" onClick={handleExportCSV}><Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span></Button>
            <Button onClick={() => handleOpenModal()}><Plus className="w-4 h-4" /><span>Add Schedule</span></Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Schedules" value={timetables.length} icon={LayoutGrid} color="blue" subtitle="Total timetable entries" loading={loading} />
          <StatCard title="Periods" value={totalPeriods} icon={Clock} color="emerald" subtitle="Total periods" loading={loading} />
          <StatCard title="Active Days" value={activeDays} icon={CalendarDays} color="violet" subtitle="Days scheduled" loading={loading} />
          <StatCard title="Classes" value={classOptions.length} icon={GraduationCap} color="amber" subtitle="Classes with schedules" loading={loading} />
        </div>

        {/* Filters */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search class, day, or subject..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all" /></div>
            <div className="flex gap-2 shrink-0">
              <div className="w-[140px]"><Select value={filterDay} onChange={e => setFilterDay(e.target.value)} placeholder="All Days" options={DAYS.map(d => ({ value: d, label: d }))} /></div>
              <div className="w-[140px]"><Select value={filterClass} onChange={e => setFilterClass(e.target.value)} placeholder="All Classes" options={classOptions} /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            {activeFilters.map(chip => (<span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-100">{chip.label}<button onClick={chip.clear} className="hover:text-blue-800 ml-0.5"><X className="w-3 h-3" /></button></span>))}
            {activeFilters.length > 0 && <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 ml-1 transition-colors"><X className="w-3 h-3" /> Clear all</button>}
            <span className="ml-auto text-xs text-slate-400 tabular-nums">{filteredTimetables.length} schedule{filteredTimetables.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2"><h3 className="text-[14px] font-semibold text-slate-700">Timetable Records</h3><span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">{sortedTimetables.length}</span></div>
            <div className="flex items-center gap-3"><span className="text-xs text-slate-400">Showing {sortedTimetables.length > 0 ? (page - 1) * pageSize + 1 : 0}â€“{Math.min(page * pageSize, sortedTimetables.length)}</span><div className="w-[100px]"><Select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n} rows` }))} /></div></div>
          </div>
          {paginatedTimetables.length > 0 ? (
            <>
              <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="bg-slate-50 border-b border-slate-200">
                <th className="pl-5 pr-2 py-3 w-10"><input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }} onChange={toggleSelectAll} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></th>
                <th className="px-3 py-3 w-8"></th>
                {[
                  { label: 'Class', field: 'className' as SortField, w: 'min-w-[150px]' }, { label: 'Day', field: 'day' as SortField, w: '' },
                  { label: 'Periods', field: 'periods' as SortField, w: '' }, { label: 'Subjects', field: null, w: 'min-w-[200px]' },
                  { label: 'Active', field: null, w: '' }, { label: 'Actions', field: null, w: 'w-[100px]' },
                ].map((col, i) => (
                  <th key={i} onClick={() => col.field && toggleSort(col.field)} className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.w} ${col.field ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}`}><span className="flex items-center gap-1">{col.label}{col.field && <SortIcon field={col.field} />}</span></th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTimetables.map(t => {
                  const isSelected = selectedIds.has(t.id);
                  const isExpanded = expandedId === t.id;
                  return (
                    <React.Fragment key={t.id}>
                      <tr className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <td className="pl-5 pr-2 py-3"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(t.id)} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></td>
                        <td className="px-3 py-3"><button onClick={() => setExpandedId(isExpanded ? null : t.id)} className={`p-0.5 rounded transition-transform ${isExpanded ? 'rotate-90' : ''}`}><ChevronRight className="w-4 h-4 text-slate-400" /></button></td>
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg ${DAY_COLORS[t.day] || 'bg-slate-500'} flex items-center justify-center text-white text-xs font-medium shrink-0`}>{(t.className || t.classId)[0]}</div><div className="min-w-0"><button onClick={() => handleViewTimetable(t)} className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left">{t.className || t.classId}</button><p className="text-xs text-slate-400">Section {t.sectionId || 'A'}</p></div></div></td>
                        <td className="px-4 py-3"><span className={`text-xs font-medium text-white px-2 py-0.5 rounded ${DAY_COLORS[t.day] || 'bg-slate-500'}`}>{t.day}</span></td>
                        <td className="px-4 py-3"><span className="text-sm font-medium text-slate-700 tabular-nums">{t.periods?.length || 0}</span></td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(t.periods || []).slice(0, 3).map((p, i) => (<span key={i} className="text-xs font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{p.subject}</span>))}{(t.periods?.length || 0) > 3 && <span className="text-xs text-slate-400">+{(t.periods?.length || 0) - 3}</span>}</div></td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${t.isActive ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-50'}`}><span className={`w-1.5 h-1.5 rounded-full ${t.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />{t.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td className="px-4 py-3"><div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"><button onClick={() => handleViewTimetable(t)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Eye className="w-4 h-4" /></button><button onClick={() => handleOpenModal(t)} className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="w-4 h-4" /></button><button onClick={() => handleDelete(t.id, `${t.className || t.classId} - ${t.day}`)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button></div></td>
                      </tr>
                      {isExpanded && (t.periods || []).length > 0 && (
                        <tr><td colSpan={9} className="bg-slate-25 px-8 py-3 border-b border-slate-100">
                          <div className="grid gap-2">{(t.periods || []).map((p, i) => (
                            <div key={i} className="flex items-center gap-4 px-4 py-2.5 bg-white rounded-lg border border-slate-100"><span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded w-5 h-5 flex items-center justify-center">{p.periodNumber}</span><span className="text-sm font-medium text-slate-700 w-32">{p.subject}</span><span className="text-xs text-slate-500 w-20 flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime}â€“{p.endTime}</span>{p.teacherName && <span className="text-xs text-slate-500 flex items-center gap-1"><User2 className="w-3 h-3" />{p.teacherName}</span>}{p.roomNumber && <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{p.roomNumber}</span>}</div>
                          ))}</div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody></table></div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
                  <p className="text-xs text-slate-400">Page <span className="font-semibold text-slate-600">{page}</span> of <span className="font-semibold text-slate-600">{totalPages}</span></p>
                  <div className="flex items-center gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { let num: number; if (totalPages <= 5) num = i + 1; else if (page <= 3) num = i + 1; else if (page >= totalPages - 2) num = totalPages - 4 + i; else num = page - 2 + i; return (<button key={num} onClick={() => setPage(num)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${page === num ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-700 border border-transparent hover:border-slate-200'}`}>{num}</button>); })}
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </>
          ) : (<div className="p-8"><EmptyState icon={<CalendarDays className="w-16 h-16" />} title="No timetables found" description={searchTerm || filterDay || filterClass ? 'Try adjusting your filters' : 'Get started by adding a schedule'} action={!searchTerm ? { label: 'Add Schedule', onClick: () => handleOpenModal() } : undefined} /></div>)}
        </div>

        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingTimetable ? 'Edit Timetable' : 'Create Timetable'} subtitle={editingTimetable ? `Editing ${editingTimetable.className || editingTimetable.classId} - ${editingTimetable.day}` : 'Set up class schedule'} size="xl">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><GraduationCap className="w-3.5 h-3.5 text-blue-600" /></div><h4 className="text-sm font-medium text-slate-700">Schedule Info</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Class *" value={formData.classId} onChange={e => setFormData({ ...formData, classId: e.target.value })} error={formErrors.classId} placeholder="class-10" />
                <Input label="Section" value={formData.sectionId} onChange={e => setFormData({ ...formData, sectionId: e.target.value })} placeholder="A" />
                <Select label="Day *" value={formData.day} onChange={e => setFormData({ ...formData, day: e.target.value })} error={formErrors.day} options={DAYS.map(d => ({ value: d, label: d }))} />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Clock className="w-3.5 h-3.5 text-violet-600" /></div><h4 className="text-sm font-medium text-slate-700">Periods</h4></div>
                <button onClick={addPeriod} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"><Plus className="w-3 h-3" />Add Period</button>
              </div>
              {formErrors.periods && <p className="text-xs text-red-500 mb-2">{formErrors.periods}</p>}
              <div className="space-y-3">{formData.periods.map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="col-span-1 flex items-center justify-center"><span className="text-xs font-bold text-blue-600 bg-blue-50 w-6 h-6 flex items-center justify-center rounded">{p.periodNumber}</span></div>
                  <div className="col-span-3"><Select value={p.subject} onChange={e => updatePeriod(idx, 'subject', e.target.value)} placeholder="Subject" options={SUBJECTS.map(s => ({ value: s, label: s }))} /></div>
                  <div className="col-span-2"><Input type="time" value={p.startTime} onChange={e => updatePeriod(idx, 'startTime', e.target.value)} placeholder="Start" /></div>
                  <div className="col-span-2"><Input type="time" value={p.endTime} onChange={e => updatePeriod(idx, 'endTime', e.target.value)} placeholder="End" /></div>
                  <div className="col-span-2"><Input value={p.teacherName || ''} onChange={e => updatePeriod(idx, 'teacherName', e.target.value)} placeholder="Teacher" /></div>
                  <div className="col-span-1"><Input value={p.roomNumber || ''} onChange={e => updatePeriod(idx, 'roomNumber', e.target.value)} placeholder="Room" /></div>
                  <div className="col-span-1 flex justify-center">{formData.periods.length > 1 && <button onClick={() => removePeriod(idx)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}</div>
                </div>
              ))}</div>
            </div>
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={handleCloseModal} disabled={isSaving}>Cancel</Button><Button onClick={handleSubmit} isLoading={isSaving}>{editingTimetable ? 'Save Changes' : 'Create Timetable'}</Button></div>
        </Modal>

        {/* View Modal */}
        <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Timetable Details" subtitle="Schedule details" size="lg">
          {viewingTimetable && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <div className={`w-14 h-14 rounded-xl ${DAY_COLORS[viewingTimetable.day] || 'bg-slate-500'} flex items-center justify-center text-white text-lg font-bold shrink-0`}>{viewingTimetable.day[0]}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">{viewingTimetable.className || viewingTimetable.classId}</h3>
                  <p className="text-sm text-slate-500">{viewingTimetable.day} â€” {viewingTimetable.periods?.length || 0} periods</p>
                </div>
              </div>
              <div className="space-y-2">{(viewingTimetable.periods || []).map((p, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 w-7 h-7 flex items-center justify-center rounded-lg">{p.periodNumber}</span>
                  <div className="flex-1"><span className="text-sm font-medium text-slate-700">{p.subject}</span>{p.teacherName && <span className="text-xs text-slate-400 ml-2">â€” {p.teacherName}</span>}</div>
                  <div className="flex items-center gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime}â€“{p.endTime}</span>{p.roomNumber && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.roomNumber}</span>}</div>
                </div>
              ))}</div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100"><Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button><Button onClick={() => { setIsViewModalOpen(false); handleOpenModal(viewingTimetable); }}><Pencil className="w-3.5 h-3.5" /> Edit Schedule</Button></div>
            </div>
          )}
        </Modal>

        <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, id: null, name: '' })} onConfirm={deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete} title="Delete Timetable" message={`Are you sure you want to delete ${deleteDialog.name}?`} confirmText="Delete" cancelText="Cancel" type="danger" isLoading={isDeleting} />
      </div>
    </DashboardLayout>
  );
}

