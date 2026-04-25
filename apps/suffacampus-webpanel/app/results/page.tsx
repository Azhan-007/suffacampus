'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { ResultService } from '@/services/resultService';
import { Result } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Input, Select, EmptyState, ConfirmDialog, ProfileAvatar } from '@/components/common';
import StatCard from '@/components/dashboard/StatCard';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import { useAuthStore } from '@/store/authStore';
import {
  Plus, Pencil, Trash2, Search, Download, Eye, X,
  Award, TrendingUp, AlertTriangle, CheckCircle, BarChart3,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  User2, Hash, GraduationCap, BookOpen, Calendar, FileText,
  Printer, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { PAGE_SIZE_OPTIONS, getErrorMessage } from '@/lib/utils';
import { resultSchema, validateFormData } from '@/lib/schemas';
import { DEFAULT_SUBJECTS, EXAM_TYPES } from '@/lib/constants';

type SortField = 'studentName' | 'subject' | 'percentage' | 'grade' | 'status';
type SortDir = 'asc' | 'desc';

const SUBJECTS = [...DEFAULT_SUBJECTS];
const GRADE_LETTERS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
const gradeColor: Record<string, string> = { 'A+': 'text-emerald-700 bg-emerald-50', 'A': 'text-emerald-600 bg-emerald-50', 'B+': 'text-blue-700 bg-blue-50', 'B': 'text-blue-600 bg-blue-50', 'C+': 'text-amber-700 bg-amber-50', 'C': 'text-amber-600 bg-amber-50', 'D': 'text-orange-600 bg-orange-50', 'F': 'text-red-600 bg-red-50' };

export default function ResultsPage() {
  useDocumentTitle('Results');
  const { currentSchool } = useAuthStore();
  const queryClient = useQueryClient();

  // "" Data fetching via React Query ""
  const { data: results = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Result[]>({
    queryKey: ['results'],
    path: '/results?limit=1000',
  });
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterExamType, setFilterExamType] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('studentName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<Result | null>(null);
  const [viewingResult, setViewingResult] = useState<Result | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    studentId: '', studentName: '', rollNumber: '', classId: '', sectionId: '', className: '',
    examType: '', examName: '', subject: '', marksObtained: 0, totalMarks: 100,
    percentage: 0, grade: '', status: 'Pass' as 'Pass' | 'Fail', rank: undefined as number | undefined,
    remarks: '', isActive: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const passCount = useMemo(() => results.filter(r => r.status === 'Pass').length, [results]);
  const failCount = useMemo(() => results.filter(r => r.status === 'Fail').length, [results]);
  const avgPercentage = useMemo(() => {
    if (results.length === 0) return 0;
    return Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length);
  }, [results]);

  const filteredResults = useMemo(() => {
    let list = results;
    if (searchTerm) { const q = searchTerm.toLowerCase(); list = list.filter(r => r.studentName.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q) || (r.rollNumber || '').toLowerCase().includes(q)); }
    if (filterExamType) list = list.filter(r => r.examType === filterExamType);
    if (filterSubject) list = list.filter(r => r.subject === filterSubject);
    if (filterStatus) list = list.filter(r => r.status === filterStatus);
    return list;
  }, [results, searchTerm, filterExamType, filterSubject, filterStatus]);

  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'studentName': cmp = (a.studentName || '').localeCompare(b.studentName || ''); break;
        case 'subject': cmp = (a.subject || '').localeCompare(b.subject || ''); break;
        case 'percentage': cmp = (a.percentage || 0) - (b.percentage || 0); break;
        case 'grade': cmp = (a.grade || '').localeCompare(b.grade || ''); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredResults, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedResults.length / pageSize));
  const paginatedResults = useMemo(() => { const s = (page - 1) * pageSize; return sortedResults.slice(s, s + pageSize); }, [sortedResults, page, pageSize]);
  useEffect(() => { setPage(1); }, [searchTerm, filterExamType, filterSubject, filterStatus, sortField, sortDir]);

  const allOnPageSelected = paginatedResults.length > 0 && paginatedResults.every(r => selectedIds.has(r.id));
  const someOnPageSelected = paginatedResults.some(r => selectedIds.has(r.id));
  const toggleSelectAll = useCallback(() => { setSelectedIds(prev => { const n = new Set(prev); if (allOnPageSelected) paginatedResults.forEach(r => n.delete(r.id)); else paginatedResults.forEach(r => n.add(r.id)); return n; }); }, [allOnPageSelected, paginatedResults]);
  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);

  const toggleSort = (f: SortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc'); } };
  const SortIcon = ({ field }: { field: SortField }) => { if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />; return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />; };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterExamType) chips.push({ key: 'exam', label: filterExamType, clear: () => setFilterExamType('') });
    if (filterSubject) chips.push({ key: 'subject', label: filterSubject, clear: () => setFilterSubject('') });
    if (filterStatus) chips.push({ key: 'status', label: filterStatus, clear: () => setFilterStatus('') });
    if (searchTerm) chips.push({ key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') });
    return chips;
  }, [filterExamType, filterSubject, filterStatus, searchTerm]);
  const clearAllFilters = () => { setSearchTerm(''); setFilterExamType(''); setFilterSubject(''); setFilterStatus(''); };

  const resetForm = () => { setFormData({ studentId: '', studentName: '', rollNumber: '', classId: '', sectionId: '', className: '', examType: '', examName: '', subject: '', marksObtained: 0, totalMarks: 100, percentage: 0, grade: '', status: 'Pass', rank: undefined, remarks: '', isActive: true }); setFormErrors({}); setEditingResult(null); };
  const handleOpenModal = (r?: Result) => {
    if (r) { setEditingResult(r); setFormData({ studentId: r.studentId, studentName: r.studentName, rollNumber: r.rollNumber || '', classId: r.classId, sectionId: r.sectionId, className: r.className || '', examType: r.examType, examName: r.examName, subject: r.subject, marksObtained: r.marksObtained, totalMarks: r.totalMarks, percentage: r.percentage || 0, grade: r.grade || '', status: r.status, rank: r.rank, remarks: r.remarks || '', isActive: r.isActive }); }
    else resetForm();
    setIsModalOpen(true);
  };
  const handleCloseModal = () => { setIsModalOpen(false); resetForm(); };

  const calcGrade = (pct: number) => { if (pct >= 90) return 'A+'; if (pct >= 80) return 'A'; if (pct >= 70) return 'B+'; if (pct >= 60) return 'B'; if (pct >= 50) return 'C+'; if (pct >= 40) return 'C'; if (pct >= 33) return 'D'; return 'F'; };

  useEffect(() => {
    if (formData.totalMarks > 0) {
      const pct = Math.round((formData.marksObtained / formData.totalMarks) * 100);
      const grade = calcGrade(pct);
      const status = pct >= 33 ? 'Pass' : 'Fail';
      setFormData(prev => ({ ...prev, percentage: pct, grade, status }));
    }
  }, [formData.marksObtained, formData.totalMarks]);

  const validateForm = () => {
    const errors = validateFormData(resultSchema, formData);
    setFormErrors(errors ?? {});
    return errors === null;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { toast.error('Please fill in all required fields'); return; }
    setIsSaving(true);
    try {
      if (editingResult) { await ResultService.updateResult(editingResult.id, formData); queryClient.invalidateQueries({ queryKey: ['results'] }); toast.success('Result updated'); }
      else { await ResultService.createResult(formData); queryClient.invalidateQueries({ queryKey: ['results'] }); toast.success('Result created'); }
      handleCloseModal();
    } catch (error) { toast.error(getErrorMessage(error)); } finally { setIsSaving(false); }
  };

  const handleDelete = (id: string, name: string) => { setDeleteDialog({ isOpen: true, id, name }); };
  const confirmDelete = async () => { if (!deleteDialog.id) return; setIsDeleting(true); try { await ResultService.deleteResult(deleteDialog.id); queryClient.invalidateQueries({ queryKey: ['results'] }); toast.success('Deleted'); setDeleteDialog({ isOpen: false, id: null, name: '' }); setSelectedIds(p => { const n = new Set(p); n.delete(deleteDialog.id!); return n; }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };
  const handleBulkDelete = () => { if (selectedIds.size === 0) return; setDeleteDialog({ isOpen: true, id: '__bulk__', name: `${selectedIds.size} result${selectedIds.size > 1 ? 's' : ''}` }); };
  const confirmBulkDelete = async () => { setIsDeleting(true); try { for (const id of Array.from(selectedIds)) await ResultService.deleteResult(id); queryClient.invalidateQueries({ queryKey: ['results'] }); toast.success(`${selectedIds.size} deleted`); setSelectedIds(new Set()); setDeleteDialog({ isOpen: false, id: null, name: '' }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };

  const handleViewResult = (r: Result) => { setViewingResult(r); setIsViewModalOpen(true); };

  const handleExportPrint = () => {
    const headers = ['Student', 'Roll No', 'Class', 'Exam', 'Subject', 'Marks', 'Total', '%', 'Grade', 'Status'];
    const rows = filteredResults.map(r => [r.studentName, r.rollNumber || '', r.className || r.classId, r.examType, r.subject, String(r.marksObtained), String(r.totalMarks), String(r.percentage || 0), r.grade || '', r.status]);
    exportToPrint({ title: 'Exam Results', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `results-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('Print view opened');
  };

  const handleExportCSV = () => {
    const headers = ['Student', 'Roll No', 'Class', 'Exam', 'Subject', 'Marks', 'Total', '%', 'Grade', 'Status'];
    const rows = filteredResults.map(r => [r.studentName, r.rollNumber || '', r.className || r.classId, r.examType, r.subject, String(r.marksObtained), String(r.totalMarks), String(r.percentage || 0), r.grade || '', r.status]);
    exportToCSV({ title: 'Exam Results', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `results-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('CSV downloaded');
  };

  if (loading) { return (<DashboardLayout><div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Loading results...</p></div></div></DashboardLayout>); }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Results</h1><p className="text-base text-slate-500 mt-1">Manage exam results and grades</p>{lastSynced && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-xs text-emerald-600 font-medium">Live synced - {format(lastSynced, 'h:mm:ss a')}</span>
                </div>
              )}</div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && <Button variant="secondary" onClick={handleBulkDelete}><Trash2 className="w-4 h-4 text-red-500" /><span className="text-red-600">Delete ({selectedIds.size})</span></Button>}
            <Button variant="secondary" onClick={handleExportPrint}><Printer className="w-4 h-4" /><span className="hidden sm:inline">Print</span></Button>
            <Button variant="secondary" onClick={handleExportCSV}><Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span></Button>
            <Button onClick={() => handleOpenModal()}><Plus className="w-4 h-4" /><span>Add Result</span></Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Results" value={results.length} icon={BarChart3} color="blue" subtitle="All results" loading={loading} />
          <StatCard title="Passed" value={passCount} icon={CheckCircle} color="emerald" subtitle={`${results.length > 0 ? Math.round((passCount / results.length) * 100) : 0}% pass rate`} loading={loading} />
          <StatCard title="Failed" value={failCount} icon={AlertTriangle} color="rose" subtitle="Below passing" loading={loading} />
          <StatCard title="Average" value={avgPercentage} icon={TrendingUp} color="violet" subtitle="Average percentage" loading={loading} suffix="%" />
        </div>

        {/* Filters */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search student, subject, or roll no..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all" /></div>
            <div className="flex gap-2 shrink-0">
              <div className="w-[140px]"><Select value={filterExamType} onChange={e => setFilterExamType(e.target.value)} placeholder="All Exams" options={EXAM_TYPES.map(t => ({ value: t, label: t }))} /></div>
              <div className="w-[150px]"><Select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} placeholder="All Subjects" options={SUBJECTS.map(s => ({ value: s, label: s }))} /></div>
              <div className="w-[130px]"><Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} placeholder="All Status" options={[{ value: 'Pass', label: 'Pass' }, { value: 'Fail', label: 'Fail' }]} /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            {activeFilters.map(chip => (<span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-100">{chip.label}<button onClick={chip.clear} className="hover:text-blue-800 ml-0.5"><X className="w-3 h-3" /></button></span>))}
            {activeFilters.length > 0 && <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 ml-1 transition-colors"><X className="w-3 h-3" /> Clear all</button>}
            <span className="ml-auto text-xs text-slate-400 tabular-nums">{filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2"><h3 className="text-[14px] font-semibold text-slate-700">Result Records</h3><span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">{sortedResults.length}</span></div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Showing {sortedResults.length > 0 ? (page - 1) * pageSize + 1 : 0}"{Math.min(page * pageSize, sortedResults.length)}</span>
              <div className="w-[100px]"><Select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n} rows` }))} /></div>
            </div>
          </div>
          {paginatedResults.length > 0 ? (
            <>
              <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="bg-slate-50 border-b border-slate-200">
                <th className="pl-5 pr-2 py-3 w-10"><input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }} onChange={toggleSelectAll} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></th>
                {[
                  { label: 'Student', field: 'studentName' as SortField, w: 'min-w-[200px]' }, { label: 'Exam', field: null, w: '' },
                  { label: 'Subject', field: 'subject' as SortField, w: '' }, { label: 'Marks', field: null, w: '' },
                  { label: 'Percentage', field: 'percentage' as SortField, w: '' }, { label: 'Grade', field: 'grade' as SortField, w: '' },
                  { label: 'Status', field: 'status' as SortField, w: '' }, { label: 'Actions', field: null, w: 'w-[100px]' },
                ].map((col, i) => (
                  <th key={i} onClick={() => col.field && toggleSort(col.field)} className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.w} ${col.field ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}`}><span className="flex items-center gap-1">{col.label}{col.field && <SortIcon field={col.field} />}</span></th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedResults.map(r => {
                  const isSelected = selectedIds.has(r.id);
                  return (
                    <tr key={r.id} className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="pl-5 pr-2 py-3"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><ProfileAvatar name={r.studentName} size="sm" /><div className="min-w-0"><button onClick={() => handleViewResult(r)} className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left truncate max-w-[180px] block">{r.studentName}</button><p className="text-xs text-slate-400">{r.rollNumber ? `Roll: ${r.rollNumber}` : r.className || r.classId}</p></div></div></td>
                      <td className="px-4 py-3"><span className="text-xs font-medium text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{r.examType}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-700">{r.subject}</span></td>
                      <td className="px-4 py-3"><span className="text-sm font-medium text-slate-700 tabular-nums">{r.marksObtained}<span className="text-slate-400">/{r.totalMarks}</span></span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${(r.percentage || 0) >= 60 ? 'bg-emerald-500' : (r.percentage || 0) >= 33 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(r.percentage || 0, 100)}%` }} /></div>
                          <span className="text-xs font-semibold text-slate-600 tabular-nums">{r.percentage || 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded ${gradeColor[r.grade || 'F'] || 'text-slate-600 bg-slate-50'}`}>{r.grade || '"'}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${r.status === 'Pass' ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}><span className={`w-1.5 h-1.5 rounded-full ${r.status === 'Pass' ? 'bg-emerald-500' : 'bg-red-500'}`} />{r.status}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"><button onClick={() => handleViewResult(r)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Eye className="w-4 h-4" /></button><button onClick={() => handleOpenModal(r)} className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="w-4 h-4" /></button><button onClick={() => handleDelete(r.id, r.studentName)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button></div></td>
                    </tr>
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
          ) : (<div className="p-8"><EmptyState icon={<BarChart3 className="w-16 h-16" />} title="No results found" description={searchTerm || filterExamType || filterSubject || filterStatus ? 'Try adjusting your filters' : 'Get started by adding exam results'} action={!searchTerm ? { label: 'Add Result', onClick: () => handleOpenModal() } : undefined} /></div>)}
        </div>

        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingResult ? 'Edit Result' : 'Add Result'} subtitle={editingResult ? `Editing ${editingResult.studentName}'s result` : 'Enter exam result details'} size="xl">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><User2 className="w-3.5 h-3.5 text-blue-600" /></div><h4 className="text-sm font-medium text-slate-700">Student Information</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Student Name *" value={formData.studentName} onChange={e => setFormData({ ...formData, studentName: e.target.value })} error={formErrors.studentName} placeholder="Student full name" />
                <Input label="Roll Number" value={formData.rollNumber} onChange={e => setFormData({ ...formData, rollNumber: e.target.value })} placeholder="Roll number" />
                <Input label="Class *" value={formData.classId} onChange={e => setFormData({ ...formData, classId: e.target.value })} error={formErrors.classId} placeholder="class-10" />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Award className="w-3.5 h-3.5 text-violet-600" /></div><h4 className="text-sm font-medium text-slate-700">Exam Details</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="Exam Type *" value={formData.examType} onChange={e => setFormData({ ...formData, examType: e.target.value })} error={formErrors.examType} options={EXAM_TYPES.map(t => ({ value: t, label: t }))} />
                <Select label="Subject *" value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} error={formErrors.subject} options={SUBJECTS.map(s => ({ value: s, label: s }))} />
                <Input label="Exam Name" value={formData.examName} onChange={e => setFormData({ ...formData, examName: e.target.value })} placeholder="e.g. Mid Term 2024" />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /></div><h4 className="text-sm font-medium text-slate-700">Marks & Grade</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input label="Marks Obtained *" type="number" value={formData.marksObtained.toString()} onChange={e => setFormData({ ...formData, marksObtained: parseFloat(e.target.value) || 0 })} error={formErrors.marksObtained} />
                <Input label="Total Marks *" type="number" value={formData.totalMarks.toString()} onChange={e => setFormData({ ...formData, totalMarks: parseInt(e.target.value) || 0 })} error={formErrors.totalMarks} />
                <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Percentage</label><div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800">{formData.percentage}%</div></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Grade</label><div className={`px-4 py-2.5 border rounded-lg text-sm font-semibold text-center ${gradeColor[formData.grade] || 'text-slate-600 bg-slate-50'}`}>{formData.grade || '"'}</div></div>
              </div>
              <div className="flex items-center gap-3 mt-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-xs font-medium text-slate-500">Status:</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${formData.status === 'Pass' ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>{formData.status}</span>
              </div>
            </div>
            <div><Input label="Remarks" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} placeholder="Optional remarks" /></div>
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={handleCloseModal} disabled={isSaving}>Cancel</Button><Button onClick={handleSubmit} isLoading={isSaving}>{editingResult ? 'Save Changes' : 'Add Result'}</Button></div>
        </Modal>

        {/* View Modal */}
        <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Result Details" subtitle="Complete result information" size="lg">
          {viewingResult && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <ProfileAvatar name={viewingResult.studentName} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">{viewingResult.studentName}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${gradeColor[viewingResult.grade || 'F']}`}>Grade: {viewingResult.grade || '"'}</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${viewingResult.status === 'Pass' ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>{viewingResult.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{viewingResult.percentage}% " {viewingResult.marksObtained}/{viewingResult.totalMarks} marks</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={User2} label="Student Name" value={viewingResult.studentName} />
                <InfoRow icon={Hash} label="Roll Number" value={viewingResult.rollNumber || 'N/A'} />
                <InfoRow icon={GraduationCap} label="Class" value={viewingResult.className || viewingResult.classId} />
                <InfoRow icon={BookOpen} label="Subject" value={viewingResult.subject} />
                <InfoRow icon={Calendar} label="Exam Type" value={viewingResult.examType} />
                <InfoRow icon={Award} label="Exam Name" value={viewingResult.examName || 'N/A'} />
                <InfoRow icon={TrendingUp} label="Marks" value={`${viewingResult.marksObtained} / ${viewingResult.totalMarks}`} />
                {viewingResult.rank && <InfoRow icon={Hash} label="Rank" value={`#${viewingResult.rank}`} />}
                {viewingResult.remarks && <InfoRow icon={FileText} label="Remarks" value={viewingResult.remarks} span2 />}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100"><Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button><Button onClick={() => { setIsViewModalOpen(false); handleOpenModal(viewingResult); }}><Pencil className="w-3.5 h-3.5" /> Edit Result</Button></div>
            </div>
          )}
        </Modal>

        <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, id: null, name: '' })} onConfirm={deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete} title="Delete Result" message={`Are you sure you want to delete ${deleteDialog.name}?`} confirmText="Delete" cancelText="Cancel" type="danger" isLoading={isDeleting} />
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ icon: Icon, label, value, mono, span2 }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean; span2?: boolean }) {
  return (<div className={`flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 ${span2 ? 'sm:col-span-2' : ''}`}><div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-500" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p><p className={`text-sm font-medium text-slate-700 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p></div></div>);
}

