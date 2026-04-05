'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDocumentTitle, useApiQuery } from '@/hooks';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { AttendanceService } from '@/services/attendanceService';
import { Attendance, Student, Class } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal, Select, EmptyState, ConfirmDialog, Badge } from '@/components/common';
import StatCard from '@/components/dashboard/StatCard';
import { exportToPrint, exportToCSV } from '@/services/exportService';
import {
  ClipboardCheck,
  Search,
  Download,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  RefreshCw,
  Users,
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, subDays, isToday } from 'date-fns';
import { PAGE_SIZE_OPTIONS } from '@/lib/utils';

const STATUS_OPTIONS: { value: Attendance['status']; label: string }[] = [
  { value: 'Present', label: 'Present' },
  { value: 'Absent', label: 'Absent' },
  { value: 'Late', label: 'Late' },
  { value: 'Excused', label: 'Excused' },
];

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; badge: 'success' | 'danger' | 'warning' | 'info' }> = {
  Present: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-emerald-600', badge: 'success' },
  Absent:  { icon: <XCircle className="w-3.5 h-3.5" />,      color: 'text-red-600',     badge: 'danger' },
  Late:    { icon: <Clock className="w-3.5 h-3.5" />,         color: 'text-amber-600',   badge: 'warning' },
  Excused: { icon: <AlertCircle className="w-3.5 h-3.5" />,   color: 'text-blue-600',    badge: 'info' },
};

type SortField = 'studentName' | 'classId' | 'status' | 'date';
type SortDir = 'asc' | 'desc';

