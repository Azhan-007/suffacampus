'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LibraryService } from '@/services/libraryService';
import { Library } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Input, Select, EmptyState, ConfirmDialog, ProfileAvatar } from '@/components/common';
import StatCard from '@/components/dashboard/StatCard';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import {
  Plus, Pencil, Trash2, Search, Download, Eye, X,
  BookOpen, BookCopy, BookMarked, AlertCircle, Library as LibraryIcon,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  User2, Hash, Calendar, FileText, Tag, Printer, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { PAGE_SIZE_OPTIONS, getErrorMessage } from '@/lib/utils';
import { bookSchema, validateFormData } from '@/lib/schemas';

type SortField = 'title' | 'author' | 'category' | 'availableCopies' | 'status';
type SortDir = 'asc' | 'desc';

const CATEGORIES = ['Fiction', 'Non-Fiction', 'Reference', 'Science', 'Mathematics', 'History', 'Geography', 'Literature', 'Technology', 'Arts', 'Biography', 'Other'];
const statusStyle: Record<string, string> = { Available: 'text-emerald-700 bg-emerald-50', Issued: 'text-amber-700 bg-amber-50' };
const statusDot: Record<string, string> = { Available: 'bg-emerald-500', Issued: 'bg-amber-500' };

export default function LibraryPage() {
  useDocumentTitle('Library');
  const { currentSchool } = useAuthStore();
  const queryClient = useQueryClient();

  // â”€â”€ Data fetching via React Query â”€â”€
  const { data: books = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Library[]>({
    queryKey: ['library'],
    path: '/library/books?limit=1000',
  });
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Library | null>(null);
  const [viewingBook, setViewingBook] = useState<Library | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '', author: '', category: '', isbn: '', totalCopies: 1, availableCopies: 1,
    publishedYear: '', publisher: '', description: '', isActive: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const totalBooks = books.length;
  const availableCount = useMemo(() => books.filter(b => b.status === 'Available').length, [books]);
  const issuedCount = useMemo(() => books.reduce((s, b) => s + (b.issuedCount || 0), 0), [books]);
  const totalCopies = useMemo(() => books.reduce((s, b) => s + (b.totalCopies || 0), 0), [books]);

  const filteredBooks = useMemo(() => {
    let list = books;
    if (searchTerm) { const q = searchTerm.toLowerCase(); list = list.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || (b.isbn || '').toLowerCase().includes(q)); }
    if (filterCategory) list = list.filter(b => b.category === filterCategory);
    if (filterStatus) list = list.filter(b => b.status === filterStatus);
    return list;
  }, [books, searchTerm, filterCategory, filterStatus]);

  const sortedBooks = useMemo(() => {
    const sorted = [...filteredBooks];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = a.title.localeCompare(b.title); break;
        case 'author': cmp = a.author.localeCompare(b.author); break;
        case 'category': cmp = a.category.localeCompare(b.category); break;
        case 'availableCopies': cmp = a.availableCopies - b.availableCopies; break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredBooks, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedBooks.length / pageSize));
  const paginatedBooks = useMemo(() => { const s = (page - 1) * pageSize; return sortedBooks.slice(s, s + pageSize); }, [sortedBooks, page, pageSize]);
  useEffect(() => { setPage(1); }, [searchTerm, filterCategory, filterStatus, sortField, sortDir]);

  const allOnPageSelected = paginatedBooks.length > 0 && paginatedBooks.every(b => selectedIds.has(b.id));
  const someOnPageSelected = paginatedBooks.some(b => selectedIds.has(b.id));
  const toggleSelectAll = useCallback(() => { setSelectedIds(prev => { const n = new Set(prev); if (allOnPageSelected) paginatedBooks.forEach(b => n.delete(b.id)); else paginatedBooks.forEach(b => n.add(b.id)); return n; }); }, [allOnPageSelected, paginatedBooks]);
  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);

  const toggleSort = (f: SortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc'); } };
  const SortIcon = ({ field }: { field: SortField }) => { if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />; return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />; };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterCategory) chips.push({ key: 'cat', label: filterCategory, clear: () => setFilterCategory('') });
    if (filterStatus) chips.push({ key: 'status', label: filterStatus, clear: () => setFilterStatus('') });
    if (searchTerm) chips.push({ key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') });
    return chips;
  }, [filterCategory, filterStatus, searchTerm]);
  const clearAllFilters = () => { setSearchTerm(''); setFilterCategory(''); setFilterStatus(''); };

  const resetForm = () => { setFormData({ title: '', author: '', category: '', isbn: '', totalCopies: 1, availableCopies: 1, publishedYear: '', publisher: '', description: '', isActive: true }); setFormErrors({}); setEditingBook(null); };
  const handleOpenModal = (b?: Library) => {
    if (b) { setEditingBook(b); setFormData({ title: b.title, author: b.author, category: b.category, isbn: b.isbn || '', totalCopies: b.totalCopies, availableCopies: b.availableCopies, publishedYear: b.publishedYear?.toString() || '', publisher: b.publisher || '', description: b.description || '', isActive: b.isActive }); }
    else resetForm();
    setIsModalOpen(true);
  };
  const handleCloseModal = () => { setIsModalOpen(false); resetForm(); };

  const validateForm = () => {
    const errors = validateFormData(bookSchema, formData);
    setFormErrors(errors ?? {});
    return errors === null;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { toast.error('Please fill required fields'); return; }
    setIsSaving(true);
    try {
      const payload = { ...formData, publishedYear: formData.publishedYear ? parseInt(formData.publishedYear) : undefined, issuedCount: formData.totalCopies - formData.availableCopies, status: formData.availableCopies > 0 ? 'Available' as const : 'Issued' as const };
      if (editingBook) { await LibraryService.updateBook(editingBook.id, payload); queryClient.invalidateQueries({ queryKey: ['library'] }); toast.success('Book updated'); }
      else { await LibraryService.createBook(payload); queryClient.invalidateQueries({ queryKey: ['library'] }); toast.success('Book added'); }
      handleCloseModal();
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsSaving(false); }
  };

  const handleDelete = (id: string, name: string) => { setDeleteDialog({ isOpen: true, id, name }); };
  const confirmDelete = async () => { if (!deleteDialog.id) return; setIsDeleting(true); try { await LibraryService.deleteBook(deleteDialog.id); queryClient.invalidateQueries({ queryKey: ['library'] }); toast.success('Deleted'); setDeleteDialog({ isOpen: false, id: null, name: '' }); setSelectedIds(p => { const n = new Set(p); n.delete(deleteDialog.id!); return n; }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };
  const handleBulkDelete = () => { if (selectedIds.size === 0) return; setDeleteDialog({ isOpen: true, id: '__bulk__', name: `${selectedIds.size} book${selectedIds.size > 1 ? 's' : ''}` }); };
  const confirmBulkDelete = async () => { setIsDeleting(true); try { for (const id of Array.from(selectedIds)) await LibraryService.deleteBook(id); queryClient.invalidateQueries({ queryKey: ['library'] }); toast.success(`${selectedIds.size} deleted`); setSelectedIds(new Set()); setDeleteDialog({ isOpen: false, id: null, name: '' }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };

  const handleViewBook = (b: Library) => { setViewingBook(b); setIsViewModalOpen(true); };

  const handleExportPrint = () => {
    const headers = ['Title', 'Author', 'Category', 'ISBN', 'Total Copies', 'Available', 'Issued', 'Status'];
    const rows = filteredBooks.map(b => [b.title, b.author, b.category, b.isbn || '', String(b.totalCopies), String(b.availableCopies), String(b.issuedCount || 0), b.status]);
    exportToPrint({ title: 'Library Records', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `library-${format(new Date(), 'yyyy-MM-dd')}` });
  };

  const handleExportCSV = () => {
    const headers = ['Title', 'Author', 'Category', 'ISBN', 'Total Copies', 'Available', 'Issued', 'Status'];
    const rows = filteredBooks.map(b => [b.title, b.author, b.category, b.isbn || '', String(b.totalCopies), String(b.availableCopies), String(b.issuedCount || 0), b.status]);
    exportToCSV({ title: 'Library Records', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `library-${format(new Date(), 'yyyy-MM-dd')}` });
    toast.success('Exported');
  };

  if (loading) { return (<DashboardLayout><div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Loading library...</p></div></div></DashboardLayout>); }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Library</h1>
              <p className="text-base text-slate-500 mt-1">Manage books and inventory</p>
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
            <Button onClick={() => handleOpenModal()}><Plus className="w-4 h-4" /><span>Add Book</span></Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Books" value={totalBooks} icon={BookOpen} color="blue" subtitle={`${totalCopies} total copies`} loading={loading} />
          <StatCard title="Available" value={availableCount} icon={BookMarked} color="emerald" subtitle={`${totalBooks > 0 ? Math.round((availableCount / totalBooks) * 100) : 0}% available`} loading={loading} />
          <StatCard title="Issued" value={issuedCount} icon={BookCopy} color="amber" subtitle="Copies issued" loading={loading} />
          <StatCard title="Categories" value={new Set(books.map(b => b.category)).size} icon={Tag} color="violet" subtitle="Book categories" loading={loading} />
        </div>

        {/* Filters */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search by title, author, or ISBN..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all" /></div>
            <div className="flex gap-2 shrink-0">
              <div className="w-[150px]"><Select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} placeholder="All Categories" options={CATEGORIES.map(c => ({ value: c, label: c }))} /></div>
              <div className="w-[130px]"><Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} placeholder="All Status" options={[{ value: 'Available', label: 'Available' }, { value: 'Issued', label: 'Issued' }]} /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            {activeFilters.map(chip => (<span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-100">{chip.label}<button onClick={chip.clear} className="hover:text-blue-800 ml-0.5"><X className="w-3 h-3" /></button></span>))}
            {activeFilters.length > 0 && <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 ml-1 transition-colors"><X className="w-3 h-3" /> Clear all</button>}
            <span className="ml-auto text-xs text-slate-400 tabular-nums">{filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2"><h3 className="text-[14px] font-semibold text-slate-700">Book Catalog</h3><span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">{sortedBooks.length}</span></div>
            <div className="flex items-center gap-3"><span className="text-xs text-slate-400">Showing {sortedBooks.length > 0 ? (page - 1) * pageSize + 1 : 0}â€“{Math.min(page * pageSize, sortedBooks.length)}</span><div className="w-[100px]"><Select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n} rows` }))} /></div></div>
          </div>
          {paginatedBooks.length > 0 ? (
            <>
              <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="bg-slate-50 border-b border-slate-200">
                <th className="pl-5 pr-2 py-3 w-10"><input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }} onChange={toggleSelectAll} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></th>
                {[
                  { label: 'Book', field: 'title' as SortField, w: 'min-w-[250px]' }, { label: 'Author', field: 'author' as SortField, w: '' },
                  { label: 'Category', field: 'category' as SortField, w: '' }, { label: 'Copies', field: 'availableCopies' as SortField, w: '' },
                  { label: 'Issued', field: null, w: '' }, { label: 'Status', field: 'status' as SortField, w: '' },
                  { label: 'Actions', field: null, w: 'w-[100px]' },
                ].map((col, i) => (
                  <th key={i} onClick={() => col.field && toggleSort(col.field)} className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.w} ${col.field ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}`}><span className="flex items-center gap-1">{col.label}{col.field && <SortIcon field={col.field} />}</span></th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedBooks.map(b => {
                  const isSelected = selectedIds.has(b.id);
                  return (
                    <tr key={b.id} className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="pl-5 pr-2 py-3"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(b.id)} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><ProfileAvatar name={b.title} size="sm" shape="rounded" /><div className="min-w-0"><button onClick={() => handleViewBook(b)} className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left truncate max-w-[200px] block">{b.title}</button><p className="text-xs text-slate-400 truncate max-w-[200px]">{b.isbn || 'No ISBN'}</p></div></div></td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-700">{b.author}</span></td>
                      <td className="px-4 py-3"><span className="text-xs font-medium text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{b.category}</span></td>
                      <td className="px-4 py-3"><span className="text-sm font-medium text-slate-700 tabular-nums">{b.availableCopies}<span className="text-slate-400">/{b.totalCopies}</span></span></td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-600 tabular-nums">{b.issuedCount || 0}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${statusStyle[b.status]}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot[b.status]}`} />{b.status}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"><button onClick={() => handleViewBook(b)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Eye className="w-4 h-4" /></button><button onClick={() => handleOpenModal(b)} className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="w-4 h-4" /></button><button onClick={() => handleDelete(b.id, b.title)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button></div></td>
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
          ) : (<div className="p-8"><EmptyState icon={<BookOpen className="w-16 h-16" />} title="No books found" description={searchTerm || filterCategory || filterStatus ? 'Try adjusting your filters' : 'Get started by adding books'} action={!searchTerm ? { label: 'Add Book', onClick: () => handleOpenModal() } : undefined} /></div>)}
        </div>

        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingBook ? 'Edit Book' : 'Add Book'} subtitle={editingBook ? `Editing ${editingBook.title}` : 'Enter book details'} size="xl">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><BookOpen className="w-3.5 h-3.5 text-blue-600" /></div><h4 className="text-sm font-medium text-slate-700">Book Information</h4></div>
              <div className="grid grid-cols-1 gap-4">
                <Input label="Title *" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} error={formErrors.title} placeholder="Book title" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Author *" value={formData.author} onChange={e => setFormData({ ...formData, author: e.target.value })} error={formErrors.author} placeholder="Author name" />
                  <Select label="Category *" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} error={formErrors.category} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
                </div>
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Hash className="w-3.5 h-3.5 text-violet-600" /></div><h4 className="text-sm font-medium text-slate-700">Publication Details</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="ISBN" value={formData.isbn} onChange={e => setFormData({ ...formData, isbn: e.target.value })} placeholder="ISBN number" />
                <Input label="Publisher" value={formData.publisher} onChange={e => setFormData({ ...formData, publisher: e.target.value })} placeholder="Publisher name" />
                <Input label="Published Year" value={formData.publishedYear} onChange={e => setFormData({ ...formData, publishedYear: e.target.value })} placeholder="2024" />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><BookCopy className="w-3.5 h-3.5 text-emerald-600" /></div><h4 className="text-sm font-medium text-slate-700">Inventory</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Total Copies *" type="number" value={formData.totalCopies.toString()} onChange={e => setFormData({ ...formData, totalCopies: parseInt(e.target.value) || 0 })} error={formErrors.totalCopies} />
                <Input label="Available Copies" type="number" value={formData.availableCopies.toString()} onChange={e => setFormData({ ...formData, availableCopies: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label><textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} placeholder="Book description..." className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all resize-none" /></div>
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={handleCloseModal} disabled={isSaving}>Cancel</Button><Button onClick={handleSubmit} isLoading={isSaving}>{editingBook ? 'Save Changes' : 'Add Book'}</Button></div>
        </Modal>

        {/* View Modal */}
        <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Book Details" subtitle="Complete book information" size="lg">
          {viewingBook && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <ProfileAvatar name={viewingBook.title} size="lg" shape="rounded" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">{viewingBook.title}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{viewingBook.category}</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded ${statusStyle[viewingBook.status]}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot[viewingBook.status]}`} />{viewingBook.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">by {viewingBook.author}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={User2} label="Author" value={viewingBook.author} />
                <InfoRow icon={Tag} label="Category" value={viewingBook.category} />
                <InfoRow icon={Hash} label="ISBN" value={viewingBook.isbn || 'N/A'} mono />
                <InfoRow icon={FileText} label="Publisher" value={viewingBook.publisher || 'N/A'} />
                <InfoRow icon={Calendar} label="Published Year" value={viewingBook.publishedYear?.toString() || 'N/A'} />
                <InfoRow icon={BookCopy} label="Copies" value={`${viewingBook.availableCopies} available / ${viewingBook.totalCopies} total`} />
                <InfoRow icon={BookMarked} label="Issued" value={`${viewingBook.issuedCount || 0} copies`} />
                {viewingBook.description && <InfoRow icon={FileText} label="Description" value={viewingBook.description} span2 />}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100"><Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button><Button onClick={() => { setIsViewModalOpen(false); handleOpenModal(viewingBook); }}><Pencil className="w-3.5 h-3.5" /> Edit Book</Button></div>
            </div>
          )}
        </Modal>

        <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, id: null, name: '' })} onConfirm={deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete} title="Delete Book" message={`Are you sure you want to delete ${deleteDialog.name}?`} confirmText="Delete" cancelText="Cancel" type="danger" isLoading={isDeleting} />
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ icon: Icon, label, value, mono, span2 }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean; span2?: boolean }) {
  return (<div className={`flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 ${span2 ? 'sm:col-span-2' : ''}`}><div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-500" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p><p className={`text-sm font-medium text-slate-700 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p></div></div>);
}

