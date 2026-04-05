// â”€â”€ White-Label Branding Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Pure helpers for generating CSS custom properties, colour variants,
// and font configuration from a SchoolBranding object.

import { SchoolBranding, BrandingPreset, FontFamily, BorderRadiusPreset } from '@/types';

/* ------------------------------------------------------------------ */
/*  Colour manipulation helpers                                        */
/* ------------------------------------------------------------------ */

/** Parse a hex colour string into RGB components */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const big = parseInt(cleaned.length === 3
    ? cleaned.split('').map(c => c + c).join('')
    : cleaned, 16);
  return { r: (big >> 16) & 255, g: (big >> 8) & 255, b: big & 255 };
}

/** Convert RGB to hex */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Convert RGB to HSL */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** Convert HSL to RGB */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
  };
}

/** Lighten a hex colour by a given amount (0-1) */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const newL = Math.min(1, l + amount);
  const rgb = hslToRgb(h, s, newL);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/** Darken a hex colour by a given amount (0-1) */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const newL = Math.max(0, l - amount);
  const rgb = hslToRgb(h, s, newL);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/** Get a colour's perceived luminance (0-1) */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Returns 'light' or 'dark' depending on the colour's brightness */
export function contrastMode(hex: string): 'light' | 'dark' {
  return luminance(hex) > 0.55 ? 'dark' : 'light';
}

/* ------------------------------------------------------------------ */
/*  CSS variable generation                                            */
/* ------------------------------------------------------------------ */

/** Generate a full palette (50-900) from a base hex colour */
export function generatePalette(base: string): Record<string, string> {
  return {
    '50':  lighten(base, 0.42),
    '100': lighten(base, 0.36),
    '200': lighten(base, 0.28),
    '300': lighten(base, 0.18),
    '400': lighten(base, 0.08),
    '500': base,
    '600': darken(base, 0.06),
    '700': darken(base, 0.14),
    '800': darken(base, 0.22),
    '900': darken(base, 0.32),
  };
}

/** Build a CSS-variable map from a SchoolBranding */
export function buildCSSVariables(branding: SchoolBranding): Record<string, string> {
  const palette = generatePalette(branding.primaryColor);
  const { r, g, b } = hexToRgb(branding.primaryColor);

  const vars: Record<string, string> = {
    // Primary palette
    '--color-primary':        branding.primaryColor,
    '--color-primary-light':  palette['400'],
    '--color-primary-dark':   palette['700'],
    '--color-primary-50':     palette['50'],
    '--color-primary-100':    palette['100'],
    '--color-primary-rgb':    `${r}, ${g}, ${b}`,

    // Secondary
    '--color-secondary':      branding.secondaryColor,

    // Accent
    '--color-accent':         branding.accentColor,
    '--color-accent-light':   lighten(branding.accentColor, 0.35),

    // Sidebar
    '--sidebar-bg':           branding.sidebarStyle === 'dark'    ? '#0f172a'
                            : branding.sidebarStyle === 'branded' ? darken(branding.primaryColor, 0.28)
                            : '#ffffff',
    '--sidebar-text':         branding.sidebarStyle === 'light'   ? '#64748b' : 'rgba(255,255,255,0.7)',
    '--sidebar-text-active':  branding.sidebarStyle === 'light'   ? branding.primaryColor : '#ffffff',
    '--sidebar-active-bg':    branding.sidebarStyle === 'light'   ? palette['50'] : 'rgba(255,255,255,0.1)',
    '--sidebar-border':       branding.sidebarStyle === 'light'   ? '#e2e8f0' : 'rgba(255,255,255,0.08)',
    '--sidebar-section':      branding.sidebarStyle === 'light'   ? '#94a3b8' : 'rgba(255,255,255,0.35)',
    '--sidebar-hover-bg':     branding.sidebarStyle === 'light'   ? '#f8fafc' : 'rgba(255,255,255,0.06)',
    '--sidebar-header-text':  branding.sidebarStyle === 'light'   ? '#0f172a' : '#ffffff',
    '--sidebar-header-sub':   branding.sidebarStyle === 'light'   ? '#94a3b8' : 'rgba(255,255,255,0.5)',
    '--sidebar-divider':      branding.sidebarStyle === 'light'   ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
    '--sidebar-footer':       branding.sidebarStyle === 'light'   ? '#94a3b8' : 'rgba(255,255,255,0.4)',
    '--sidebar-footer-border': branding.sidebarStyle === 'light'  ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
    '--sidebar-icon-bg':      branding.sidebarStyle === 'light'   ? branding.primaryColor
                            : branding.sidebarStyle === 'branded' ? lighten(branding.primaryColor, 0.08)
                            : '#3b82f6',
    '--sidebar-indicator':    branding.sidebarStyle === 'light'   ? branding.primaryColor : '#ffffff',

    // Font
    '--font-family':          FONT_MAP[branding.fontFamily] || FONT_MAP.inter,

    // Radius
    '--radius-sm':  RADIUS_MAP[branding.borderRadius]?.sm  || '0.375rem',
    '--radius-md':  RADIUS_MAP[branding.borderRadius]?.md  || '0.5rem',
    '--radius-lg':  RADIUS_MAP[branding.borderRadius]?.lg  || '0.75rem',
    '--radius-xl':  RADIUS_MAP[branding.borderRadius]?.xl  || '1rem',
    '--radius-2xl': RADIUS_MAP[branding.borderRadius]?.['2xl'] || '1.25rem',
  };

  return vars;
}

