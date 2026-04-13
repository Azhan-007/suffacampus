'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Table, TableRow, TableCell } from '@/components/common/Table';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import EmptyState from '@/components/common/EmptyState';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { SchoolService, PLAN_LIMITS } from '@/services/schoolService';
import { School, SubscriptionPlan, SubscriptionStatus } from '@/types';
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
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SchoolsPage() {
  const router = useRouter();
  const { isSuperAdmin } = useAuthStore();
  
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  
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

  useEffect(() => {
    // Redirect non-SuperAdmin users
    if (!isSuperAdmin()) {
      router.push('/dashboard');
      return;
    }

    loadSchools();
  }, [isSuperAdmin, router]);

  const loadSchools = async () => {
    try {
      setLoading(true);
      const data = await SchoolService.getSchools();
      setSchools(data);
    } catch (error) {
      console.error('Error loading schools:', error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeOptionalUrl = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const handleCreateSchool = async () => {
    const schoolName = formData.name.trim();
    const schoolCity = formData.city.trim();
    const adminEmail = formData.adminEmail.trim();
    const schoolEmail = formData.email.trim() || adminEmail;

    if (!schoolName || !schoolEmail || !schoolCity) {
      toast.error('Please fill in required fields (Name, School/Admin Email, City)');
      return;
    }
    try {
      // Generate school code from name
      const code = schoolName.substring(0, 3).toUpperCase() + String(Date.now()).slice(-4);
      const limits = PLAN_LIMITS[formData.subscriptionPlan];
      const adminPassword = formData.adminPassword.trim();
      const adminDisplayName = formData.adminDisplayName.trim();
      
      await SchoolService.createSchool({
        name: schoolName,
        code: code,
        address: formData.address.trim() || '',
        city: schoolCity,
        state: formData.state.trim() || '',
        pincode: formData.pincode.trim() || '',
        phone: formData.phone.trim() || '',
        email: schoolEmail,
        website: normalizeOptionalUrl(formData.website),
        principalName: formData.principalName.trim() || undefined,
        adminEmail: adminEmail || undefined,
        adminPassword: adminPassword || undefined,
        adminDisplayName: adminDisplayName || undefined,
        primaryColor: '#4A90D9',
        secondaryColor: '#E6F4FE',
        subscriptionPlan: formData.subscriptionPlan,
        subscriptionStatus: formData.subscriptionStatus,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        maxStudents: limits.maxStudents <= 0 ? 999999 : limits.maxStudents,
        maxTeachers: limits.maxTeachers <= 0 ? 999999 : limits.maxTeachers,
        maxStorage: limits.maxStorage <= 0 ? 999999 : limits.maxStorage,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        dateFormat: 'DD/MM/YYYY',
        currentSession: '2025-2026',
        isActive: true,
        createdBy: 'superadmin',
      });
      
      setShowCreateModal(false);
      resetForm();
      loadSchools();
      toast.success('School created successfully');
    } catch (error) {
      console.error('Error creating school:', error);
      if (error instanceof ApiError && error.details && typeof error.details === 'object') {
        const details = error.details as Record<string, string[] | undefined>;
        const firstDetail = Object.values(details).find((entry) => Array.isArray(entry) && entry.length > 0)?.[0];
        toast.error(firstDetail ?? error.message);
      } else if (error instanceof ApiError) {
        toast.error(error.message || 'Failed to create school');
      } else {
        toast.error('Failed to create school');
      }
    }
  };

  const handleUpdateSchool = async () => {
    if (!selectedSchool) return;
    
    try {
      await SchoolService.updateSchool(selectedSchool.id, {
        name: formData.name,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        phone: formData.phone,
        email: formData.email,
        website: formData.website || undefined,
        principalName: formData.principalName || undefined,
        subscriptionPlan: formData.subscriptionPlan,
        subscriptionStatus: formData.subscriptionStatus,
      });
      
      setShowEditModal(false);
      setSelectedSchool(null);
      resetForm();
      loadSchools();
      toast.success('School updated successfully');
    } catch (error) {
      console.error('Error updating school:', error);
      toast.error('Failed to update school');
    }
  };

  const handleDeleteSchool = async () => {
    if (!selectedSchool) return;
    
    try {
      await SchoolService.deleteSchool(selectedSchool.id);
      setShowDeleteConfirm(false);
      setSelectedSchool(null);
      loadSchools();
      toast.success('School deleted successfully');
    } catch (error) {
      console.error('Error deleting school:', error);
      toast.error('Failed to delete school');
    }
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

  // Filter schools
  const filteredSchools = schools.filter((school) => {
    const matchesSearch =
      school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      school.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      school.city.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || school.subscriptionStatus === statusFilter;
    const matchesPlan = planFilter === 'all' || school.subscriptionPlan === planFilter;
    
    return matchesSearch && matchesStatus && matchesPlan;
  });

  // Status badge variant
  const getStatusVariant = (status: SubscriptionStatus): 'success' | 'warning' | 'danger' | 'default' => {
    switch (status) {
      case 'active': return 'success';
      case 'trial': return 'warning';
      case 'expired': return 'danger';
      case 'cancelled': return 'default';
      default: return 'default';
    }
  };

  // Plan badge color
  const getPlanColor = (plan: SubscriptionPlan): string => {
    switch (plan) {
      case 'enterprise': return 'bg-purple-100 text-purple-800';
      case 'pro': return 'bg-blue-100 text-blue-800';
      case 'basic': return 'bg-green-100 text-green-800';
      case 'free': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  // Helper function to render usage bar
  const renderUsageBar = (school: School) => {
    const limits = PLAN_LIMITS[school.subscriptionPlan];
    const studentUsage = school.usage?.students || school.currentStudents || 0;
    const studentLimit = limits.maxStudents;
    const usagePercent = studentLimit === Infinity ? 0 : (studentUsage / studentLimit) * 100;
    
    return (
      <div className="space-y-1">
        <div className="flex items-center space-x-2 text-sm">
          <Users className="w-4 h-4 text-slate-300" />
          <span>{studentUsage} / {studentLimit === Infinity ? 'âˆž' : studentLimit}</span>
        </div>
        {studentLimit !== Infinity && (
          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  // Form JSX (reused for create and edit)
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
          disabled={!!selectedSchool} // Can't change code after creation
        />
      </div>
      
      <Input
        label="Address *"
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
          label="State *"
          value={formData.state}
          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          placeholder="State"
        />
        <Input
          label="Pincode *"
          value={formData.pincode}
          onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
          placeholder="Pincode"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Phone *"
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
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Schools Management</h1>
            <p className="text-base text-slate-500 mt-1">
              Manage all schools in the SuffaCampus platform
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add School
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-800">{schools.length}</p>
                <p className="text-sm text-slate-500">Total Schools</p>
              </div>
            </div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-800">
                  {schools.filter(s => s.subscriptionStatus === 'active').length}
                </p>
                <p className="text-sm text-slate-500">Active Subscriptions</p>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-800">
                  {schools.filter(s => s.subscriptionStatus === 'trial').length}
                </p>
                <p className="text-sm text-slate-500">In Trial</p>
              </div>
            </div>
          </div>
          <div className="bg-violet-50 rounded-xl p-5 border border-violet-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-800">
                  {schools.reduce((acc, s) => acc + (s.usage?.students || s.currentStudents || 0), 0)}
                </p>
                <p className="text-sm text-slate-500">Total Students</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="text"
                placeholder="Search schools..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-transparent"
              />
            </div>
            <div className="flex space-x-4">
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

        {/* Schools Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredSchools.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-16 h-16" />}
              title="No schools found"
              description={searchTerm ? "Try adjusting your search" : "Get started by adding your first school"}
              action={!searchTerm ? { label: "Add School", onClick: () => setShowCreateModal(true) } : undefined}
            />
          ) : (
            <Table headers={['School', 'Location', 'Usage', 'Plan', 'Status', 'Actions']}>
              {filteredSchools.map((school) => (
                <TableRow key={school.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: school.primaryColor || '#6366f1' }}
                      >
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-700">{school.name}</p>
                        <p className="text-sm text-slate-400">{school.code}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-slate-800">{school.city}</p>
                      <p className="text-sm text-slate-400">{school.state}</p>
                    </div>
                  </TableCell>
                  <TableCell>{renderUsageBar(school)}</TableCell>
                  <TableCell>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getPlanColor(school.subscriptionPlan)}`}>
                      {school.subscriptionPlan}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(school.subscriptionStatus)}>
                      {school.subscriptionStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => router.push(`/admin/schools/${school.id}`)}
                        className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(school)}
                        className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSchool(school);
                          setShowDeleteConfirm(true);
                        }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </div>

        {/* Create Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            resetForm();
          }}
          title="Add New School"
          size="lg"
        >
          {formContent}
          <div className="mt-6 flex justify-end space-x-3">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSchool}>
              Create School
            </Button>
          </div>
        </Modal>

        {/* Edit Modal */}
        <Modal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedSchool(null);
            resetForm();
          }}
          title="Edit School"
          size="lg"
        >
          {formContent}
          <div className="mt-6 flex justify-end space-x-3">
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSchool}>
              Save Changes
            </Button>
          </div>
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => {
            setShowDeleteConfirm(false);
            setSelectedSchool(null);
          }}
          onConfirm={handleDeleteSchool}
          title="Delete School"
          message={`Are you sure you want to delete "${selectedSchool?.name}"? This action will deactivate the school and all associated data.`}
          confirmText="Delete"
          type="danger"
        />
      </div>
    </DashboardLayout>
  );
}

