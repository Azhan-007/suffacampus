'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { SchoolService, PLAN_LIMITS } from '@/services/schoolService';
import { School, SubscriptionPlan, SubscriptionStatus } from '@/types';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import EmptyState from '@/components/common/EmptyState';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Building2,
  Users,
  CreditCard,
  Eye,
  AlertTriangle,
  ArrowUpDown,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SuperAdminSchoolsPage() {
  const router = useRouter();
  const { isSuperAdmin, setCurrentSchool, setAvailableSchools } = useAuthStore();

  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'createdAt' | 'students'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [saving, setSaving] = useState(false);
  const [adminCredentials, setAdminCredentials] = useState<{ email: string; password: string; displayName: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    website: '',
    principalName: '',
    subscriptionPlan: 'free' as SubscriptionPlan,
    subscriptionStatus: 'trial' as SubscriptionStatus,
    adminEmail: '',
    adminPassword: '',
    adminDisplayName: '',
  });

  const loadSchools = async () => {
    try {
      setLoading(true);
      const data = await SchoolService.getSchools();
      setSchools(data);
      // Also update auth store so the school selector stays in sync
      setAvailableSchools(data);
    } catch (error: any) {
      console.error('Error loading schools:', error);
      const msg = error?.message || String(error);
      toast.error(`Failed to load schools: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSchools(); }, []);

  const normalizeOptionalUrl = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const handleCreateSchool = async () => {
    if (!formData.name || !formData.email || !formData.city) {
      toast.error('Please fill in required fields (Name, Email, City)');
      return;
    }
    try {
      setSaving(true);
      const code = formData.code || formData.name.substring(0, 3).toUpperCase() + String(Date.now()).slice(-4);
      const limits = PLAN_LIMITS[formData.subscriptionPlan];

      const result = await SchoolService.createSchool({
        name: formData.name.trim(),
        code,
        address: formData.address.trim() || undefined,
        city: formData.city.trim(),
        state: formData.state.trim() || undefined,
        pincode: formData.pincode.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim(),
        website: normalizeOptionalUrl(formData.website),
        principalName: formData.principalName.trim() || undefined,
        primaryColor: '#4A90D9',
        secondaryColor: '#E6F4FE',
        subscriptionPlan: formData.subscriptionPlan,
        subscriptionStatus: formData.subscriptionStatus,
        subscriptionStartDate: new Date().toISOString(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        maxStudents: limits.maxStudents <= 0 ? 999999 : limits.maxStudents,
        maxTeachers: limits.maxTeachers <= 0 ? 999999 : limits.maxTeachers,
        maxStorage: limits.maxStorage <= 0 ? 999999 : limits.maxStorage,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        dateFormat: 'DD/MM/YYYY',
        currentSession: '2025-2026',
        isActive: true,
        createdBy: 'superadmin',
        // Admin creation fields
        ...(formData.adminEmail ? {
          adminEmail: formData.adminEmail.trim(),
          adminPassword: formData.adminPassword.trim() || undefined,
          adminDisplayName: formData.adminDisplayName.trim() || undefined,
        } : {}),
      });

      setShowCreateModal(false);
      resetForm();
      await loadSchools();

      // Show admin credentials if created
      if (result.adminCredentials) {
        setAdminCredentials(result.adminCredentials);
        setShowCredentials(true);
        toast.success('School & admin created! Save the credentials below.');
      } else {
        toast.success('School created successfully!');
      }
    } catch (error: any) {
      console.error('Error creating school:', error);
      const msg = error?.message || String(error);
      // Show field-level validation details if available
      const details = error?.details ?? error?.response?.error?.details;
      if (details && typeof details === 'object') {
        const entries = Object.entries(details as Record<string, unknown>);
        const first = entries.find(([, errs]) => Array.isArray(errs) ? errs.length > 0 : Boolean(errs));
        if (first) {
          const [field, errs] = first;
          const text = Array.isArray(errs) ? errs.join(', ') : String(errs);
          toast.error(`Failed to create school: ${field} - ${text}`, { duration: 8000 });
        } else {
          toast.error(`Failed to create school: ${msg}`, { duration: 8000 });
        }
      } else {
        toast.error(`Failed to create school: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSchool = async () => {
    if (!selectedSchool) return;
    try {
      setSaving(true);
      await SchoolService.updateSchool(selectedSchool.id, {
        name: formData.name.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        website: normalizeOptionalUrl(formData.website),
        principalName: formData.principalName.trim() || undefined,
        subscriptionPlan: formData.subscriptionPlan,
        subscriptionStatus: formData.subscriptionStatus,
      });

      setShowEditModal(false);
      setSelectedSchool(null);
      resetForm();
      await loadSchools();
      toast.success('School updated successfully!');
    } catch (error: any) {
      console.error('Error updating school:', error);
      const msg = error?.message || String(error);
      toast.error(`Failed to update school: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchool = async () => {
    if (!selectedSchool) return;
    try {
      await SchoolService.deleteSchool(selectedSchool.id);
      setShowDeleteConfirm(false);
      setSelectedSchool(null);
      await loadSchools();
      toast.success('School deactivated successfully');
    } catch (error: any) {
      console.error('Error deleting school:', error);
      const msg = error?.message || String(error);
      toast.error(`Failed to deactivate school: ${msg}`);
    }
  };

  const handleSwitchToSchool = (school: School) => {
    setCurrentSchool(school);
    router.push('/dashboard');
  };

  const openEditModal = (school: School) => {
    setSelectedSchool(school);
    setFormData({
      name: school.name,
      code: school.code,
      address: school.address,
      city: school.city,
      state: school.state,
      pincode: school.pincode,
      phone: school.phone,
      email: school.email,
      website: school.website || '',
      principalName: school.principalName || '',
      subscriptionPlan: school.subscriptionPlan,
      subscriptionStatus: school.subscriptionStatus,
      adminEmail: '',
      adminPassword: '',
      adminDisplayName: '',
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      website: '',
      principalName: '',
      subscriptionPlan: 'free',
      subscriptionStatus: 'trial',
      adminEmail: '',
      adminPassword: '',
      adminDisplayName: '',
    });
  };

  // ── Filtering & Sorting ─────────────────────────
  const filteredSchools = schools
    .filter((school) => {
      const matchesSearch =
        (school.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (school.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (school.city || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || school.subscriptionStatus === statusFilter;
      const matchesPlan = planFilter === 'all' || school.subscriptionPlan === planFilter;
      return matchesSearch && matchesStatus && matchesPlan;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'students':
          cmp = (a.currentStudents || 0) - (b.currentStudents || 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

  // ── Status / Plan badge helpers ──────────────────
  const getStatusVariant = (status: SubscriptionStatus): 'success' | 'warning' | 'danger' | 'default' => {
    switch (status) {
      case 'active': return 'success';
      case 'trial': return 'warning';
      case 'expired': return 'danger';
      default: return 'default';
    }
  };

  const getPlanColor = (plan: SubscriptionPlan): string => {
    switch (plan) {
      case 'enterprise': return 'bg-violet-100 text-violet-800';
      case 'pro': return 'bg-blue-100 text-blue-800';
      case 'basic': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const renderUsageBar = (school: School) => {
    const limits = PLAN_LIMITS[school.subscriptionPlan] ?? PLAN_LIMITS.free;
    const studentUsage = school.usage?.students || school.currentStudents || 0;
    const studentLimit = school.maxStudents ?? limits.maxStudents;
    const usagePercent = studentLimit <= 0 ? 0 : (studentUsage / studentLimit) * 100;

    return (
      <div className="space-y-1">
        <div className="flex items-center space-x-2 text-sm text-slate-600">
          <Users className="w-3.5 h-3.5 text-slate-300" />
          <span>{studentUsage} / {studentLimit <= 0 ? '∞' : studentLimit}</span>
        </div>
        {studentLimit > 0 && (
          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  // ── Form JSX ────────────────────────────────────
  const formContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="School Name *"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter school name"
        />
        <Input
          label="School Code"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          placeholder="Auto-generated if empty"
          disabled={!!selectedSchool}
        />
      </div>

      <Input
        label="Address"
        value={formData.address}
        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        placeholder="Enter full address"
      />

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="City *"
          value={formData.city}
          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          placeholder="City"
        />
        <Input
          label="State"
          value={formData.state}
          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          placeholder="State"
        />
        <Input
          label="Pincode"
          value={formData.pincode}
          onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
          placeholder="Pincode"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="+91 XXXXX XXXXX"
        />
        <Input
          label="Email *"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="school@example.com"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Website"
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          placeholder="https://..."
        />
        <Input
          label="Principal Name"
          value={formData.principalName}
          onChange={(e) => setFormData({ ...formData, principalName: e.target.value })}
          placeholder="Principal's name"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Subscription Plan"
          value={formData.subscriptionPlan}
          onChange={(e) => setFormData({ ...formData, subscriptionPlan: e.target.value as SubscriptionPlan })}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'basic', label: 'Basic' },
            { value: 'pro', label: 'Pro' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
        />
        <Select
          label="Status"
          value={formData.subscriptionStatus}
          onChange={(e) => setFormData({ ...formData, subscriptionStatus: e.target.value as SubscriptionStatus })}
          options={[
            { value: 'trial', label: 'Trial' },
            { value: 'active', label: 'Active' },
            { value: 'expired', label: 'Expired' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </div>

      {/* Plan limits preview */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <h4 className="text-sm font-medium text-slate-600 mb-2">Plan Limits</h4>
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-slate-400">Max Students: </span>
            <span className="font-medium text-slate-700">
              {PLAN_LIMITS[formData.subscriptionPlan].maxStudents <= 0 ? 'Unlimited' : PLAN_LIMITS[formData.subscriptionPlan].maxStudents}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Max Teachers: </span>
            <span className="font-medium text-slate-700">
              {PLAN_LIMITS[formData.subscriptionPlan].maxTeachers <= 0 ? 'Unlimited' : PLAN_LIMITS[formData.subscriptionPlan].maxTeachers}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Storage: </span>
            <span className="font-medium text-slate-700">
              {PLAN_LIMITS[formData.subscriptionPlan].maxStorage <= 0 ? 'Unlimited' : `${PLAN_LIMITS[formData.subscriptionPlan].maxStorage} MB`}
            </span>
          </div>
        </div>
      </div>

      {/* Admin Account — only show in create mode */}
      {!selectedSchool && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h4 className="text-sm font-semibold text-blue-700 mb-3">School Admin Account (Optional)</h4>
          <p className="text-xs text-blue-600 mb-3">Auto-create an admin user who can manage this school. Leave blank to skip.</p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Admin Email"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              placeholder="admin@school.com"
            />
            <Input
              label="Admin Password"
              type="text"
              value={formData.adminPassword}
              onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
              placeholder="Auto-generated if empty"
            />
          </div>
          <div className="mt-3">
            <Input
              label="Admin Display Name"
              value={formData.adminDisplayName}
              onChange={(e) => setFormData({ ...formData, adminDisplayName: e.target.value })}
              placeholder="e.g. School Admin"
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Schools Management</h1>
          <p className="text-base text-slate-500 mt-1">
            Manage all {schools.length} school{schools.length !== 1 ? 's' : ''} on the platform
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add School
        </Button>
      </div>

      {/* ── Stats Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-semibold text-slate-800">{schools.length}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-semibold text-slate-800">{schools.filter(s => s.subscriptionStatus === 'active').length}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-semibold text-slate-800">{schools.filter(s => s.subscriptionStatus === 'trial').length}</p>
              <p className="text-xs text-slate-500">Trial</p>
            </div>
          </div>
        </div>
        <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-xl font-semibold text-slate-800">
                {schools.reduce((acc, s) => acc + (s.usage?.students || s.currentStudents || 0), 0)}
              </p>
              <p className="text-xs text-slate-500">Students</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────── */}
      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              type="text"
              placeholder="Search by name, code, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors"
            />
          </div>
          <div className="flex space-x-3">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'trial', label: 'Trial' },
                { value: 'expired', label: 'Expired' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
            <Select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Plans' },
                { value: 'free', label: 'Free' },
                { value: 'basic', label: 'Basic' },
                { value: 'pro', label: 'Pro' },
                { value: 'enterprise', label: 'Enterprise' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Schools Table ─────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : filteredSchools.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-16 h-16" />}
            title="No schools found"
            description={searchTerm ? 'Try adjusting your search' : 'Get started by adding your first school'}
            action={!searchTerm ? { label: 'Add School', onClick: () => setShowCreateModal(true) } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <button
                      onClick={() => { setSortField('name'); setSortAsc(sortField === 'name' ? !sortAsc : true); }}
                      className="flex items-center gap-1 hover:text-slate-700"
                    >
                      School <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <button
                      onClick={() => { setSortField('students'); setSortAsc(sortField === 'students' ? !sortAsc : false); }}
                      className="flex items-center gap-1 hover:text-slate-700"
                    >
                      Usage <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSchools.map((school) => (
                  <tr key={school.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: school.primaryColor || '#6366f1' }}
                        >
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 truncate">{school.name}</p>
                          <p className="text-xs text-slate-400">{school.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm text-slate-700">{school.city}</p>
                      <p className="text-xs text-slate-400">{school.state}</p>
                    </td>
                    <td className="py-3 px-4">{renderUsageBar(school)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getPlanColor(school.subscriptionPlan)}`}>
                        {school.subscriptionPlan}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={getStatusVariant(school.subscriptionStatus)}>
                        {school.subscriptionStatus}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleSwitchToSchool(school)}
                          className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="Switch to this school"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(school)}
                          className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSchool(school);
                            setShowDeleteConfirm(true);
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Deactivate"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Modal ──────────────────────────── */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm(); }}
        title="Add New School"
        size="lg"
      >
        {formContent}
        <div className="mt-6 flex justify-end space-x-3">
          <Button variant="secondary" onClick={() => setShowCreateModal(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreateSchool} disabled={saving}>
            {saving ? 'Creating...' : 'Create School'}
          </Button>
        </div>
      </Modal>

      {/* ── Edit Modal ────────────────────────────── */}
      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedSchool(null); resetForm(); }}
        title="Edit School"
        size="lg"
      >
        {formContent}
        <div className="mt-6 flex justify-end space-x-3">
          <Button variant="secondary" onClick={() => setShowEditModal(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleUpdateSchool} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </Modal>

      {/* ── Delete Confirmation ───────────────────── */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setSelectedSchool(null); }}
        onConfirm={handleDeleteSchool}
        title="Deactivate School"
        message={`Are you sure you want to deactivate "${selectedSchool?.name}"? This will disable login for all users of this school.`}
        confirmText="Deactivate"
        type="danger"
      />

      {/* ── Admin Credentials Modal ──────────────── */}
      <Modal
        isOpen={showCredentials}
        onClose={() => { setShowCredentials(false); setAdminCredentials(null); }}
        title="Admin Account Created"
        size="md"
      >
        {adminCredentials && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-medium mb-2">
                Save these credentials — the password cannot be retrieved later!
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center bg-white rounded px-3 py-2 border">
                  <span className="text-slate-500">Name</span>
                  <span className="font-mono font-medium text-slate-800">{adminCredentials.displayName}</span>
                </div>
                <div className="flex justify-between items-center bg-white rounded px-3 py-2 border">
                  <span className="text-slate-500">Email</span>
                  <span className="font-mono font-medium text-slate-800">{adminCredentials.email}</span>
                </div>
                <div className="flex justify-between items-center bg-white rounded px-3 py-2 border">
                  <span className="text-slate-500">Password</span>
                  <span className="font-mono font-medium text-slate-800">{adminCredentials.password}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  const text = `Admin: ${adminCredentials.displayName}\nEmail: ${adminCredentials.email}\nPassword: ${adminCredentials.password}`;
                  navigator.clipboard.writeText(text);
                  toast.success('Credentials copied to clipboard!');
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </Button>
              <Button onClick={() => { setShowCredentials(false); setAdminCredentials(null); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
