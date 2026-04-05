'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';
import { useAuthStore } from '@/store/authStore';
import { SchoolService, PLAN_LIMITS } from '@/services/schoolService';
import { School, SubscriptionPlan, SubscriptionStatus } from '@/types';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  User,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  CreditCard,
  Settings,
  Activity,
  Edit2,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';

export default function SchoolDetailPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.id as string;
  const { isSuperAdmin } = useAuthStore();
  
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  const loadSchool = useCallback(async () => {
    try {
      setLoading(true);
      const data = await SchoolService.getSchoolById(schoolId);
      setSchool(data);
    } catch (error) {
      console.error('Error loading school:', error);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (!isSuperAdmin()) {
      router.push('/dashboard');
      return;
    }

    loadSchool();
  }, [isSuperAdmin, router, loadSchool]);

  const getStatusVariant = (status: SubscriptionStatus): 'success' | 'warning' | 'danger' | 'default' => {
    switch (status) {
      case 'active': return 'success';
      case 'trial': return 'warning';
      case 'expired': return 'danger';
      case 'cancelled': return 'default';
      default: return 'default';
    }
  };

  const getPlanColor = (plan: SubscriptionPlan): string => {
    switch (plan) {
      case 'enterprise': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'pro': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'basic': return 'bg-green-100 text-green-800 border-green-200';
      case 'free': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusIcon = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'trial': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'expired': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'cancelled': return <AlertCircle className="w-5 h-5 text-slate-400" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!school) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800">School Not Found</h2>
          <p className="text-slate-400 mt-2">The school you&apos;re looking for doesn&apos;t exist.</p>
          <Button className="mt-4" onClick={() => router.push('/admin/schools')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Schools
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const limits = PLAN_LIMITS[school.subscriptionPlan];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/admin/schools')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: school.primaryColor || '#6366f1' }}
            >
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">{school.name}</h1>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-slate-400">{school.code}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${getPlanColor(school.subscriptionPlan)}`}>
                  {school.subscriptionPlan}
                </span>
                <Badge variant={getStatusVariant(school.subscriptionStatus)}>
                  {school.subscriptionStatus}
                </Badge>
              </div>
            </div>
          </div>
          <Button onClick={() => router.push(`/admin/schools/${school.id}/edit`)}>
            <Edit2 className="w-4 h-4 mr-2" />
            Edit School
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Students</p>
                <p className="text-2xl font-semibold text-slate-800 mt-1">
                  {school.usage?.students || 0}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Limit: {limits.maxStudents === Infinity ? 'Unlimited' : limits.maxStudents}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Teachers</p>
                <p className="text-2xl font-semibold text-slate-800 mt-1">
                  {school.usage?.teachers || 0}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Limit: {limits.maxTeachers === Infinity ? 'Unlimited' : limits.maxTeachers}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Classes</p>
                <p className="text-2xl font-semibold text-slate-800 mt-1">
                  {school.usage?.classes || 0}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Limit: {limits.maxStudents === -1 ? 'Unlimited' : Math.floor(limits.maxStudents / 30)}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Admins</p>
                <p className="text-2xl font-semibold text-slate-800 mt-1">
                  {school.usage?.admins || 1}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Limit: {limits.maxTeachers === -1 ? 'Unlimited' : Math.ceil(limits.maxTeachers / 10)}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <User className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* School Information */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-[15px] font-semibold text-slate-800">School Information</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <MapPin className="w-5 h-5 text-slate-300 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">Address</p>
                      <p className="text-slate-800">{school.address}</p>
                      <p className="text-slate-800">{school.city}, {school.state} - {school.pincode}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <Phone className="w-5 h-5 text-slate-300 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">Phone</p>
                      <p className="text-slate-800">{school.phone}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <Mail className="w-5 h-5 text-slate-300 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">Email</p>
                      <p className="text-slate-800">{school.email}</p>
                    </div>
                  </div>
                  
                  {school.website && (
                    <div className="flex items-start space-x-3">
                      <Globe className="w-5 h-5 text-slate-300 mt-0.5" />
                      <div>
                        <p className="text-sm text-slate-400">Website</p>
                        <a 
                          href={school.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          {school.website}
                        </a>
                      </div>
                    </div>
                  )}
                  
                  {school.principalName && (
                    <div className="flex items-start space-x-3">
                      <User className="w-5 h-5 text-slate-300 mt-0.5" />
                      <div>
                        <p className="text-sm text-slate-400">Principal</p>
                        <p className="text-slate-800">{school.principalName}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Features Enabled */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-[15px] font-semibold text-slate-800">Features</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { name: 'Attendance', key: 'Attendance', icon: Calendar },
                    { name: 'Fee Management', key: 'Fees Management', icon: CreditCard },
                    { name: 'Library', key: 'Library', icon: BookOpen },
                    { name: 'Timetable', key: 'Timetable', icon: Activity },
                    { name: 'Reports', key: 'Reports', icon: TrendingUp },
                    { name: 'API Access', key: 'API Access', icon: Settings },
                  ].map((feature) => {
                    const isEnabled = limits.features.some(f => 
                      f.toLowerCase().includes(feature.key.toLowerCase())
                    );
                    return (
                      <div
                        key={feature.key}
                        className={`flex items-center space-x-3 p-3 rounded-lg border ${
                          isEnabled 
                            ? 'border-green-200 bg-green-50' 
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <feature.icon className={`w-5 h-5 ${isEnabled ? 'text-green-600' : 'text-slate-300'}`} />
                        <span className={isEnabled ? 'text-green-700' : 'text-slate-400'}>
                          {feature.name}
                        </span>
                        {isEnabled ? (
                          <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-slate-300 ml-auto" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Details */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-[15px] font-semibold text-slate-800">Subscription</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(school.subscriptionStatus)}
                    <span className="font-medium capitalize">{school.subscriptionStatus}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize border ${getPlanColor(school.subscriptionPlan)}`}>
                    {school.subscriptionPlan}
                  </span>
                </div>
                
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Start Date</span>
                    <span className="text-slate-800">
                      {school.subscriptionStartDate 
                        ? new Date(school.subscriptionStartDate).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">End Date</span>
                    <span className="text-slate-800">
                      {school.subscriptionEndDate 
                        ? new Date(school.subscriptionEndDate).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <Button variant="secondary" className="w-full">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Manage Subscription
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-[15px] font-semibold text-slate-800">Quick Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                <Button variant="secondary" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Users
                </Button>
                <Button variant="secondary" className="w-full justify-start">
                  <Settings className="w-4 h-4 mr-2" />
                  School Settings
                </Button>
                <Button variant="secondary" className="w-full justify-start">
                  <Activity className="w-4 h-4 mr-2" />
                  View Activity Log
                </Button>
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-400">
              <p>Created: {new Date(school.createdAt).toLocaleDateString()}</p>
              <p>Last Updated: {new Date(school.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
