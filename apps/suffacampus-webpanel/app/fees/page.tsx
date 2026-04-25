'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { FeeService } from '@/services/feeService';
import { Fee, Class } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Input, Select, EmptyState, ConfirmDialog, ProfileAvatar, PaymentModal } from '@/components/common';
import StatCard from '@/components/dashboard/StatCard';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import { PaymentGatewayService } from '@/services/paymentGatewayService';
import { formatCurrency } from '@/lib/designTokens';
import {
  Plus, Pencil, Trash2, Search, Download, Eye, X,
  IndianRupee, Clock, CheckCircle, AlertTriangle, CreditCard,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  User2, Hash, GraduationCap, Calendar, FileText, Banknote,
  Printer, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { toDate, PAGE_SIZE_OPTIONS, getErrorMessage } from '@/lib/utils';
import { feeSchema, validateFormData } from '@/lib/schemas';

type SortField = 'studentName' | 'amount' | 'dueDate' | 'status' | 'feeType';
type SortDir = 'asc' | 'desc';

const FEE_TYPES = ['Tuition', 'Transport', 'Library', 'Exam', 'Sports', 'Lab', 'Annual', 'Registration', 'Other'];
const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Online'];
const STATUS_OPTIONS = [{ value: 'Pending', label: 'Pending' }, { value: 'Paid', label: 'Paid' }, { value: 'Overdue', label: 'Overdue' }, { value: 'Partial', label: 'Partial' }];
const statusStyle: Record<string, string> = { Pending: 'text-amber-700 bg-amber-50', Paid: 'text-emerald-700 bg-emerald-50', Overdue: 'text-red-600 bg-red-50', Partial: 'text-blue-600 bg-blue-50' };
const statusDot: Record<string, string> = { Pending: 'bg-amber-500', Paid: 'bg-emerald-500', Overdue: 'bg-red-500', Partial: 'bg-blue-400' };

export default function FeesPage() {
  useDocumentTitle('Fees');
  const { currentSchool, user } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || '';
  const queryClient = useQueryClient();

  const { data: fees = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Fee[]>({
    queryKey: ['fees', schoolId],
    path: '/fees?limit=1000',
    select: (raw: Record<string, unknown>[]) =>
      raw.map((r) => ({
        ...(r as unknown as Fee),
        dueDate: toDate(r.dueDate),
        paidDate: r.paidDate ? toDate(r.paidDate) : undefined,
        createdAt: toDate(r.createdAt),
        updatedAt: toDate(r.updatedAt),
      })),
    enabled: !!schoolId,
  });

  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const { data: classes = [] } = useApiQuery<Class[]>({
    queryKey: ['classes', schoolId],
    path: '/classes/all',
    enabled: !!schoolId,
  });

  const classMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c.className])) as Record<string, string>,
    [classes],
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [filterFeeType, setFilterFeeType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortField, setSortField] = useState<SortField>('dueDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<Fee | null>(null);
  const [viewingFee, setViewingFee] = useState<Fee | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    studentId: '', studentName: '', classId: '', sectionId: '', amount: 0, dueDate: '',
    status: 'Pending' as 'Pending' | 'Paid' | 'Overdue' | 'Partial',
    paymentMode: '', transactionId: '', feeType: '', amountPaid: 0, paidDate: '', remarks: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payingFee, setPayingFee] = useState<Fee | null>(null);

  const totalAmount = useMemo(() => fees.reduce((s, f) => s + (f.amount || 0), 0), [fees]);
  const collectedAmount = useMemo(() => fees.filter(f => f.status === 'Paid').reduce((s, f) => s + (f.amount || 0), 0) + fees.filter(f => f.status === 'Partial').reduce((s, f) => s + (f.amountPaid || 0), 0), [fees]);
  const pendingAmount = useMemo(() => totalAmount - collectedAmount, [totalAmount, collectedAmount]);
  const overdueCount = useMemo(() => fees.filter(f => f.status === 'Overdue').length, [fees]);

  const filteredFees = useMemo(() => {
    let list = fees;
    if (searchTerm) { const q = searchTerm.toLowerCase(); list = list.filter(f => f.studentName.toLowerCase().includes(q) || f.feeType.toLowerCase().includes(q) || (f.transactionId || '').toLowerCase().includes(q)); }
    if (filterFeeType) list = list.filter(f => f.feeType === filterFeeType);
    if (filterStatus) list = list.filter(f => f.status === filterStatus);
    return list;
  }, [fees, searchTerm, filterFeeType, filterStatus]);

  const sortedFees = useMemo(() => {
    const sorted = [...filteredFees];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'studentName': cmp = (a.studentName || '').localeCompare(b.studentName || ''); break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'dueDate': cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); break;
        case 'status': cmp = (a.status || '').localeCompare(b.status || ''); break;
        case 'feeType': cmp = (a.feeType || '').localeCompare(b.feeType || ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredFees, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedFees.length / pageSize));
  const paginatedFees = useMemo(() => { const s = (page - 1) * pageSize; return sortedFees.slice(s, s + pageSize); }, [sortedFees, page, pageSize]);
  useEffect(() => { setPage(1); }, [searchTerm, filterFeeType, filterStatus, sortField, sortDir]);

  const allOnPageSelected = paginatedFees.length > 0 && paginatedFees.every(f => selectedIds.has(f.id));
  const someOnPageSelected = paginatedFees.some(f => selectedIds.has(f.id));
  const toggleSelectAll = useCallback(() => { setSelectedIds(prev => { const n = new Set(prev); if (allOnPageSelected) paginatedFees.forEach(f => n.delete(f.id)); else paginatedFees.forEach(f => n.add(f.id)); return n; }); }, [allOnPageSelected, paginatedFees]);
  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);

  const toggleSort = (f: SortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc'); } };
  const SortIcon = ({ field }: { field: SortField }) => { if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />; return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />; };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterFeeType) chips.push({ key: 'type', label: filterFeeType, clear: () => setFilterFeeType('') });
    if (filterStatus) chips.push({ key: 'status', label: filterStatus, clear: () => setFilterStatus('') });
    if (searchTerm) chips.push({ key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') });
    return chips;
  }, [filterFeeType, filterStatus, searchTerm]);
  const clearAllFilters = () => { setSearchTerm(''); setFilterFeeType(''); setFilterStatus(''); };



  const resetForm = () => { setFormData({ studentId: '', studentName: '', classId: '', sectionId: '', amount: 0, dueDate: '', status: 'Pending', paymentMode: '', transactionId: '', feeType: '', amountPaid: 0, paidDate: '', remarks: '' }); setFormErrors({}); setEditingFee(null); };
  const handleOpenModal = (f?: Fee) => {
    if (f) { setEditingFee(f); setFormData({ studentId: f.studentId, studentName: f.studentName, classId: f.classId, sectionId: f.sectionId, amount: f.amount, dueDate: format(new Date(f.dueDate), 'yyyy-MM-dd'), status: f.status, paymentMode: f.paymentMode || '', transactionId: f.transactionId || '', feeType: f.feeType, amountPaid: f.amountPaid || 0, paidDate: f.paidDate ? format(new Date(f.paidDate), 'yyyy-MM-dd') : '', remarks: f.remarks || '' }); }
    else resetForm();
    setIsModalOpen(true);
  };
  const handleCloseModal = () => { setIsModalOpen(false); resetForm(); };

  const validateForm = () => {
    const errors = validateFormData(feeSchema, formData);
    setFormErrors(errors ?? {});
    return errors === null;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { toast.error('Please fill required fields'); return; }
    setIsSaving(true);
    try {
      const payload = { ...formData, dueDate: new Date(formData.dueDate), paidDate: formData.paidDate ? new Date(formData.paidDate) : undefined };
      if (editingFee) { await FeeService.updateFee(schoolId, editingFee.id, payload); toast.success('Fee updated'); }
      else { await FeeService.createFee(schoolId, payload); toast.success('Fee created'); }
      queryClient.invalidateQueries({ queryKey: ['fees'] });
      handleCloseModal();
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsSaving(false); }
  };

  const handleMarkPaid = async (f: Fee) => {
    try { await FeeService.markAsPaid(schoolId, f.id, { paymentMode: 'Cash', amountPaid: f.amount - (f.amountPaid || 0) }); queryClient.invalidateQueries({ queryKey: ['fees'] }); toast.success('Marked as paid'); } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const handlePayOnline = (f: Fee) => {
    setPayingFee(f);
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async (result: import('@/types').PaymentResult) => {
    if (payingFee && result.paymentId) {
      try {
        await FeeService.markAsPaid(schoolId, payingFee.id, {
          paymentMode: 'Online',
          transactionId: result.paymentId,
          amountPaid: payingFee.amount - (payingFee.amountPaid || 0),
        });
        toast.success('Payment recorded successfully');
        queryClient.invalidateQueries({ queryKey: ['fees'] });
      } catch {
        toast.error('Payment succeeded but recording failed. Please mark manually.');
      }
    }
    setPaymentModalOpen(false);
    setPayingFee(null);
  };

  const handleDelete = (id: string, name: string) => { setDeleteDialog({ isOpen: true, id, name }); };
  const confirmDelete = async () => { if (!deleteDialog.id) return; setIsDeleting(true); try { await FeeService.deleteFee(schoolId, deleteDialog.id); queryClient.invalidateQueries({ queryKey: ['fees'] }); toast.success('Deleted'); setDeleteDialog({ isOpen: false, id: null, name: '' }); setSelectedIds(p => { const n = new Set(p); n.delete(deleteDialog.id!); return n; }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };
  const handleBulkDelete = () => { if (selectedIds.size === 0) return; setDeleteDialog({ isOpen: true, id: '__bulk__', name: `${selectedIds.size} fee record${selectedIds.size > 1 ? 's' : ''}` }); };
  const confirmBulkDelete = async () => { setIsDeleting(true); try { for (const id of Array.from(selectedIds)) await FeeService.deleteFee(schoolId, id); queryClient.invalidateQueries({ queryKey: ['fees'] }); toast.success(`${selectedIds.size} deleted`); setSelectedIds(new Set()); setDeleteDialog({ isOpen: false, id: null, name: '' }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };

  const handleViewFee = (f: Fee) => { setViewingFee(f); setIsViewModalOpen(true); };

  const feeExportHeaders = ['Student', 'Class', 'Fee Type', 'Amount', 'Due Date', 'Status', 'Amount Paid', 'Payment Mode'];
  const feeExportRows = filteredFees.map(f => [f.studentName, f.classId, f.feeType, String(f.amount), format(new Date(f.dueDate), 'yyyy-MM-dd'), f.status, String(f.amountPaid || 0), f.paymentMode || '']);
  const handleExportPrint = () => {
    exportToPrint({ title: 'Fee Records', schoolName: currentSchool?.name || 'SuffaCampus School', headers: feeExportHeaders, rows: feeExportRows, filename: `fees-${format(new Date(), 'yyyy-MM-dd')}` });
  };
  const handleExportCSV = () => {
    exportToCSV({ title: 'Fee Records', schoolName: currentSchool?.name || 'SuffaCampus School', headers: feeExportHeaders, rows: feeExportRows, filename: `fees-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('CSV exported');
  };

  if (loading) { return (<DashboardLayout><div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Loading fees...</p></div></div></DashboardLayout>); }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Fee Management</h1><p className="text-base text-slate-500 mt-1">Track student fees and payments</p>{lastSynced && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-xs text-emerald-600 font-medium">Live synced - {format(lastSynced, 'h:mm:ss a')}</span>
                </div>
              )}</div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && <Button variant="secondary" onClick={handleBulkDelete}><Trash2 className="w-4 h-4 text-red-500" /><span className="text-red-600">Delete ({selectedIds.size})</span></Button>}
            <Button variant="secondary" onClick={handleExportPrint}><Printer className="w-4 h-4" /><span className="hidden sm:inline">Print</span></Button>
            <Button variant="secondary" onClick={handleExportCSV}><Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span></Button>
            <Button onClick={() => handleOpenModal()}><Plus className="w-4 h-4" /><span>Add Fee</span></Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Fees" value={totalAmount} icon={IndianRupee} color="blue" subtitle={`${fees.length} records`} loading={loading} formatter={formatCurrency} />
          <StatCard title="Collected" value={collectedAmount} icon={CheckCircle} color="emerald" subtitle={`${totalAmount > 0 ? Math.round((collectedAmount / totalAmount) * 100) : 0}% collected`} loading={loading} formatter={formatCurrency} />
          <StatCard title="Pending" value={pendingAmount} icon={Clock} color="amber" subtitle="Outstanding" loading={loading} formatter={formatCurrency} />
          <StatCard title="Overdue" value={overdueCount} icon={AlertTriangle} color="rose" subtitle="Past due date" loading={loading} />
        </div>

        {/* Filters */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search by student, fee type, or transaction ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all" /></div>
            <div className="flex gap-2 shrink-0">
              <div className="w-[140px]"><Select value={filterFeeType} onChange={e => setFilterFeeType(e.target.value)} placeholder="All Types" options={FEE_TYPES.map(t => ({ value: t, label: t }))} /></div>
              <div className="w-[130px]"><Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} placeholder="All Status" options={STATUS_OPTIONS} /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            {activeFilters.map(chip => (<span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-100">{chip.label}<button onClick={chip.clear} className="hover:text-blue-800 ml-0.5"><X className="w-3 h-3" /></button></span>))}
            {activeFilters.length > 0 && <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 ml-1 transition-colors"><X className="w-3 h-3" /> Clear all</button>}
            <span className="ml-auto text-xs text-slate-400 tabular-nums">{filteredFees.length} record{filteredFees.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2"><h3 className="text-[14px] font-semibold text-slate-700">Fee Records</h3><span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">{sortedFees.length}</span></div>
            <div className="flex items-center gap-3"><span className="text-xs text-slate-400">Showing {sortedFees.length > 0 ? (page - 1) * pageSize + 1 : 0}"{Math.min(page * pageSize, sortedFees.length)}</span><div className="w-[100px]"><Select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n} rows` }))} /></div></div>
          </div>
          {paginatedFees.length > 0 ? (
            <>
              <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="bg-slate-50 border-b border-slate-200">
                <th className="pl-5 pr-2 py-3 w-10"><input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }} onChange={toggleSelectAll} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></th>
                {[
                  { label: 'Student', field: 'studentName' as SortField, w: 'min-w-[200px]' }, { label: 'Fee Type', field: 'feeType' as SortField, w: '' },
                  { label: 'Amount', field: 'amount' as SortField, w: '' }, { label: 'Due Date', field: 'dueDate' as SortField, w: '' },
                  { label: 'Paid', field: null, w: '' }, { label: 'Status', field: 'status' as SortField, w: '' },
                  { label: 'Actions', field: null, w: 'w-[120px]' },
                ].map((col, i) => (
                  <th key={i} onClick={() => col.field && toggleSort(col.field)} className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.w} ${col.field ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}`}><span className="flex items-center gap-1">{col.label}{col.field && <SortIcon field={col.field} />}</span></th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedFees.map(f => {
                  const isSelected = selectedIds.has(f.id);
                  return (
                    <tr key={f.id} className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="pl-5 pr-2 py-3"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(f.id)} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><ProfileAvatar name={f.studentName} size="sm" /><div className="min-w-0"><button onClick={() => handleViewFee(f)} className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left truncate max-w-[170px] block">{f.studentName}</button><p className="text-xs text-slate-400">{classMap[f.classId] || f.classId}</p></div></div></td>
                      <td className="px-4 py-3"><span className="text-xs font-medium text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{f.feeType}</span></td>
                      <td className="px-4 py-3"><span className="text-sm font-medium text-slate-700 tabular-nums">{formatCurrency(f.amount)}</span></td>
                      <td className="px-4 py-3"><span className={`text-sm whitespace-nowrap ${f.status === 'Overdue' ? 'text-red-500 font-medium' : 'text-slate-500'}`}>{format(new Date(f.dueDate), 'dd MMM yyyy')}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-600 tabular-nums">{f.amountPaid ? formatCurrency(f.amountPaid) : '"'}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${statusStyle[f.status]}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot[f.status]}`} />{f.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <button onClick={() => handleViewFee(f)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Eye className="w-4 h-4" /></button>
                          {f.status !== 'Paid' && <button onClick={() => handlePayOnline(f)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Pay Online"><CreditCard className="w-4 h-4" /></button>}
                          {f.status !== 'Paid' && <button onClick={() => handleMarkPaid(f)} className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Mark Paid"><CheckCircle className="w-4 h-4" /></button>}
                          <button onClick={() => handleOpenModal(f)} className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(f.id, f.studentName)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
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
          ) : (<div className="p-8"><EmptyState icon={<IndianRupee className="w-16 h-16" />} title="No fee records found" description={searchTerm || filterFeeType || filterStatus ? 'Try adjusting your filters' : 'Get started by adding fee records'} action={!searchTerm ? { label: 'Add Fee', onClick: () => handleOpenModal() } : undefined} /></div>)}
        </div>

        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingFee ? 'Edit Fee' : 'Add Fee'} subtitle={editingFee ? `Editing ${editingFee.studentName}'s fee` : 'Enter fee details'} size="xl">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><User2 className="w-3.5 h-3.5 text-blue-600" /></div><h4 className="text-sm font-medium text-slate-700">Student Information</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Student Name *" value={formData.studentName} onChange={e => setFormData({ ...formData, studentName: e.target.value })} error={formErrors.studentName} placeholder="Full name" />
                <Input label="Class" value={formData.classId} onChange={e => setFormData({ ...formData, classId: e.target.value })} placeholder="class-10" />
                <Input label="Section" value={formData.sectionId} onChange={e => setFormData({ ...formData, sectionId: e.target.value })} placeholder="A" />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Banknote className="w-3.5 h-3.5 text-violet-600" /></div><h4 className="text-sm font-medium text-slate-700">Fee Details</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="Fee Type *" value={formData.feeType} onChange={e => setFormData({ ...formData, feeType: e.target.value })} error={formErrors.feeType} options={FEE_TYPES.map(t => ({ value: t, label: t }))} />
                <Input label="Amount *" type="number" value={formData.amount.toString()} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} error={formErrors.amount} placeholder="5000" />
                <Input label="Due Date *" type="date" value={formData.dueDate} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} error={formErrors.dueDate} />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><CreditCard className="w-3.5 h-3.5 text-emerald-600" /></div><h4 className="text-sm font-medium text-slate-700">Payment Details</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="Status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })} options={STATUS_OPTIONS} />
                <Select label="Payment Mode" value={formData.paymentMode} onChange={e => setFormData({ ...formData, paymentMode: e.target.value })} placeholder="Select mode" options={PAYMENT_MODES.map(m => ({ value: m, label: m }))} />
                <Input label="Amount Paid" type="number" value={formData.amountPaid.toString()} onChange={e => setFormData({ ...formData, amountPaid: parseFloat(e.target.value) || 0 })} placeholder="0" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Input label="Transaction ID" value={formData.transactionId} onChange={e => setFormData({ ...formData, transactionId: e.target.value })} placeholder="Optional" />
                <Input label="Paid Date" type="date" value={formData.paidDate} onChange={e => setFormData({ ...formData, paidDate: e.target.value })} />
              </div>
            </div>
            <Input label="Remarks" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} placeholder="Optional notes" />
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={handleCloseModal} disabled={isSaving}>Cancel</Button><Button onClick={handleSubmit} isLoading={isSaving}>{editingFee ? 'Save Changes' : 'Add Fee'}</Button></div>
        </Modal>

        {/* View Modal */}
        <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Fee Details" subtitle="Complete fee information" size="lg">
          {viewingFee && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <ProfileAvatar name={viewingFee.studentName} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">{viewingFee.studentName}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${statusStyle[viewingFee.status]}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot[viewingFee.status]}`} />{viewingFee.status}</span>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{viewingFee.feeType}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{formatCurrency(viewingFee.amount)} " due {format(new Date(viewingFee.dueDate), 'MMMM dd, yyyy')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={User2} label="Student" value={viewingFee.studentName} />
                <InfoRow icon={GraduationCap} label="Class" value={classMap[viewingFee.classId] || viewingFee.classId} />
                <InfoRow icon={Banknote} label="Fee Type" value={viewingFee.feeType} />
                <InfoRow icon={IndianRupee} label="Amount" value={formatCurrency(viewingFee.amount)} />
                <InfoRow icon={Calendar} label="Due Date" value={format(new Date(viewingFee.dueDate), 'MMMM dd, yyyy')} />
                <InfoRow icon={CheckCircle} label="Amount Paid" value={viewingFee.amountPaid ? formatCurrency(viewingFee.amountPaid) : 'Not paid'} />
                {viewingFee.paymentMode && <InfoRow icon={CreditCard} label="Payment Mode" value={viewingFee.paymentMode} />}
                {viewingFee.transactionId && <InfoRow icon={Hash} label="Transaction ID" value={viewingFee.transactionId} mono />}
                {viewingFee.paidDate && <InfoRow icon={Calendar} label="Paid Date" value={format(new Date(viewingFee.paidDate), 'MMMM dd, yyyy')} />}
                {viewingFee.remarks && <InfoRow icon={FileText} label="Remarks" value={viewingFee.remarks} span2 />}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100"><Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button>{viewingFee.status !== 'Paid' && <Button variant="secondary" onClick={() => { setIsViewModalOpen(false); handlePayOnline(viewingFee); }}><CreditCard className="w-3.5 h-3.5" /> Pay Online</Button>}{viewingFee.status !== 'Paid' && <Button onClick={() => { handleMarkPaid(viewingFee); setIsViewModalOpen(false); }}><CheckCircle className="w-3.5 h-3.5" /> Mark Paid</Button>}<Button onClick={() => { setIsViewModalOpen(false); handleOpenModal(viewingFee); }}><Pencil className="w-3.5 h-3.5" /> Edit</Button></div>
            </div>
          )}
        </Modal>

        <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, id: null, name: '' })} onConfirm={deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete} title="Delete Fee Record" message={`Are you sure you want to delete ${deleteDialog.name}?`} confirmText="Delete" cancelText="Cancel" type="danger" isLoading={isDeleting} />

        {/* Online Payment Modal */}
        {payingFee && (
          <PaymentModal
            isOpen={paymentModalOpen}
            onClose={() => { setPaymentModalOpen(false); setPayingFee(null); }}
            schoolId={schoolId}
            amount={payingFee.amount - (payingFee.amountPaid || 0)}
            description={`${payingFee.feeType} Fee`}
            customerName={payingFee.studentName}
            feeId={payingFee.id}
            onSuccess={handlePaymentSuccess}
            onFailure={() => { toast.error('Payment failed'); }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ icon: Icon, label, value, mono, span2 }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean; span2?: boolean }) {
  return (<div className={`flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 ${span2 ? 'sm:col-span-2' : ''}`}><div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-500" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p><p className={`text-sm font-medium text-slate-700 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p></div></div>);
}

