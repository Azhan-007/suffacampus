'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { EventService } from '@/services/eventService';
import { Event } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Input, Select, EmptyState, ConfirmDialog, ProfileAvatar } from '@/components/common';
import StatCard from '@/components/dashboard/StatCard';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import {
  Plus, Pencil, Trash2, Search, Download, Eye, X, Printer, RefreshCw,
  Calendar, CalendarDays, PartyPopper, Trophy, Users, Flag,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  MapPin, User2, FileText, Tag, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, isPast, isFuture, isToday } from 'date-fns';
import { PAGE_SIZE_OPTIONS, getErrorMessage } from '@/lib/utils';
import { eventSchema, validateFormData } from '@/lib/schemas';

type SortField = 'title' | 'eventDate' | 'eventType' | 'location';
type SortDir = 'asc' | 'desc';

const EVENT_TYPES = ['Holiday', 'Exam', 'Sports', 'Cultural', 'Meeting', 'Other'];
const AUDIENCE_OPTIONS = ['Students', 'Teachers', 'Parents', 'Staff', 'Everyone'];
const typeIcons: Record<string, React.ReactNode> = { Holiday: <CalendarDays className="w-4 h-4" />, Exam: <FileText className="w-4 h-4" />, Sports: <Trophy className="w-4 h-4" />, Cultural: <PartyPopper className="w-4 h-4" />, Meeting: <Users className="w-4 h-4" />, Other: <Flag className="w-4 h-4" /> };
const typeColors: Record<string, string> = { Holiday: 'text-emerald-700 bg-emerald-50', Exam: 'text-red-600 bg-red-50', Sports: 'text-blue-600 bg-blue-50', Cultural: 'text-violet-600 bg-violet-50', Meeting: 'text-amber-700 bg-amber-50', Other: 'text-slate-600 bg-slate-50' };

