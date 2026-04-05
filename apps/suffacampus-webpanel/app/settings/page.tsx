'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SettingsService } from '@/services/settingsService';
import { SchoolSettings } from '@/types';
import {
  Settings,
  Save,
  RotateCw,
  RefreshCw,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Palette,
  GraduationCap,
  Calendar,
  Clock,
  Bell,
  Shield,
  AlertTriangle,
  CheckCircle,
  Upload,
} from 'lucide-react';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [form, setForm] = useState<Partial<SchoolSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  useEffect(() => {
    const unsub = SettingsService.subscribeToSettings((s) => {
      setSettings(s);
      setForm(s);
      setLoading(false);
      setLastSynced(new Date());
    });
    return unsub;
  }, []);

  const handleChange = useCallback((field: keyof SchoolSettings, value: SchoolSettings[keyof SchoolSettings]) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }, []);

  const handleSave = async () => {
    const validation = SettingsService.validateSettings(form);
    if (!validation.isValid) {
      setErrors(validation.errors);
      toast.error('Please fix the errors before saving');
      return;
    }
    setSaving(true);
    try {
      const { id, createdAt, ...updates } = form as SchoolSettings;
      await SettingsService.updateSettings(updates);
      toast.success('Settings saved successfully');
      setHasChanges(false);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
    try {
      await SettingsService.resetToDefaults();
      toast.success('Settings reset to defaults');
      setHasChanges(false);
    } catch {
      toast.error('Failed to reset settings');
    }
  };

  const sessions = SettingsService.getAvailableSessions();
  const currencies = SettingsService.getSupportedCurrencies();
  const timezones = SettingsService.getSupportedTimezones();

  const months = [
    { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
    { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
    { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
    { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ];

  if (loading) {
    return (<DashboardLayout><div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Loading settings...</p></div></div></DashboardLayout>);
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">School Settings</h1>
              <p className="text-base text-slate-500 mt-1">Configure your school preferences</p>
              {lastSynced && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RefreshCw className="w-3 h-3 text-emerald-500" />
                  <span className="text-xs text-emerald-600 font-medium" suppressHydrationWarning>Live synced {lastSynced.toLocaleTimeString()}</span>
                </div>
              )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleReset}><RotateCw className="w-4 h-4" /><span>Reset</span></Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? <><RotateCw className="w-4 h-4 animate-spin" /><span>Saving...</span></> : <><Save className="w-4 h-4" /><span>Save Changes</span></>}
            </Button>
          </div>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700">You have unsaved changes. Don&apos;t forget to save before leaving.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* School Information */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center"><Building2 className="w-3.5 h-3.5 text-blue-600" /></div>
              <h3 className="text-[14px] font-semibold text-slate-700">School Information</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">School Name *</label>
                  <input type="text" value={form.schoolName || ''} onChange={e => handleChange('schoolName', e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-all focus:ring-2 focus:ring-blue-100 focus:border-blue-400 ${errors.schoolName ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`} />
                  {errors.schoolName && <p className="text-xs text-red-500 mt-0.5">{errors.schoolName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">School Code</label>
                  <input type="text" value={form.schoolCode || ''} onChange={e => handleChange('schoolCode', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                <input type="text" value={form.address || ''} onChange={e => handleChange('address', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                  <input type="text" value={form.city || ''} onChange={e => handleChange('city', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                  <input type="text" value={form.state || ''} onChange={e => handleChange('state', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Pincode</label>
                  <input type="text" value={form.pincode || ''} onChange={e => handleChange('pincode', e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-all focus:ring-2 focus:ring-blue-100 focus:border-blue-400 ${errors.pincode ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`} />
                  {errors.pincode && <p className="text-xs text-red-500 mt-0.5">{errors.pincode}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <div className="w-6 h-6 rounded bg-violet-100 flex items-center justify-center"><Phone className="w-3.5 h-3.5 text-violet-600" /></div>
              <h3 className="text-[14px] font-semibold text-slate-700">Contact Information</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={form.phone || ''} onChange={e => handleChange('phone', e.target.value)} className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg outline-none transition-all focus:ring-2 focus:ring-blue-100 focus:border-blue-400 ${errors.phone ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`} />
                </div>
                {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" value={form.email || ''} onChange={e => handleChange('email', e.target.value)} className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg outline-none transition-all focus:ring-2 focus:ring-blue-100 focus:border-blue-400 ${errors.email ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`} />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="url" value={form.website || ''} onChange={e => handleChange('website', e.target.value)} className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg outline-none transition-all focus:ring-2 focus:ring-blue-100 focus:border-blue-400 ${errors.website ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`} placeholder="https://" />
                </div>
                {errors.website && <p className="text-xs text-red-500 mt-0.5">{errors.website}</p>}
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <div className="w-6 h-6 rounded bg-pink-100 flex items-center justify-center"><Palette className="w-3.5 h-3.5 text-pink-600" /></div>
              <h3 className="text-[14px] font-semibold text-slate-700">Branding</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">School Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                    {form.logoURL ? <Image src={form.logoURL} alt="Logo" width={64} height={64} className="w-full h-full object-cover rounded-xl" unoptimized /> : <Upload className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div>
                    <button onClick={async () => { const url = await SettingsService.uploadLogo(new File([], '')); handleChange('logoURL', url); toast.success('Logo uploaded'); }} className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">Upload Logo</button>
                    <p className="text-xs text-slate-400 mt-0.5">PNG, JPG up to 2MB</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.primaryColor || '#4A90D9'} onChange={e => handleChange('primaryColor', e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer" />
                    <input type="text" value={form.primaryColor || '#4A90D9'} onChange={e => handleChange('primaryColor', e.target.value)} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Secondary Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.secondaryColor || '#E6F4FE'} onChange={e => handleChange('secondaryColor', e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer" />
                    <input type="text" value={form.secondaryColor || '#E6F4FE'} onChange={e => handleChange('secondaryColor', e.target.value)} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Academic Settings */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <div className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center"><GraduationCap className="w-3.5 h-3.5 text-emerald-600" /></div>
              <h3 className="text-[14px] font-semibold text-slate-700">Academic Settings</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Current Session</label>
                <select value={form.currentSession || ''} onChange={e => handleChange('currentSession', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                  {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Session Start</label>
                  <select value={form.sessionStartMonth?.toString() || '4'} onChange={e => handleChange('sessionStartMonth', parseInt(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Session End</label>
                  <select value={form.sessionEndMonth?.toString() || '3'} onChange={e => handleChange('sessionEndMonth', parseInt(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* System Preferences */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center"><Clock className="w-3.5 h-3.5 text-amber-600" /></div>
              <h3 className="text-[14px] font-semibold text-slate-700">System Preferences</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
                <select value={form.currency || 'INR'} onChange={e => handleChange('currency', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                  {currencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date Format</label>
                  <select value={form.dateFormat || 'DD/MM/YYYY'} onChange={e => handleChange('dateFormat', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Time Format</label>
                  <select value={form.timeFormat || '12h'} onChange={e => handleChange('timeFormat', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                    <option value="12h">12 Hour (AM/PM)</option>
                    <option value="24h">24 Hour</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Timezone</label>
                <select value={form.timezone || 'Asia/Kolkata'} onChange={e => handleChange('timezone', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                  {timezones.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
              <div className="w-6 h-6 rounded bg-red-100 flex items-center justify-center"><Bell className="w-3.5 h-3.5 text-red-600" /></div>
              <h3 className="text-[14px] font-semibold text-slate-700">Notifications</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center"><Mail className="w-4 h-4 text-slate-500" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Email Notifications</p>
                    <p className="text-xs text-slate-400">Receive updates via email</p>
                  </div>
                </div>
                <button onClick={() => handleChange('emailNotifications', !form.emailNotifications)} className={`relative w-11 h-6 rounded-full transition-colors ${form.emailNotifications ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${form.emailNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center"><Phone className="w-4 h-4 text-slate-500" /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">SMS Notifications</p>
                    <p className="text-xs text-slate-400">Receive alerts via SMS</p>
                  </div>
                </div>
                <button onClick={() => handleChange('smsNotifications', !form.smsNotifications)} className={`relative w-11 h-6 rounded-full transition-colors ${form.smsNotifications ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${form.smsNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer save bar */}
        {hasChanges && (
          <div className="sticky bottom-4 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-sm text-slate-600">You have unsaved changes</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => { if (settings) { setForm(settings); setHasChanges(false); } }}>Discard</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><RotateCw className="w-4 h-4 animate-spin" /><span>Saving...</span></> : <><Save className="w-4 h-4" /><span>Save Changes</span></>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