export default function AttendancePage() {
  useDocumentTitle('Attendance');
  const { user, currentSchool } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || '';
  const queryClient = useQueryClient();

  // â”€â”€ Data fetching via React Query â”€â”€
  const { data: attendance = [], isLoading: attendanceLoading, dataUpdatedAt } = useApiQuery<Attendance[]>({
    queryKey: ['attendance', schoolId],
    path: '/attendance',
    enabled: !!schoolId,
  });

  const { data: students = [], isLoading: studentsLoading } = useApiQuery<Student[]>({
    queryKey: ['students', schoolId],
    path: '/students',
    enabled: !!schoolId,
  });

  const { data: classes = [] } = useApiQuery<Class[]>({
    queryKey: ['classes', schoolId],
    path: '/classes/all',
    enabled: !!schoolId,
  });

  const CLASS_OPTIONS = useMemo(
    () => classes.filter(c => c.isActive !== false).map(c => ({ value: c.id, label: c.className })),
    [classes],
  );

  const classMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c.className])) as Record<string, string>,
    [classes],
  );

  const SECTION_OPTIONS = useMemo(() => {
    const names = new Set<string>();
    classes.filter(c => c.isActive !== false).forEach(c => c.sections?.forEach(s => names.add(s.sectionName)));
    return [...names].sort().map(n => ({ value: n, label: `Section ${n}` }));
  }, [classes]);

  const loading = attendanceLoading || studentsLoading;
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // â”€â”€ UI state â”€â”€
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<Attendance | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; id: string | null; name: string }>({ isOpen: false, id: null, name: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // â”€â”€ Filter state â”€â”€
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // â”€â”€ Sort & pagination â”€â”€
  const [sortField, setSortField] = useState<SortField>('studentName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // â”€â”€ Mark attendance form â”€â”€
  const [markClass, setMarkClass] = useState('');
  const [markSection, setMarkSection] = useState('');
  const [markDate, setMarkDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bulkStatuses, setBulkStatuses] = useState<Record<string, Attendance['status']>>({});
  const [bulkRemarks, setBulkRemarks] = useState<Record<string, string>>({});



  // â”€â”€ Derived stats â”€â”€
  const todayRecords = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return attendance.filter((a) => {
      try { return format(new Date(a.date), 'yyyy-MM-dd') === todayStr; } catch { return false; }
    });
  }, [attendance]);

  const totalToday = todayRecords.length;
  const presentToday = todayRecords.filter((a) => a.status === 'Present' || a.status === 'Late').length;
  const absentToday = todayRecords.filter((a) => a.status === 'Absent').length;
  const lateToday = todayRecords.filter((a) => a.status === 'Late').length;
  const attendanceRate = totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : 0;

  // â”€â”€ Filtered & sorted list â”€â”€
  const filteredRecords = useMemo(() => {
    let list = attendance;

    // Date filter
    if (filterDate) {
      list = list.filter((a) => {
        try { return format(new Date(a.date), 'yyyy-MM-dd') === filterDate; } catch { return false; }
      });
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter((a) => a.studentName.toLowerCase().includes(q));
    }
    if (filterClass) list = list.filter((a) => a.classId === filterClass);
    if (filterSection) list = list.filter((a) => a.sectionId === filterSection);
    if (filterStatus) list = list.filter((a) => a.status === filterStatus);

    return list;
  }, [attendance, searchTerm, filterClass, filterSection, filterStatus, filterDate]);

  const sortedRecords = useMemo(() => {
    const sorted = [...filteredRecords];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'studentName': cmp = a.studentName.localeCompare(b.studentName); break;
        case 'classId': cmp = a.classId.localeCompare(b.classId); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRecords, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const s = (page - 1) * pageSize;
    return sortedRecords.slice(s, s + pageSize);
  }, [sortedRecords, page, pageSize]);

  useEffect(() => { setPage(1); }, [searchTerm, filterClass, filterSection, filterStatus, filterDate, sortField, sortDir]);

  // â”€â”€ Sort helpers â”€â”€
  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(f); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  // â”€â”€ Active filters â”€â”€
  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterClass) {
      const cl = CLASS_OPTIONS.find((c) => c.value === filterClass);
      chips.push({ key: 'class', label: cl?.label || filterClass, clear: () => setFilterClass('') });
    }
    if (filterSection) chips.push({ key: 'section', label: `Section ${filterSection}`, clear: () => setFilterSection('') });
    if (filterStatus) chips.push({ key: 'status', label: filterStatus, clear: () => setFilterStatus('') });
    if (searchTerm) chips.push({ key: 'search', label: `"${searchTerm}"`, clear: () => setSearchTerm('') });
    return chips;
  }, [filterClass, filterSection, filterStatus, searchTerm, CLASS_OPTIONS]);

  const clearAllFilters = () => { setSearchTerm(''); setFilterClass(''); setFilterSection(''); setFilterStatus(''); };

  // â”€â”€ Mark attendance modal handlers â”€â”€
  const studentsForMark = useMemo(() => {
    if (!markClass) return [];
    let filtered = students.filter((s) => s.isActive && s.classId === markClass);
    if (markSection) filtered = filtered.filter((s) => s.sectionId === markSection);
    return filtered.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [students, markClass, markSection]);

  const handleOpenMarkModal = () => {
    setMarkClass('');
    setMarkSection('');
    setMarkDate(format(new Date(), 'yyyy-MM-dd'));
    setBulkStatuses({});
    setBulkRemarks({});
    setIsMarkModalOpen(true);
  };

  const handleMarkAll = (status: Attendance['status']) => {
    const newStatuses: Record<string, Attendance['status']> = {};
    studentsForMark.forEach((s) => { newStatuses[s.id] = status; });
    setBulkStatuses(newStatuses);
  };

  const handleSaveAttendance = async () => {
    if (!markClass) { toast.error('Please select a class'); return; }
    const records = studentsForMark
      .filter((s) => bulkStatuses[s.id])
      .map((s) => ({
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        classId: markClass,
        sectionId: markSection || s.sectionId || 'A',
        date: new Date(markDate),
        status: bulkStatuses[s.id],
        markedBy: user?.email || 'admin',
        remarks: bulkRemarks[s.id] || '',
      }));

    if (records.length === 0) { toast.error('Please mark at least one student'); return; }

    setIsSaving(true);
    try {
      await AttendanceService.bulkMarkAttendance(schoolId, records);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast.success(`Attendance marked for ${records.length} students`);
      setIsMarkModalOpen(false);
    } catch (err) {
      toast.error('Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  };

  // â”€â”€ Delete â”€â”€
  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    setIsDeleting(true);
    try {
      await AttendanceService.deleteAttendance(schoolId, deleteDialog.id);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Record deleted');
      setDeleteDialog({ isOpen: false, id: null, name: '' });
    } catch {
      toast.error('Failed to delete record');
    } finally {
      setIsDeleting(false);
    }
  };

  // â”€â”€ Export â”€â”€
  const handleExport = (type: 'csv' | 'print') => {
    const headers = ['Student', 'Class', 'Section', 'Date', 'Status', 'Remarks', 'Marked By'];
    const rows = sortedRecords.map((a) => [
      a.studentName,
      classMap[a.classId] || a.classId || '',
      a.sectionId,
      format(new Date(a.date), 'dd MMM yyyy'),
      a.status,
      a.remarks || '',
      a.markedBy,
    ]);
    const config = { title: 'Attendance Records', schoolName: currentSchool?.name || 'SuffaCampus School', headers, rows, filename: `attendance-${filterDate}` };
    if (type === 'csv') exportToCSV(config);
    else exportToPrint(config);
  };

  // â”€â”€ Quick date navigation â”€â”€
  const goToPrevDay = () => {
    const d = new Date(filterDate);
    d.setDate(d.getDate() - 1);
    setFilterDate(format(d, 'yyyy-MM-dd'));
  };
  const goToNextDay = () => {
    const d = new Date(filterDate);
    d.setDate(d.getDate() + 1);
    setFilterDate(format(d, 'yyyy-MM-dd'));
  };
  const goToToday = () => setFilterDate(format(new Date(), 'yyyy-MM-dd'));

  const isFilterDateToday = filterDate === format(new Date(), 'yyyy-MM-dd');

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <DashboardLayout>
      <div className="space-y-8">

        {/* â”€â”€ Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Attendance</h1>
            <p className="text-base text-slate-500 mt-1">Track and manage daily student attendance records</p>
            {lastSynced && (
              <div className="flex items-center gap-1.5 mt-2">
                <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="text-xs text-emerald-600 font-medium">Live synced Â· {format(lastSynced, 'h:mm:ss a')}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => handleExport('print')}>
              <Printer className="w-4 h-4" /><span className="hidden sm:inline">Print</span>
            </Button>
            <Button variant="secondary" onClick={() => handleExport('csv')}>
              <Download className="w-4 h-4" /><span className="hidden sm:inline">Export</span>
            </Button>
            <Button onClick={handleOpenMarkModal}>
              <ClipboardCheck className="w-4 h-4" /><span>Mark Attendance</span>
            </Button>
          </div>
        </div>

        {/* â”€â”€ Stat Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title="Total Marked" value={totalToday} icon={Users} color="blue" subtitle="Today" loading={loading} />
          <StatCard title="Present" value={presentToday} icon={UserCheck} color="emerald" subtitle={`${attendanceRate}% rate`} loading={loading} />
          <StatCard title="Absent" value={absentToday} icon={UserX} color="rose" loading={loading} />
          <StatCard title="Late" value={lateToday} icon={Clock} color="amber" loading={loading} />
        </div>

        {/* â”€â”€ Date Navigation + Filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Date navigator */}
            <div className="flex items-center gap-2">
              <button onClick={goToPrevDay} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="text-sm font-medium text-slate-700 border-0 bg-transparent cursor-pointer focus:outline-none"
                />
              </div>
              <button onClick={goToNextDay} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              {!isFilterDateToday && (
                <button onClick={goToToday} className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                  Today
                </button>
              )}
            </div>

            <div className="hidden lg:block w-px h-7 bg-slate-200" />

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search student..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                options={CLASS_OPTIONS}
                placeholder="All Classes"
              />
              <Select
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
                options={SECTION_OPTIONS}
                placeholder="Section"
              />
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                placeholder="Status"
              />
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">Filters:</span>
              {activeFilters.map((f) => (
                <span key={f.key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg">
                  {f.label}
                  <button onClick={f.clear} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {activeFilters.length > 1 && (
                <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-slate-600">Clear all</button>
              )}
            </div>
          )}
        </div>

        {/* â”€â”€ Attendance Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          {filteredRecords.length === 0 && !loading ? (
            <EmptyState
              icon={<ClipboardCheck className="w-8 h-8" />}
              title="No attendance records"
              description={activeFilters.length > 0 ? 'Try adjusting your filters.' : 'Click "Mark Attendance" to record attendance for a class.'}
              action={{ label: activeFilters.length > 0 ? 'Clear Filters' : 'Mark Attendance', onClick: activeFilters.length > 0 ? clearAllFilters : handleOpenMarkModal }}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <th className="text-left px-6 py-3">
                        <button onClick={() => toggleSort('studentName')} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-700">
                          Student <SortIcon field="studentName" />
                        </button>
                      </th>
                      <th className="text-left px-6 py-3">
                        <button onClick={() => toggleSort('classId')} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-700">
                          Class <SortIcon field="classId" />
                        </button>
                      </th>
                      <th className="text-left px-6 py-3">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Section</span>
                      </th>
                      <th className="text-left px-6 py-3">
                        <button onClick={() => toggleSort('date')} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-700">
                          Date <SortIcon field="date" />
                        </button>
                      </th>
                      <th className="text-left px-6 py-3">
                        <button onClick={() => toggleSort('status')} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-700">
                          Status <SortIcon field="status" />
                        </button>
                      </th>
                      <th className="text-left px-6 py-3">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Remarks</span>
                      </th>
                      <th className="text-right px-6 py-3">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-32" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-12" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                          <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-8 ml-auto" /></td>
                        </tr>
                      ))
                    ) : (
                      paginatedRecords.map((record) => {
                        const statusCfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.Present;
                        return (
                          <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-sm font-medium text-slate-900">{record.studentName}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {classMap[record.classId] || record.classId}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{record.sectionId}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {format(new Date(record.date), 'dd MMM yyyy')}
                            </td>
                            <td className="px-6 py-4">
                              <Badge variant={statusCfg.badge} size="sm">{record.status}</Badge>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-400 max-w-[200px] truncate">
                              {record.remarks || 'â€”'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => { setViewingRecord(record); setIsViewModalOpen(true); }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="View"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteDialog({ isOpen: true, id: record.id, name: record.studentName })}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Delete"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-white">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-slate-400">Page <span className="font-semibold text-slate-600">{page}</span> of <span className="font-semibold text-slate-600">{totalPages}</span></p>
                    <div className="w-[100px]"><Select value={String(pageSize)} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: `${n} rows` }))} /></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) pageNum = i + 1;
                      else if (page <= 3) pageNum = i + 1;
                      else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = page - 2 + i;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            page === pageNum ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-700 border border-transparent hover:border-slate-200'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* â”€â”€ Mark Attendance Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        isOpen={isMarkModalOpen}
        onClose={() => setIsMarkModalOpen(false)}
        title="Mark Attendance"
        subtitle="Select a class and mark attendance for each student."
        size="xl"
      >
        <div className="space-y-6">
          {/* Class & Date selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Class"
              value={markClass}
              onChange={(e) => setMarkClass(e.target.value)}
              options={CLASS_OPTIONS}
              placeholder="Select class"
              required
            />
            <Select
              label="Section"
              value={markSection}
              onChange={(e) => setMarkSection(e.target.value)}
              options={SECTION_OPTIONS}
              placeholder="All sections"
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
              <input
                type="date"
                value={markDate}
                onChange={(e) => setMarkDate(e.target.value)}
                className="w-full h-11 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Quick actions */}
          {markClass && studentsForMark.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Quick:</span>
              <button onClick={() => handleMarkAll('Present')} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                All Present
              </button>
              <button onClick={() => handleMarkAll('Absent')} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                All Absent
              </button>
              <button onClick={() => setBulkStatuses({})} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                Clear All
              </button>
              <span className="ml-auto text-xs text-slate-400">
                {Object.keys(bulkStatuses).length}/{studentsForMark.length} marked
              </span>
            </div>
          )}

          {/* Student list */}
          {!markClass ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Select a class to view students</p>
            </div>
          ) : studentsForMark.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No active students in this class</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Student</th>
                    <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-20">
                      <span className="flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /></span>
                    </th>
                    <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-20">
                      <span className="flex items-center justify-center gap-1"><XCircle className="w-3 h-3 text-red-500" /></span>
                    </th>
                    <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-20">
                      <span className="flex items-center justify-center gap-1"><Clock className="w-3 h-3 text-amber-500" /></span>
                    </th>
                    <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-20">
                      <span className="flex items-center justify-center gap-1"><AlertCircle className="w-3 h-3 text-blue-500" /></span>
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentsForMark.map((student) => {
                    const sid = student.id;
                    const current = bulkStatuses[sid] || '';
                    return (
                      <tr key={sid} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-slate-700">
                            {student.firstName} {student.lastName}
                          </span>
                          <span className="text-xs text-slate-400 ml-2">{student.sectionId}</span>
                        </td>
                        {(['Present', 'Absent', 'Late', 'Excused'] as Attendance['status'][]).map((status) => (
                          <td key={status} className="px-2 py-2.5 text-center">
                            <button
                              onClick={() => setBulkStatuses((prev) => ({ ...prev, [sid]: status }))}
                              className={`w-8 h-8 rounded-lg transition-colors ${
                                current === status
                                  ? status === 'Present' ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300'
                                  : status === 'Absent' ? 'bg-red-100 text-red-700 ring-2 ring-red-300'
                                  : status === 'Late' ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
                                  : 'bg-blue-100 text-blue-700 ring-2 ring-blue-300'
                                  : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'
                              }`}
                            >
                              {status === 'Present' ? <CheckCircle2 className="w-4 h-4 mx-auto" />
                              : status === 'Absent' ? <XCircle className="w-4 h-4 mx-auto" />
                              : status === 'Late' ? <Clock className="w-4 h-4 mx-auto" />
                              : <AlertCircle className="w-4 h-4 mx-auto" />}
                            </button>
                          </td>
                        ))}
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            placeholder="Optional"
                            value={bulkRemarks[sid] || ''}
                            onChange={(e) => setBulkRemarks((prev) => ({ ...prev, [sid]: e.target.value }))}
                            className="w-full h-8 px-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-200">
          <Button variant="secondary" onClick={() => setIsMarkModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveAttendance} isLoading={isSaving} disabled={Object.keys(bulkStatuses).length === 0}>
            <Save className="w-4 h-4 mr-1.5" /> Save Attendance
          </Button>
        </div>
      </Modal>

      {/* â”€â”€ View Record Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => { setIsViewModalOpen(false); setViewingRecord(null); }}
        title="Attendance Record"
        subtitle={viewingRecord?.studentName}
        size="md"
      >
        {viewingRecord && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">Student</p>
                <p className="text-sm font-medium text-slate-900">{viewingRecord.studentName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Date</p>
                <p className="text-sm text-slate-700">{format(new Date(viewingRecord.date), 'dd MMMM yyyy')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Class</p>
                <p className="text-sm text-slate-700">{classMap[viewingRecord.classId] || viewingRecord.classId}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Section</p>
                <p className="text-sm text-slate-700">{viewingRecord.sectionId}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Status</p>
                <Badge variant={STATUS_CONFIG[viewingRecord.status]?.badge || 'info'}>
                  {viewingRecord.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Marked By</p>
                <p className="text-sm text-slate-700">{viewingRecord.markedBy}</p>
              </div>
            </div>
            {viewingRecord.remarks && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Remarks</p>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{viewingRecord.remarks}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* â”€â”€ Delete Confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, id: null, name: '' })}
        onConfirm={handleDelete}
        title="Delete Attendance Record"
        message={`Are you sure you want to delete the attendance record for "${deleteDialog.name}"?`}
        confirmText="Delete"
        type="danger"
        isLoading={isDeleting}
      />
    </DashboardLayout>
  );
}