export default function EventsPage() {
  useDocumentTitle('Events');
  const { currentSchool, user } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || '';
  const queryClient = useQueryClient();

  // "" Data fetching via React Query ""
  const { data: events = [], isLoading: loading, dataUpdatedAt } = useApiQuery<Event[]>({
    queryKey: ['events', schoolId],
    path: '/events?limit=1000',
    enabled: !!schoolId,
  });
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTimeframe, setFilterTimeframe] = useState('');
  const [sortField, setSortField] = useState<SortField>('eventDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [viewingEvent, setViewingEvent] = useState<Event | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '', description: '', eventDate: '', endDate: '',
    eventType: 'Other' as 'Holiday' | 'Exam' | 'Sports' | 'Cultural' | 'Meeting' | 'Other',
    targetAudience: [] as string[], location: '', organizer: '', isActive: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const upcomingCount = useMemo(() => events.filter(e => isFuture(new Date(e.eventDate))).length, [events]);
  const todayCount = useMemo(() => events.filter(e => isToday(new Date(e.eventDate))).length, [events]);
  const pastCount = useMemo(() => events.filter(e => isPast(new Date(e.eventDate)) && !isToday(new Date(e.eventDate))).length, [events]);

  const filteredEvents = useMemo(() => {
    let list = events;
    if (searchTerm) { const q = searchTerm.toLowerCase(); list = list.filter(e => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q)); }
    if (filterType) list = list.filter(e => e.eventType === filterType);
    if (filterTimeframe === 'upcoming') list = list.filter(e => isFuture(new Date(e.eventDate)));
    else if (filterTimeframe === 'today') list = list.filter(e => isToday(new Date(e.eventDate)));
    else if (filterTimeframe === 'past') list = list.filter(e => isPast(new Date(e.eventDate)) && !isToday(new Date(e.eventDate)));
    return list;
  }, [events, searchTerm, filterType, filterTimeframe]);

  const sortedEvents = useMemo(() => {
    const sorted = [...filteredEvents];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = (a.title || '').localeCompare(b.title || ''); break;
        case 'eventDate': cmp = new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(); break;
        case 'eventType': cmp = (a.eventType || '').localeCompare(b.eventType || ''); break;
        case 'location': cmp = (a.location || '').localeCompare(b.location || ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredEvents, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedEvents.length / pageSize));
  const paginatedEvents = useMemo(() => { const s = (page - 1) * pageSize; return sortedEvents.slice(s, s + pageSize); }, [sortedEvents, page, pageSize]);
  useEffect(() => { setPage(1); }, [searchTerm, filterType, filterTimeframe, sortField, sortDir]);

  const allOnPageSelected = paginatedEvents.length > 0 && paginatedEvents.every(e => selectedIds.has(e.id));
  const someOnPageSelected = paginatedEvents.some(e => selectedIds.has(e.id));
  const toggleSelectAll = useCallback(() => { setSelectedIds(prev => { const n = new Set(prev); if (allOnPageSelected) paginatedEvents.forEach(e => n.delete(e.id)); else paginatedEvents.forEach(e => n.add(e.id)); return n; }); }, [allOnPageSelected, paginatedEvents]);
  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }, []);

  const toggleSort = (f: SortField) => { if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('asc'); } };
  const SortIcon = ({ field }: { field: SortField }) => { if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />; return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />; };

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterType) chips.push({ key: 'type', label: filterType, clear: () => setFilterType('') });
    if (filterTimeframe) chips.push({ key: 'time', label: filterTimeframe[0].toUpperCase() + filterTimeframe.slice(1), clear: () => setFilterTimeframe('') });
    if (searchTerm) chips.push({ key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') });
    return chips;
  }, [filterType, filterTimeframe, searchTerm]);
  const clearAllFilters = () => { setSearchTerm(''); setFilterType(''); setFilterTimeframe(''); };

  const resetForm = () => { setFormData({ title: '', description: '', eventDate: '', endDate: '', eventType: 'Other', targetAudience: [], location: '', organizer: '', isActive: true }); setFormErrors({}); setEditingEvent(null); };
  const handleOpenModal = (e?: Event) => {
    if (e) { setEditingEvent(e); setFormData({ title: e.title, description: e.description, eventDate: format(new Date(e.eventDate), 'yyyy-MM-dd'), endDate: e.endDate ? format(new Date(e.endDate), 'yyyy-MM-dd') : '', eventType: e.eventType, targetAudience: e.targetAudience || [], location: e.location || '', organizer: e.organizer || '', isActive: e.isActive }); }
    else resetForm();
    setIsModalOpen(true);
  };
  const handleCloseModal = () => { setIsModalOpen(false); resetForm(); };

  const validateForm = () => {
    const errors = validateFormData(eventSchema, formData);
    setFormErrors(errors ?? {});
    return errors === null;
  };

  const handleSubmit = async () => {
    if (!validateForm()) { toast.error('Please fill required fields'); return; }
    setIsSaving(true);
    try {
      const payload = { ...formData, eventDate: new Date(formData.eventDate), endDate: formData.endDate ? new Date(formData.endDate) : undefined, createdBy: 'admin' };
      if (editingEvent) { await EventService.updateEvent(schoolId, editingEvent.id, payload); queryClient.invalidateQueries({ queryKey: ['events'] }); toast.success('Event updated'); }
      else { await EventService.createEvent(schoolId, payload); queryClient.invalidateQueries({ queryKey: ['events'] }); toast.success('Event created'); }
      handleCloseModal();
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsSaving(false); }
  };

  const handleDelete = (id: string, name: string) => { setDeleteDialog({ isOpen: true, id, name }); };
  const confirmDelete = async () => { if (!deleteDialog.id) return; setIsDeleting(true); try { await EventService.deleteEvent(schoolId, deleteDialog.id); queryClient.invalidateQueries({ queryKey: ['events'] }); toast.success('Deleted'); setDeleteDialog({ isOpen: false, id: null, name: '' }); setSelectedIds(p => { const n = new Set(p); n.delete(deleteDialog.id!); return n; }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };
  const handleBulkDelete = () => { if (selectedIds.size === 0) return; setDeleteDialog({ isOpen: true, id: '__bulk__', name: `${selectedIds.size} event${selectedIds.size > 1 ? 's' : ''}` }); };
  const confirmBulkDelete = async () => { setIsDeleting(true); try { for (const id of Array.from(selectedIds)) await EventService.deleteEvent(schoolId, id); queryClient.invalidateQueries({ queryKey: ['events'] }); toast.success(`${selectedIds.size} deleted`); setSelectedIds(new Set()); setDeleteDialog({ isOpen: false, id: null, name: '' }); } catch (e) { toast.error(getErrorMessage(e)); } finally { setIsDeleting(false); } };

  const handleViewEvent = (e: Event) => { setViewingEvent(e); setIsViewModalOpen(true); };

  const getExportData = () => {
    const headers = ['Title', 'Type', 'Date', 'End Date', 'Location', 'Organizer', 'Audience'];
    const rows = filteredEvents.map(e => [e.title, e.eventType, format(new Date(e.eventDate), 'yyyy-MM-dd'), e.endDate ? format(new Date(e.endDate), 'yyyy-MM-dd') : '', e.location || '', e.organizer || '', (e.targetAudience || []).join('; ')]);
    return { headers, rows };
  };
  const handleExportPrint = () => {
    const { headers, rows } = getExportData();
    exportToPrint({ title: 'School Events', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `events-${format(new Date(), 'yyyy-MM-dd')}` });
  };
  const handleExportCSV = () => {
    const { headers, rows } = getExportData();
    exportToCSV({ title: 'School Events', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `events-${format(new Date(), 'yyyy-MM-dd')}` });
  };

  const toggleAudience = (a: string) => { setFormData(prev => ({ ...prev, targetAudience: prev.targetAudience.includes(a) ? prev.targetAudience.filter(x => x !== a) : [...prev.targetAudience, a] })); };

  if (loading) { return (<DashboardLayout><div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Loading events...</p></div></div></DashboardLayout>); }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Events</h1><p className="text-base text-slate-500 mt-1">Manage school events and calendar</p>{lastSynced && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-xs text-emerald-600 font-medium">Live synced - {format(lastSynced, 'h:mm:ss a')}</span>
                </div>
              )}</div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && <Button variant="secondary" onClick={handleBulkDelete}><Trash2 className="w-4 h-4 text-red-500" /><span className="text-red-600">Delete ({selectedIds.size})</span></Button>}
            <Button variant="secondary" onClick={handleExportPrint}><Printer className="w-4 h-4" /><span className="hidden sm:inline">Print</span></Button>
            <Button variant="secondary" onClick={handleExportCSV}><Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span></Button>
            <Button onClick={() => handleOpenModal()}><Plus className="w-4 h-4" /><span>Add Event</span></Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Events" value={events.length} icon={Calendar} color="blue" subtitle="All events" loading={loading} />
          <StatCard title="Upcoming" value={upcomingCount} icon={CalendarDays} color="emerald" subtitle="Future events" loading={loading} />
          <StatCard title="Today" value={todayCount} icon={Clock} color="amber" subtitle="Happening today" loading={loading} />
          <StatCard title="Past" value={pastCount} icon={Flag} color="violet" subtitle="Completed" loading={loading} />
        </div>

        {/* Filters */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 min-w-0"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search events..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all" /></div>
            <div className="flex gap-2 shrink-0">
              <div className="w-[140px]"><Select value={filterType} onChange={e => setFilterType(e.target.value)} placeholder="All Types" options={EVENT_TYPES.map(t => ({ value: t, label: t }))} /></div>
              <div className="w-[140px]"><Select value={filterTimeframe} onChange={e => setFilterTimeframe(e.target.value)} placeholder="All Time" options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'today', label: 'Today' }, { value: 'past', label: 'Past' }]} /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            {activeFilters.map(chip => (<span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium border border-blue-100">{chip.label}<button onClick={chip.clear} className="hover:text-blue-800 ml-0.5"><X className="w-3 h-3" /></button></span>))}
            {activeFilters.length > 0 && <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-red-500 font-medium flex items-center gap-1 ml-1 transition-colors"><X className="w-3 h-3" /> Clear all</button>}
            <span className="ml-auto text-xs text-slate-400 tabular-nums">{filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2"><h3 className="text-[14px] font-semibold text-slate-700">Event Records</h3><span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded tabular-nums border border-slate-100">{sortedEvents.length}</span></div>
            <div className="flex items-center gap-3"><span className="text-xs text-slate-400">Showing {sortedEvents.length > 0 ? (page - 1) * pageSize + 1 : 0}"{Math.min(page * pageSize, sortedEvents.length)}</span><div className="w-[100px]"><Select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n} rows` }))} /></div></div>
          </div>
          {paginatedEvents.length > 0 ? (
            <>
              <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="bg-slate-50 border-b border-slate-200">
                <th className="pl-5 pr-2 py-3 w-10"><input type="checkbox" checked={allOnPageSelected} ref={el => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }} onChange={toggleSelectAll} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></th>
                {[
                  { label: 'Event', field: 'title' as SortField, w: 'min-w-[250px]' }, { label: 'Type', field: 'eventType' as SortField, w: '' },
                  { label: 'Date', field: 'eventDate' as SortField, w: '' }, { label: 'Location', field: 'location' as SortField, w: '' },
                  { label: 'Audience', field: null, w: '' }, { label: 'Actions', field: null, w: 'w-[100px]' },
                ].map((col, i) => (
                  <th key={i} onClick={() => col.field && toggleSort(col.field)} className={`px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap ${col.w} ${col.field ? 'cursor-pointer select-none hover:text-slate-700 transition-colors' : ''}`}><span className="flex items-center gap-1">{col.label}{col.field && <SortIcon field={col.field} />}</span></th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedEvents.map(ev => {
                  const isSelected = selectedIds.has(ev.id);
                  const isPastEvent = isPast(new Date(ev.eventDate)) && !isToday(new Date(ev.eventDate));
                  return (
                    <tr key={ev.id} className={`group transition-colors duration-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="pl-5 pr-2 py-3"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(ev.id)} className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer" /></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><ProfileAvatar name={ev.title} size="sm" /><div className="min-w-0"><button onClick={() => handleViewEvent(ev)} className="font-semibold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left truncate max-w-[210px] block">{ev.title}</button><p className="text-xs text-slate-400 truncate max-w-[210px]">{ev.description}</p></div></div></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${typeColors[ev.eventType]}`}>{typeIcons[ev.eventType]}{ev.eventType}</span></td>
                      <td className="px-4 py-3">
                        <div><span className={`text-sm whitespace-nowrap ${isPastEvent ? 'text-slate-400' : 'text-slate-700'}`}>{format(new Date(ev.eventDate), 'dd MMM yyyy')}</span>
                        {isToday(new Date(ev.eventDate)) && <span className="text-xs text-amber-600 bg-amber-50 px-1 py-0.5 rounded ml-1">Today</span>}
                        {ev.endDate && <p className="text-xs text-slate-400">to {format(new Date(ev.endDate), 'dd MMM yyyy')}</p>}</div>
                      </td>
                      <td className="px-4 py-3"><span className="text-sm text-slate-600">{ev.location || '"'}</span></td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(ev.targetAudience || []).slice(0, 2).map((a, i) => (<span key={i} className="text-xs font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{a}</span>))}{(ev.targetAudience?.length || 0) > 2 && <span className="text-xs text-slate-400">+{(ev.targetAudience?.length || 0) - 2}</span>}</div></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"><button onClick={() => handleViewEvent(ev)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Eye className="w-4 h-4" /></button><button onClick={() => handleOpenModal(ev)} className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"><Pencil className="w-4 h-4" /></button><button onClick={() => handleDelete(ev.id, ev.title)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button></div></td>
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
          ) : (<div className="p-8"><EmptyState icon={<Calendar className="w-16 h-16" />} title="No events found" description={searchTerm || filterType || filterTimeframe ? 'Try adjusting your filters' : 'Get started by adding events'} action={!searchTerm ? { label: 'Add Event', onClick: () => handleOpenModal() } : undefined} /></div>)}
        </div>

        {/* Add/Edit Modal */}
        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingEvent ? 'Edit Event' : 'Create Event'} subtitle={editingEvent ? `Editing ${editingEvent.title}` : 'Enter event details'} size="xl">
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Calendar className="w-3.5 h-3.5 text-blue-600" /></div><h4 className="text-sm font-medium text-slate-700">Event Details</h4></div>
              <div className="grid grid-cols-1 gap-4">
                <Input label="Title *" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} error={formErrors.title} placeholder="Event title" />
                <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label><textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} placeholder="Event description..." className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all resize-none" /></div>
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Tag className="w-3.5 h-3.5 text-violet-600" /></div><h4 className="text-sm font-medium text-slate-700">Schedule & Type</h4></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="Event Type *" value={formData.eventType} onChange={e => setFormData({ ...formData, eventType: e.target.value as any })} error={formErrors.eventType} options={EVENT_TYPES.map(t => ({ value: t, label: t }))} />
                <Input label="Event Date *" type="date" value={formData.eventDate} onChange={e => setFormData({ ...formData, eventDate: e.target.value })} error={formErrors.eventDate} />
                <Input label="End Date" type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Input label="Location" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="School Auditorium" />
                <Input label="Organizer" value={formData.organizer} onChange={e => setFormData({ ...formData, organizer: e.target.value })} placeholder="Name" />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div>
              <div className="flex items-center gap-2 mb-4"><div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><Users className="w-3.5 h-3.5 text-emerald-600" /></div><h4 className="text-sm font-medium text-slate-700">Target Audience</h4></div>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_OPTIONS.map(a => (<button key={a} onClick={() => toggleAudience(a)} className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${formData.targetAudience.includes(a) ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-600'}`}>{a}</button>))}
              </div>
            </div>
          </div>
          <div className="form-actions"><Button variant="secondary" onClick={handleCloseModal} disabled={isSaving}>Cancel</Button><Button onClick={handleSubmit} isLoading={isSaving}>{editingEvent ? 'Save Changes' : 'Create Event'}</Button></div>
        </Modal>

        {/* View Modal */}
        <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Event Details" subtitle="Complete event information" size="lg">
          {viewingEvent && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-200">
                <ProfileAvatar name={viewingEvent.title} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">{viewingEvent.title}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${typeColors[viewingEvent.eventType]}`}>{typeIcons[viewingEvent.eventType]}{viewingEvent.eventType}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{format(new Date(viewingEvent.eventDate), 'MMMM dd, yyyy')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={Calendar} label="Event Date" value={format(new Date(viewingEvent.eventDate), 'MMMM dd, yyyy')} />
                {viewingEvent.endDate && <InfoRow icon={Calendar} label="End Date" value={format(new Date(viewingEvent.endDate), 'MMMM dd, yyyy')} />}
                <InfoRow icon={Tag} label="Type" value={viewingEvent.eventType} />
                <InfoRow icon={MapPin} label="Location" value={viewingEvent.location || 'Not specified'} />
                <InfoRow icon={User2} label="Organizer" value={viewingEvent.organizer || 'Not specified'} />
                <InfoRow icon={Users} label="Audience" value={(viewingEvent.targetAudience || []).join(', ') || 'Everyone'} />
                {viewingEvent.description && <InfoRow icon={FileText} label="Description" value={viewingEvent.description} span2 />}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100"><Button variant="secondary" onClick={() => setIsViewModalOpen(false)}>Close</Button><Button onClick={() => { setIsViewModalOpen(false); handleOpenModal(viewingEvent); }}><Pencil className="w-3.5 h-3.5" /> Edit Event</Button></div>
            </div>
          )}
        </Modal>

        <ConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, id: null, name: '' })} onConfirm={deleteDialog.id === '__bulk__' ? confirmBulkDelete : confirmDelete} title="Delete Event" message={`Are you sure you want to delete ${deleteDialog.name}?`} confirmText="Delete" cancelText="Cancel" type="danger" isLoading={isDeleting} />
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ icon: Icon, label, value, mono, span2 }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean; span2?: boolean }) {
  return (<div className={`flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100 ${span2 ? 'sm:col-span-2' : ''}`}><div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-500" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p><p className={`text-sm font-medium text-slate-700 mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p></div></div>);
}

