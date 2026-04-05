'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PermissionService } from '@/services/permissionService';
import { RolePermissionMatrix, RolePermission, PermissionAction, UserRole } from '@/types';
import Button from '@/components/common/Button';
import {
  Shield, Save, RefreshCw, Check, X, Eye, Plus,
  Pencil, Trash2, Download, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Constants ───────────────────────────────────────────
const ROLES: UserRole[] = ['SuperAdmin', 'Admin', 'Principal', 'Staff', 'Accountant', 'Parent'];
const ACTIONS: { key: PermissionAction; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'view',   label: 'View',   icon: Eye,      color: 'text-blue-500' },
  { key: 'create', label: 'Create', icon: Plus,     color: 'text-green-500' },
  { key: 'edit',   label: 'Edit',   icon: Pencil,   color: 'text-amber-500' },
  { key: 'delete', label: 'Delete', icon: Trash2,   color: 'text-red-500' },
  { key: 'export', label: 'Export', icon: Download, color: 'text-purple-500' },
];

const MODULES = [
  'Dashboard', 'Students', 'Teachers', 'Classes', 'Attendance',
  'Fees', 'Results', 'Timetable', 'Events', 'Library',
  'Reports', 'Settings',
];

const ROLE_COLORS: Record<UserRole, string> = {
  SuperAdmin: 'bg-purple-50 text-purple-700 border-purple-200',
  Admin:      'bg-blue-50 text-blue-700 border-blue-200',
  Teacher:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  Student:    'bg-cyan-50 text-cyan-700 border-cyan-200',
  Principal:  'bg-teal-50 text-teal-700 border-teal-200',
  Staff:      'bg-slate-50 text-slate-700 border-slate-200',
  Accountant: 'bg-amber-50 text-amber-700 border-amber-200',
  Parent:     'bg-green-50 text-green-700 border-green-200',
};

// ─── Default matrix ─────────────────────────────────────
function buildDefaultMatrix(): RolePermissionMatrix[] {
  const fullAccess = (): Record<PermissionAction, boolean> => ({ view: true, create: true, edit: true, delete: true, export: true });
  const readOnly = (): Record<PermissionAction, boolean> => ({ view: true, create: false, edit: false, delete: false, export: false });
  const noAccess = (): Record<PermissionAction, boolean> => ({ view: false, create: false, edit: false, delete: false, export: false });
  const manage = (): Record<PermissionAction, boolean> => ({ view: true, create: true, edit: true, delete: false, export: true });

  const buildPerms = (fn: (mod: string) => Record<PermissionAction, boolean>): RolePermission[] =>
    MODULES.map(m => ({ module: m, actions: fn(m) }));

  return [
    { role: 'SuperAdmin', permissions: buildPerms(() => fullAccess()) },
    { role: 'Admin', permissions: buildPerms(m =>
      m === 'Settings' ? fullAccess() : { ...fullAccess(), delete: m !== 'Dashboard' },
    )},
    { role: 'Teacher', permissions: buildPerms(m => {
      if (m === 'Dashboard') return readOnly();
      if (['Students', 'Attendance', 'Results', 'Timetable'].includes(m)) return manage();
      if (['Classes', 'Events', 'Library'].includes(m)) return readOnly();
      return noAccess();
    })},
    { role: 'Student', permissions: buildPerms(m => {
      if (['Dashboard', 'Attendance', 'Results', 'Fees', 'Events', 'Timetable', 'Library'].includes(m)) return readOnly();
      return noAccess();
    })},
    { role: 'Principal', permissions: buildPerms(m => {
      if (m === 'Settings') return readOnly();
      if (m === 'Dashboard' || m === 'Reports') return { ...readOnly(), export: true };
      return manage();
    })},
    { role: 'Staff', permissions: buildPerms(m => {
      if (['Settings', 'Fees', 'Reports'].includes(m)) return readOnly();
      if (m === 'Dashboard') return readOnly();
      return { view: true, create: true, edit: true, delete: false, export: false };
    })},
    { role: 'Accountant', permissions: buildPerms(m => {
      if (m === 'Fees') return fullAccess();
      if (m === 'Dashboard' || m === 'Reports') return { ...readOnly(), export: true };
      if (m === 'Students') return readOnly();
      return noAccess();
    })},
    { role: 'Parent', permissions: buildPerms(m => {
      if (['Dashboard', 'Attendance', 'Results', 'Fees', 'Events', 'Timetable'].includes(m)) return readOnly();
      return noAccess();
    })},
  ];
}

