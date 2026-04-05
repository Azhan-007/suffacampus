'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { SchoolService } from '@/services/schoolService';
import { School } from '@/types';
import {
  Building2,
  Users,
  GraduationCap,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Plus,
  Activity,
  Globe,
  Clock,
  ScrollText,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PlatformStats {
  totalSchools: number;
  activeSchools: number;
  trialSchools: number;
  expiredSchools: number;
  totalStudents: number;
  totalTeachers: number;
  planDistribution: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/*  Stat Card Component                                                */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color: 'blue' | 'emerald' | 'violet' | 'amber' | 'red' | 'slate';
}) {
  const colors = {
    blue:    { bg: 'bg-blue-50',    iconBg: 'bg-blue-100',    iconText: 'text-blue-600',    border: 'border-blue-200' },
    emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', border: 'border-emerald-200' },
    violet:  { bg: 'bg-violet-50',  iconBg: 'bg-violet-100',  iconText: 'text-violet-600',  border: 'border-violet-200' },
    amber:   { bg: 'bg-amber-50',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600',   border: 'border-amber-200' },
    red:     { bg: 'bg-red-50',     iconBg: 'bg-red-100',     iconText: 'text-red-600',     border: 'border-red-200' },
    slate:   { bg: 'bg-slate-50',   iconBg: 'bg-slate-100',   iconText: 'text-slate-600',   border: 'border-slate-200' },
  };
  const c = colors[color];

  return (
    <div className={`${c.bg} rounded-xl p-5 border ${c.border}`}>
      <div className="flex items-center space-x-3">
        <div className={`w-11 h-11 ${c.iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.iconText}`} />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-800">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
          {subtext && <p className="text-xs text-slate-400 mt-0.5">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick Action Card                                                  */
/* ------------------------------------------------------------------ */

function ActionCard({
  icon: Icon,
  title,
  description,
  href,
  color,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="group block bg-white rounded-xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Plan Distribution Bar                                              */
/* ------------------------------------------------------------------ */

function PlanDistribution({ distribution, total }: { distribution: Record<string, number>; total: number }) {
  const plans = [
    { key: 'free',       label: 'Free',       color: 'bg-slate-400' },
    { key: 'basic',      label: 'Basic',      color: 'bg-emerald-500' },
    { key: 'pro',        label: 'Pro',        color: 'bg-blue-500' },
    { key: 'enterprise', label: 'Enterprise', color: 'bg-violet-500' },
  ];

  if (total === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        No schools registered yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        {plans.map((plan) => {
          const count = distribution[plan.key] || 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={plan.key}
              className={`${plan.color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${plan.label}: ${count}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {plans.map((plan) => {
          const count = distribution[plan.key] || 0;
          return (
            <div key={plan.key} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${plan.color}`} />
              <span className="text-sm text-slate-600">{plan.label}</span>
              <span className="text-sm font-medium text-slate-800">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Schools Table                                               */
/* ------------------------------------------------------------------ */

function RecentSchoolsList({ schools }: { schools: School[] }) {
  if (schools.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No schools yet</p>
        <p className="text-sm text-slate-400 mt-1">Create your first school to get started</p>
        <Link
          href="/superadmin/schools"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add School
        </Link>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700';
      case 'trial': return 'bg-amber-100 text-amber-700';
      case 'expired': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'enterprise': return 'bg-violet-100 text-violet-700';
      case 'pro': return 'bg-blue-100 text-blue-700';
      case 'basic': return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="divide-y divide-slate-100">
      {schools.slice(0, 5).map((school) => (
        <Link
          key={school.id}
          href={`/superadmin/schools`}
          className="flex items-center justify-between py-4 px-1 hover:bg-slate-50 -mx-1 rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: school.primaryColor || '#6366f1' }}
            >
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-slate-700 group-hover:text-blue-600 transition-colors">{school.name}</p>
              <p className="text-sm text-slate-400">{school.city}{school.state ? `, ${school.state}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getPlanColor(school.subscriptionPlan)}`}>
              {school.subscriptionPlan}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(school.subscriptionStatus)}`}>
              {school.subscriptionStatus}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SuperAdminDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, schoolsData] = await Promise.all([
        SchoolService.getPlatformStats(),
        SchoolService.getSchools(),
      ]);
      setStats(statsData as unknown as PlatformStats);
      setSchools(schoolsData);
    } catch (error) {
      console.error('Error loading platform data:', error);
    } finally {
      setLoading(false);
    }
  };

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  const totalSchools = stats?.totalSchools ?? schools.length;

  return (
    <div className="space-y-8">
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          {greeting}, {user?.displayName?.split(' ')[0] || 'Admin'}
        </h1>
        <p className="text-base text-slate-500 mt-1">
          Here&apos;s an overview of your SuffaCampus platform
        </p>
      </div>

      {/* â”€â”€ Stats Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Building2}
          label="Total Schools"
          value={totalSchools}
          color="blue"
        />
        <StatCard
          icon={Activity}
          label="Active Schools"
          value={stats?.activeSchools ?? 0}
          subtext={totalSchools > 0 ? `${Math.round(((stats?.activeSchools ?? 0) / totalSchools) * 100)}% of total` : undefined}
          color="emerald"
        />
        <StatCard
          icon={Clock}
          label="In Trial"
          value={stats?.trialSchools ?? 0}
          color="amber"
        />
        <StatCard
          icon={Users}
          label="Total Students"
          value={stats?.totalStudents ?? 0}
          color="violet"
        />
        <StatCard
          icon={GraduationCap}
          label="Total Teachers"
          value={stats?.totalTeachers ?? 0}
          color="blue"
        />
        <StatCard
          icon={AlertTriangle}
          label="Expired"
          value={stats?.expiredSchools ?? 0}
          color={stats?.expiredSchools ? 'red' : 'slate'}
        />
      </div>

      {/* â”€â”€ Quick Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard
            icon={Building2}
            title="Manage Schools"
            description="Create, edit, and manage all registered schools on the platform"
            href="/superadmin/schools"
            color="bg-blue-600"
          />
          <ActionCard
            icon={CreditCard}
            title="Subscriptions"
            description="View and manage subscription plans for all schools"
            href="/superadmin/schools"
            color="bg-violet-600"
          />
          <ActionCard
            icon={ScrollText}
            title="Audit Logs"
            description="View platform-wide activity and audit trail"
            href="/superadmin/audit-logs"
            color="bg-slate-700"
          />
        </div>
      </div>

      {/* â”€â”€ Bottom Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-800">Plan Distribution</h2>
            <TrendingUp className="w-5 h-5 text-slate-300" />
          </div>
          <PlanDistribution
            distribution={stats?.planDistribution ?? {}}
            total={totalSchools}
          />
        </div>

        {/* Recent Schools */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-800">Recent Schools</h2>
            {schools.length > 0 && (
              <Link
                href="/superadmin/schools"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          <RecentSchoolsList schools={schools} />
        </div>
      </div>

      {/* â”€â”€ Platform Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-800">Platform Information</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-slate-400">Platform</p>
            <p className="text-sm font-medium text-slate-700">SuffaCampus SaaS</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Environment</p>
            <p className="text-sm font-medium text-slate-700">{process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Logged In As</p>
            <p className="text-sm font-medium text-slate-700">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-slate-400">Role</p>
            <p className="text-sm font-medium text-amber-600">{user?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