/** Apply CSS variables to the document root */
export function applyCSSVariables(vars: Record<string, string>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

/** Remove custom CSS variables (reset to defaults) */
export function resetCSSVariables(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const keys = [
    '--color-primary', '--color-primary-light', '--color-primary-dark',
    '--color-primary-50', '--color-primary-100', '--color-primary-rgb',
    '--color-secondary', '--color-accent', '--color-accent-light',
    '--sidebar-bg', '--sidebar-text', '--sidebar-text-active',
    '--sidebar-active-bg', '--sidebar-border', '--sidebar-section',
    '--sidebar-hover-bg', '--sidebar-header-text', '--sidebar-header-sub',
    '--sidebar-divider', '--sidebar-footer', '--sidebar-footer-border',
    '--sidebar-icon-bg', '--sidebar-indicator',
    '--font-family',
    '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl',
  ];
  keys.forEach(k => root.style.removeProperty(k));
}

/* ------------------------------------------------------------------ */
/*  Font map                                                           */
/* ------------------------------------------------------------------ */

export const FONT_MAP: Record<FontFamily, string> = {
  inter:   "'Inter', system-ui, -apple-system, sans-serif",
  poppins: "'Poppins', system-ui, -apple-system, sans-serif",
  roboto:  "'Roboto', system-ui, -apple-system, sans-serif",
  nunito:  "'Nunito', system-ui, -apple-system, sans-serif",
  outfit:  "'Outfit', system-ui, -apple-system, sans-serif",
};

export const FONT_IMPORT_URLS: Record<FontFamily, string> = {
  inter:   'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  roboto:  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap',
  nunito:  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap',
  outfit:  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap',
};

/* ------------------------------------------------------------------ */
/*  Border radius map                                                  */
/* ------------------------------------------------------------------ */

const RADIUS_MAP: Record<BorderRadiusPreset, Record<string, string>> = {
  sharp: {
    sm: '0.125rem', md: '0.25rem', lg: '0.375rem', xl: '0.5rem', '2xl': '0.625rem',
  },
  rounded: {
    sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', '2xl': '1.25rem',
  },
  pill: {
    sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem', '2xl': '2rem',
  },
};

/* ------------------------------------------------------------------ */
/*  Built-in presets                                                    */
/* ------------------------------------------------------------------ */

export const BRANDING_PRESETS: BrandingPreset[] = [
  {
    id: 'ocean',
    name: 'Ocean Blue',
    colors: { primary: '#2563eb', secondary: '#eff6ff', accent: '#0ea5e9' },
    sidebarStyle: 'light',
    preview: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    colors: { primary: '#059669', secondary: '#ecfdf5', accent: '#10b981' },
    sidebarStyle: 'light',
    preview: 'linear-gradient(135deg, #059669, #10b981)',
  },
  {
    id: 'royal',
    name: 'Royal Purple',
    colors: { primary: '#7c3aed', secondary: '#f5f3ff', accent: '#a855f7' },
    sidebarStyle: 'dark',
    preview: 'linear-gradient(135deg, #7c3aed, #a855f7)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: { primary: '#ea580c', secondary: '#fff7ed', accent: '#f59e0b' },
    sidebarStyle: 'light',
    preview: 'linear-gradient(135deg, #ea580c, #f59e0b)',
  },
  {
    id: 'slate',
    name: 'Slate Pro',
    colors: { primary: '#334155', secondary: '#f8fafc', accent: '#6366f1' },
    sidebarStyle: 'dark',
    preview: 'linear-gradient(135deg, #334155, #6366f1)',
  },
  {
    id: 'rose',
    name: 'Rose',
    colors: { primary: '#e11d48', secondary: '#fff1f2', accent: '#f43f5e' },
    sidebarStyle: 'light',
    preview: 'linear-gradient(135deg, #e11d48, #f43f5e)',
  },
  {
    id: 'teal',
    name: 'Teal',
    colors: { primary: '#0d9488', secondary: '#f0fdfa', accent: '#14b8a6' },
    sidebarStyle: 'light',
    preview: 'linear-gradient(135deg, #0d9488, #14b8a6)',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: { primary: '#1e40af', secondary: '#eff6ff', accent: '#3b82f6' },
    sidebarStyle: 'dark',
    preview: 'linear-gradient(135deg, #1e40af, #3b82f6)',
  },
];

/* ------------------------------------------------------------------ */
/*  Default branding                                                    */
/* ------------------------------------------------------------------ */

export const DEFAULT_BRANDING: SchoolBranding = {
  primaryColor: '#2563eb',
  secondaryColor: '#eff6ff',
  accentColor: '#0ea5e9',
  sidebarStyle: 'light',
  fontFamily: 'inter',
  borderRadius: 'rounded',
  loginTagline: 'Streamline your institution with our comprehensive management platform.',
  loginLogoSize: 'md',
  footerText: 'Â© 2026 SuffaCampus',
};

/** Merge partial branding with defaults */
export function resolveBranding(partial?: Partial<SchoolBranding>): SchoolBranding {
  return { ...DEFAULT_BRANDING, ...partial };
}