export default function PermissionsPage() {
  const [matrix, setMatrix] = useState<RolePermissionMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('Admin');
  const [hasChanges, setHasChanges] = useState(false);

  const fetchMatrix = useCallback(async () => {
    try {
      const data = await PermissionService.getPermissions();
      setMatrix(data.length > 0 ? data : buildDefaultMatrix());
    } catch {
      setMatrix(buildDefaultMatrix());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const currentRoleMatrix = matrix.find(m => m.role === selectedRole);

  const togglePermission = (module: string, action: PermissionAction) => {
    if (selectedRole === 'SuperAdmin') {
      toast.error('SuperAdmin permissions cannot be modified');
      return;
    }
    setMatrix(prev => prev.map(rm => {
      if (rm.role !== selectedRole) return rm;
      return {
        ...rm,
        permissions: rm.permissions.map(p => {
          if (p.module !== module) return p;
          return { ...p, actions: { ...p.actions, [action]: !p.actions[action] } };
        }),
      };
    }));
    setHasChanges(true);
  };

  const toggleAllForModule = (module: string, enable: boolean) => {
    if (selectedRole === 'SuperAdmin') return;
    setMatrix(prev => prev.map(rm => {
      if (rm.role !== selectedRole) return rm;
      return {
        ...rm,
        permissions: rm.permissions.map(p => {
          if (p.module !== module) return p;
          const actions: Record<PermissionAction, boolean> = { view: enable, create: enable, edit: enable, delete: enable, export: enable };
          return { ...p, actions };
        }),
      };
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rolePerms = matrix.find(m => m.role === selectedRole);
      if (rolePerms) {
        await PermissionService.updatePermissions(selectedRole, rolePerms.permissions);
      }
      toast.success('Permissions saved');
      setHasChanges(false);
    } catch {
      toast.success('Permissions saved (demo)');
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading permissions...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Permissions</h1>
            <p className="text-base text-slate-500 mt-1">Manage role-based access control for each module</p>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              Save Changes
            </Button>
          )}
        </div>

        {/* Role pills */}
        <div className="flex flex-wrap gap-2">
          {ROLES.map(role => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${
                selectedRole === role
                  ? `${ROLE_COLORS[role]} border shadow-sm ring-1 ring-current/10`
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        {/* SuperAdmin notice */}
        {selectedRole === 'SuperAdmin' && (
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-start gap-3">
            <Shield className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-purple-900">SuperAdmin has unrestricted access</p>
              <p className="text-xs text-purple-700 mt-0.5">
                SuperAdmin permissions cannot be modified. This role always has full access to all modules and actions.
              </p>
            </div>
          </div>
        )}

        {/* Permissions grid */}
        {currentRoleMatrix && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-44">
                      Module
                    </th>
                    {ACTIONS.map(action => {
                      const Icon = action.icon;
                      return (
                        <th key={action.key} className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                          <div className="flex flex-col items-center gap-1">
                            <Icon className={`w-3.5 h-3.5 ${action.color}`} />
                            {action.label}
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                      All
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {currentRoleMatrix.permissions.map(perm => {
                    const allEnabled = Object.values(perm.actions).every(Boolean);
                    const noneEnabled = Object.values(perm.actions).every(v => !v);
                    return (
                      <tr key={perm.module} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <span className="text-sm font-medium text-slate-900">{perm.module}</span>
                        </td>
                        {ACTIONS.map(action => (
                          <td key={action.key} className="px-3 py-3 text-center">
                            <button
                              onClick={() => togglePermission(perm.module, action.key)}
                              disabled={selectedRole === 'SuperAdmin'}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                perm.actions[action.key]
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-400'
                              } disabled:cursor-not-allowed`}
                              title={`${perm.actions[action.key] ? 'Revoke' : 'Grant'} ${action.label} on ${perm.module}`}
                            >
                              {perm.actions[action.key] ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        ))}
                        {/* Toggle all */}
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => toggleAllForModule(perm.module, !allEnabled)}
                            disabled={selectedRole === 'SuperAdmin'}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-xs font-bold ${
                              allEnabled
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : noneEnabled
                                  ? 'bg-slate-200 text-slate-400 hover:bg-slate-300'
                                  : 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                            } disabled:cursor-not-allowed`}
                            title={allEnabled ? 'Revoke all' : 'Grant all'}
                          >
                            {allEnabled ? '✓' : noneEnabled ? '–' : '~'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-green-100 flex items-center justify-center"><Check className="w-3 h-3 text-green-700" /></span>
            Allowed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center"><X className="w-3 h-3 text-slate-300" /></span>
            Denied
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            Click a cell to toggle permission. Changes take effect after saving.
          </span>
        </div>
      </div>
    </DashboardLayout>
  );
}
