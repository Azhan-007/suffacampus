// ── Design System Tokens ─────────────────────────────────────────────
// Centralized theme tokens for consistent styling across the application

export const colors = {
  primary: {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
    400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
    800: '#1e40af', 900: '#1e3a8a',
  },
  success: {
    50: '#ecfdf5', 100: '#d1fae5', 500: '#10b981', 600: '#059669', 700: '#047857',
  },
  warning: {
    50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
  },
  danger: {
    50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
  },
  slate: {
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
    400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
    800: '#1e293b', 900: '#0f172a',
  },
} as const;

export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '2.5rem', // 40px
  '3xl': '3rem',   // 48px
} as const;

export const typography = {
  display: { size: '2rem', weight: '800', lineHeight: '1.2' },
  h1: { size: '1.5rem', weight: '700', lineHeight: '1.3' },
  h2: { size: '1.25rem', weight: '700', lineHeight: '1.35' },
  h3: { size: '1rem', weight: '600', lineHeight: '1.4' },
  body: { size: '0.875rem', weight: '400', lineHeight: '1.5' },
  bodyMedium: { size: '0.8125rem', weight: '500', lineHeight: '1.5' },
  caption: { size: '0.75rem', weight: '500', lineHeight: '1.4' },
  tiny: { size: '0.6875rem', weight: '600', lineHeight: '1.3' },
} as const;

export const shadows = {
  card: '0 1px 2px rgba(0,0,0,0.04)',
  cardHover: '0 2px 8px rgba(0,0,0,0.06)',
  elevated: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
  dropdown: '0 8px 24px -4px rgba(0,0,0,0.1), 0 2px 6px -2px rgba(0,0,0,0.05)',
  button: 'none',
} as const;

export const radii = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.25rem',
  full: '9999px',
} as const;

// Currency Configuration
export const CURRENCY = {
  code: 'INR',
  symbol: '₹',
  locale: 'en-IN',
} as const;

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatCurrencyCompact(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

// Avatar color palette for initials-based avatars
export const AVATAR_COLORS = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-emerald-500 to-emerald-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
  'from-sky-500 to-sky-600',
  'from-purple-500 to-purple-600',
  'from-teal-500 to-teal-600',
  'from-pink-500 to-pink-600',
  'from-indigo-500 to-indigo-600',
] as const;

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Status color maps
export const STATUS_COLORS = {
  Present: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  Absent: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  Late: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' },
  Leave: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  Excused: { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  Pass: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  Fail: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  Paid: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  Pending: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' },
  Overdue: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
  Partial: { bg: 'bg-sky-50', text: 'text-sky-600', dot: 'bg-sky-500' },
  Active: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  Inactive: { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
  Available: { bg: 'bg-emerald-50', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  Issued: { bg: 'bg-amber-50', text: 'text-amber-600', dot: 'bg-amber-500' },
} as const;

// Grade colors
export const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-600 bg-emerald-50',
  'A': 'text-emerald-600 bg-emerald-50',
  'B+': 'text-blue-600 bg-blue-50',
  'B': 'text-blue-600 bg-blue-50',
  'C+': 'text-amber-600 bg-amber-50',
  'C': 'text-amber-600 bg-amber-50',
  'D': 'text-orange-600 bg-orange-50',
  'F': 'text-red-600 bg-red-50',
};

// Class options (6-12)
export const CLASS_OPTIONS = [
  { value: '6', label: 'Class 6' },
  { value: '7', label: 'Class 7' },
  { value: '8', label: 'Class 8' },
  { value: '9', label: 'Class 9' },
  { value: '10', label: 'Class 10' },
  { value: '11', label: 'Class 11' },
  { value: '12', label: 'Class 12' },
];

export const SECTION_OPTIONS = [
  { value: 'A', label: 'Section A' },
  { value: 'B', label: 'Section B' },
  { value: 'C', label: 'Section C' },
  { value: 'D', label: 'Section D' },
];
