'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useBranding } from '@/components/providers/BrandingProvider';
import {
  BRANDING_PRESETS,
  DEFAULT_BRANDING,
  FONT_MAP,
  contrastMode,
  lighten,
  darken,
  generatePalette,
} from '@/lib/brandingUtils';
import { SchoolBranding, SidebarStyle, FontFamily, BorderRadiusPreset } from '@/types';
import {
  Palette,
  Save,
  RotateCw,
  Eye,
  EyeOff,
  Check,
  Upload,
  Type,
  Layout,
  Monitor,
  Undo2,
  Sparkles,
  Sun,
  Moon,
  PaintBucket,
  RectangleHorizontal,
  Circle,
  Square,
  School,
} from 'lucide-react';
import Button from '@/components/common/Button';
import toast from 'react-hot-toast';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ColorInput({ label, value, onChange, description }: {
  label: string; value: string; onChange: (v: string) => void; description?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer appearance-none bg-transparent p-0.5"
          />
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={value.toUpperCase()}
            onChange={e => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
            }}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white font-mono uppercase"
            maxLength={7}
          />
        </div>
      </div>
      {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function BrandingPage() {
  const { branding, updateBranding, previewBranding, cancelPreview, isPreviewing } = useBranding();

  const [draft, setDraft] = useState<SchoolBranding>(branding);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'colors' | 'layout' | 'typography' | 'login'>('colors');

  // Sync draft when saved branding changes (e.g. first load)
  useEffect(() => {
    if (!hasChanges) {
      setDraft(branding);
    }
  }, [branding, hasChanges]);

  const handleChange = useCallback(<K extends keyof SchoolBranding>(key: K, value: SchoolBranding[K]) => {
    setDraft(prev => {
      const next = { ...prev, [key]: value };
      previewBranding(next);
      return next;
    });
    setHasChanges(true);
  }, [previewBranding]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = BRANDING_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const next: SchoolBranding = {
      ...draft,
      primaryColor: preset.colors.primary,
      secondaryColor: preset.colors.secondary,
      accentColor: preset.colors.accent,
      sidebarStyle: preset.sidebarStyle,
    };
    setDraft(next);
    previewBranding(next);
    setHasChanges(true);
    toast.success(`Applied "${preset.name}" preset`);
  }, [draft, previewBranding]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBranding(draft);
      setHasChanges(false);
      toast.success('Branding saved successfully');
    } catch {
      toast.error('Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_BRANDING);
    previewBranding(DEFAULT_BRANDING);
    setHasChanges(true);
    toast('Reset to default branding', { icon: '(c)' });
  };

  const handleDiscard = () => {
    cancelPreview();
    setDraft(branding);
    setHasChanges(false);
  };

  const tabs = [
    { key: 'colors' as const, label: 'Colors', icon: PaintBucket },
    { key: 'layout' as const, label: 'Layout', icon: Layout },
    { key: 'typography' as const, label: 'Typography', icon: Type },
    { key: 'login' as const, label: 'Login Page', icon: Monitor },
  ];

  // Generate palette preview
  const palette = generatePalette(draft.primaryColor);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* "" Header """"""""""""""""""""""""""""""""" */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Branding</h1>
            <p className="text-base text-slate-500 mt-1">Customise your school&apos;s look and feel</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleReset}>
              <Undo2 className="w-4 h-4" /><span>Reset</span>
            </Button>
            {hasChanges && (
              <Button variant="secondary" onClick={handleDiscard}>
                <EyeOff className="w-4 h-4" /><span>Discard</span>
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving
                ? <><RotateCw className="w-4 h-4 animate-spin" /><span>Saving...</span></>
                : <><Save className="w-4 h-4" /><span>Save Changes</span></>}
            </Button>
          </div>
        </div>

        {/* "" Live preview banner """""""""""""""""""" */}
        {isPreviewing && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
            <Eye className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-xs text-blue-700 font-medium">Live preview is active " changes are visible in real-time. Save to keep them.</p>
          </div>
        )}

        {/* "" Tabs """"""""""""""""""""""""""""""""""" */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* "" Tab content """""""""""""""""""""""""""" */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* """""""""""""""" LEFT (Settings) """""""""""""""" */}
          <div className="xl:col-span-2 space-y-5">
            {/* COLORS TAB */}
            {activeTab === 'colors' && (
              <>
                {/* Preset picker */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                    <div className="w-6 h-6 rounded bg-violet-100 flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-violet-600" /></div>
                    <h3 className="text-[14px] font-semibold text-slate-700">Theme Presets</h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                      {BRANDING_PRESETS.map(preset => {
                        const isActive = draft.primaryColor === preset.colors.primary;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => applyPreset(preset.id)}
                            className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${isActive ? 'border-blue-500 bg-blue-50/50' : 'border-transparent hover:border-slate-200'}`}
                          >
                            <div
                              className="w-10 h-10 rounded-lg shadow-sm ring-1 ring-black/5"
                              style={{ background: preset.preview }}
                            />
                            {isActive && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}
                            <span className="text-[10px] font-medium text-slate-500 group-hover:text-slate-700 truncate w-full text-center">{preset.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Custom colours */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                    <div className="w-6 h-6 rounded bg-pink-100 flex items-center justify-center"><Palette className="w-3.5 h-3.5 text-pink-600" /></div>
                    <h3 className="text-[14px] font-semibold text-slate-700">Custom Colors</h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      <ColorInput
                        label="Primary Color"
                        value={draft.primaryColor}
                        onChange={v => handleChange('primaryColor', v)}
                        description="Buttons, links, active states"
                      />
                      <ColorInput
                        label="Secondary Color"
                        value={draft.secondaryColor}
                        onChange={v => handleChange('secondaryColor', v)}
                        description="Backgrounds, badges"
                      />
                      <ColorInput
                        label="Accent Color"
                        value={draft.accentColor}
                        onChange={v => handleChange('accentColor', v)}
                        description="CTAs, highlights"
                      />
                    </div>

                    {/* Palette preview */}
                    <div className="mt-5 pt-5 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-500 mb-2">Generated Palette</p>
                      <div className="flex gap-1 rounded-lg overflow-hidden">
                        {Object.entries(palette).map(([shade, hex]) => (
                          <div key={shade} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full h-8 rounded" style={{ backgroundColor: hex }} />
                            <span className="text-[9px] text-slate-400 font-mono">{shade}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* LAYOUT TAB */}
            {activeTab === 'layout' && (
              <>
                {/* Sidebar style */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                    <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center"><Layout className="w-3.5 h-3.5 text-blue-600" /></div>
                    <h3 className="text-[14px] font-semibold text-slate-700">Sidebar Style</h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-4">
                      {([
                        { key: 'light', label: 'Light', icon: Sun, desc: 'Clean white sidebar', bg: '#ffffff', border: '#e2e8f0', text: '#475569' },
                        { key: 'dark', label: 'Dark', icon: Moon, desc: 'Dark sidebar', bg: '#0f172a', border: '#1e293b', text: '#94a3b8' },
                        { key: 'branded', label: 'Branded', icon: Palette, desc: 'Uses your primary colour', bg: darken(draft.primaryColor, 0.28), border: darken(draft.primaryColor, 0.2), text: '#ffffff' },
                      ] as const).map(opt => {
                        const active = draft.sidebarStyle === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => handleChange('sidebarStyle', opt.key as SidebarStyle)}
                            className={`relative p-4 rounded-xl border-2 text-left transition-all ${active ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            {active && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            {/* Mini preview */}
                            <div className="w-full h-20 rounded-lg border overflow-hidden mb-3 flex" style={{ borderColor: opt.border }}>
                              <div className="w-1/3 flex flex-col items-center justify-center gap-1 py-2" style={{ backgroundColor: opt.bg }}>
                                <div className="w-4 h-4 rounded" style={{ backgroundColor: draft.primaryColor }} />
                                <div className="w-6 h-1 rounded-full" style={{ backgroundColor: opt.text, opacity: 0.4 }} />
                                <div className="w-5 h-1 rounded-full" style={{ backgroundColor: opt.text, opacity: 0.3 }} />
                                <div className="w-6 h-1 rounded-full" style={{ backgroundColor: opt.text, opacity: 0.3 }} />
                              </div>
                              <div className="flex-1 bg-slate-50 p-2">
                                <div className="w-full h-2 bg-slate-200 rounded mb-1" />
                                <div className="w-2/3 h-2 bg-slate-200 rounded" />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <opt.icon className="w-4 h-4 text-slate-500" />
                              <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Border radius */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                    <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center"><RectangleHorizontal className="w-3.5 h-3.5 text-amber-600" /></div>
                    <h3 className="text-[14px] font-semibold text-slate-700">Border Radius</h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-4">
                      {([
                        { key: 'sharp', label: 'Sharp', icon: Square, radius: '4px' },
                        { key: 'rounded', label: 'Rounded', icon: RectangleHorizontal, radius: '12px' },
                        { key: 'pill', label: 'Pill', icon: Circle, radius: '24px' },
                      ] as const).map(opt => {
                        const active = draft.borderRadius === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => handleChange('borderRadius', opt.key as BorderRadiusPreset)}
                            className={`relative p-4 rounded-xl border-2 text-center transition-all ${active ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            {active && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            <div
                              className="w-full h-12 border-2 border-slate-300 mb-3 mx-auto"
                              style={{ borderRadius: opt.radius, backgroundColor: lighten(draft.primaryColor, 0.38) }}
                            />
                            <div className="flex items-center justify-center gap-2">
                              <opt.icon className="w-4 h-4 text-slate-500" />
                              <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Logo upload */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                    <div className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center"><School className="w-3.5 h-3.5 text-emerald-600" /></div>
                    <h3 className="text-[14px] font-semibold text-slate-700">School Logo</h3>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-5">
                      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                        {draft.logoURL
                          ? <Image src={draft.logoURL} alt="Logo" width={80} height={80} className="w-full h-full object-contain" unoptimized />
                          : <Upload className="w-6 h-6 text-slate-300" />
                        }
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors">
                            Upload Logo
                            <input type="file" className="hidden" accept="image/*" onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = ev => {
                                  handleChange('logoURL', ev.target?.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }} />
                          </label>
                          {draft.logoURL && (
                            <button
                              onClick={() => handleChange('logoURL', undefined as any)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">PNG or SVG recommended. Max 2MB. Appears in sidebar and login.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TYPOGRAPHY TAB */}
            {activeTab === 'typography' && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center"><Type className="w-3.5 h-3.5 text-indigo-600" /></div>
                  <h3 className="text-[14px] font-semibold text-slate-700">Font Family</h3>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(Object.keys(FONT_MAP) as FontFamily[]).map(font => {
                      const active = draft.fontFamily === font;
                      const displayName = font.charAt(0).toUpperCase() + font.slice(1);
                      return (
                        <button
                          key={font}
                          onClick={() => handleChange('fontFamily', font)}
                          className={`relative p-4 rounded-xl border-2 text-left transition-all ${active ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          {active && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                          <p className="text-lg font-semibold text-slate-800 mb-1" style={{ fontFamily: FONT_MAP[font] }}>
                            {displayName}
                          </p>
                          <p className="text-sm text-slate-500" style={{ fontFamily: FONT_MAP[font] }}>
                            The quick brown fox jumps
                          </p>
                          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                            <span className="text-xs font-medium text-slate-400" style={{ fontFamily: FONT_MAP[font] }}>Aa Bb Cc 123</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* LOGIN PAGE TAB */}
            {activeTab === 'login' && (
              <>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                    <div className="w-6 h-6 rounded bg-cyan-100 flex items-center justify-center"><Monitor className="w-3.5 h-3.5 text-cyan-600" /></div>
                    <h3 className="text-[14px] font-semibold text-slate-700">Login Page Customisation</h3>
                  </div>
                  <div className="p-5 space-y-5">
                    {/* Tagline */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Custom Tagline</label>
                      <input
                        type="text"
                        value={draft.loginTagline || ''}
                        onChange={e => handleChange('loginTagline', e.target.value)}
                        placeholder="Streamline your institution..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                      />
                      <p className="text-xs text-slate-400 mt-1">Shown below the school name on the login page</p>
                    </div>

                    {/* Logo size */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Login Logo Size</label>
                      <div className="flex items-center gap-3">
                        {(['sm', 'md', 'lg'] as const).map(size => {
                          const active = (draft.loginLogoSize || 'md') === size;
                          const px = size === 'sm' ? '48px' : size === 'md' ? '64px' : '80px';
                          return (
                            <button
                              key={size}
                              onClick={() => handleChange('loginLogoSize', size)}
                              className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-lg border-2 transition-all ${active ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                              <div
                                className="rounded-lg flex items-center justify-center"
                                style={{ width: px, height: px, backgroundColor: lighten(draft.primaryColor, 0.35) }}
                              >
                                <School className="text-white" style={{ width: `calc(${px} * 0.5)`, height: `calc(${px} * 0.5)` }} />
                              </div>
                              <span className="text-xs font-medium text-slate-600 uppercase">{size}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer text */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Footer Text</label>
                      <input
                        type="text"
                        value={draft.footerText || ''}
                        onChange={e => handleChange('footerText', e.target.value)}
                        placeholder="(c) 2026 SuffaCampus"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                      />
                      <p className="text-xs text-slate-400 mt-1">Appears in the sidebar footer and login page</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* """""""""""""""" RIGHT (Live Preview) """""""""""""""" */}
          <div className="xl:col-span-1">
            <div className="sticky top-8 space-y-5">
              {/* Mini preview card */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center"><Eye className="w-3.5 h-3.5 text-slate-500" /></div>
                  <h3 className="text-[14px] font-semibold text-slate-700">Live Preview</h3>
                </div>
                <div className="p-4">
                  {/* App shell preview */}
                  <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ minHeight: 280 }}>
                    <div className="flex h-[280px]">
                      {/* Mini sidebar */}
                      <div
                        className="w-[72px] flex flex-col items-center py-3 gap-2 shrink-0 border-r"
                        style={{
                          backgroundColor: draft.sidebarStyle === 'dark' ? '#0f172a'
                            : draft.sidebarStyle === 'branded' ? darken(draft.primaryColor, 0.28)
                            : '#ffffff',
                          borderColor: draft.sidebarStyle === 'light' ? '#e2e8f0' : 'rgba(255,255,255,0.08)',
                        }}
                      >
                        {/* Logo */}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: draft.primaryColor }}>
                          {draft.logoURL
                            ? <Image src={draft.logoURL} alt="School logo" width={20} height={20} className="w-5 h-5 object-contain" unoptimized />
                            : <School className="w-4 h-4 text-white" />
                          }
                        </div>
                        {/* Nav items */}
                        {[0, 1, 2, 3, 4].map(i => (
                          <div
                            key={i}
                            className="w-8 h-7 rounded-md"
                            style={{
                              backgroundColor: i === 0
                                ? (draft.sidebarStyle === 'light' ? lighten(draft.primaryColor, 0.38) : 'rgba(255,255,255,0.12)')
                                : 'transparent',
                            }}
                          />
                        ))}
                      </div>

                      {/* Content area */}
                      <div className="flex-1 flex flex-col bg-[#f8fafc]">
                        {/* Navbar */}
                        <div className="h-10 bg-white border-b border-slate-200 flex items-center px-3 gap-2 shrink-0">
                          <div className="w-16 h-2.5 rounded bg-slate-200" />
                          <div className="flex-1" />
                          <div className="w-5 h-5 rounded-full bg-slate-100" />
                          <div className="w-5 h-5 rounded-full" style={{ backgroundColor: lighten(draft.primaryColor, 0.3) }} />
                        </div>
                        {/* Page */}
                        <div className="flex-1 p-3 space-y-2">
                          <div className="w-24 h-3 rounded bg-slate-200" />
                          <div className="grid grid-cols-3 gap-2">
                            {[draft.primaryColor, draft.accentColor, draft.secondaryColor].map((c, i) => (
                              <div key={i} className="h-14 rounded-lg border border-slate-200 bg-white p-2">
                                <div className="w-4 h-4 rounded mb-1" style={{ backgroundColor: lighten(c, 0.3) }} />
                                <div className="w-full h-1.5 rounded bg-slate-100" />
                              </div>
                            ))}
                          </div>
                          {/* Chart placeholder */}
                          <div className="h-20 rounded-lg border border-slate-200 bg-white p-2 flex items-end gap-1">
                            {[0.3, 0.5, 0.8, 0.6, 0.9, 0.4, 0.7].map((h, i) => (
                              <div
                                key={i}
                                className="flex-1 rounded-t"
                                style={{
                                  height: `${h * 100}%`,
                                  backgroundColor: i % 2 === 0 ? draft.primaryColor : lighten(draft.primaryColor, 0.25),
                                  opacity: 0.7 + i * 0.04,
                                }}
                              />
                            ))}
                          </div>
                          {/* Button preview */}
                          <div className="flex gap-2 mt-1">
                            <div className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-white" style={{ backgroundColor: draft.primaryColor }}>
                              Primary
                            </div>
                            <div className="px-3 py-1.5 rounded-lg text-[10px] font-medium border" style={{ borderColor: '#e2e8f0', color: '#475569' }}>
                              Secondary
                            </div>
                            <div className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-white" style={{ backgroundColor: draft.accentColor }}>
                              Accent
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Current config summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Config</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Primary</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded border border-slate-200" style={{ backgroundColor: draft.primaryColor }} />
                      <span className="text-xs font-mono text-slate-600">{draft.primaryColor.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Accent</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded border border-slate-200" style={{ backgroundColor: draft.accentColor }} />
                      <span className="text-xs font-mono text-slate-600">{draft.accentColor.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Sidebar</span>
                    <span className="text-xs font-medium text-slate-600 capitalize">{draft.sidebarStyle}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Font</span>
                    <span className="text-xs font-medium text-slate-600 capitalize">{draft.fontFamily}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Radius</span>
                    <span className="text-xs font-medium text-slate-600 capitalize">{draft.borderRadius}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* "" Sticky save bar """""""""""""""""""""""" */}
        {hasChanges && (
          <div className="sticky bottom-4 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-500" />
              <p className="text-sm text-slate-600">Preview active " save to apply permanently</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleDiscard}>Discard</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving
                  ? <><RotateCw className="w-4 h-4 animate-spin" /><span>Saving...</span></>
                  : <><Save className="w-4 h-4" /><span>Save Changes</span></>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

