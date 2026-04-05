'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { SchoolBranding } from '@/types';
import { SettingsService } from '@/services/settingsService';
import {
  buildCSSVariables,
  applyCSSVariables,
  resetCSSVariables,
  resolveBranding,
  FONT_IMPORT_URLS,
  DEFAULT_BRANDING,
} from '@/lib/brandingUtils';

/* ------------------------------------------------------------------ */
/*  Context types                                                      */
/* ------------------------------------------------------------------ */

interface BrandingContextValue {
  /** Resolved branding (always has all fields populated) */
  branding: SchoolBranding;
  /** Whether branding data is still loading */
  loading: boolean;
  /** Update branding optimistically (also persists) */
  updateBranding: (partial: Partial<SchoolBranding>) => void;
  /** Preview branding without persisting */
  previewBranding: (partial: Partial<SchoolBranding>) => void;
  /** Reset preview to last-saved branding */
  cancelPreview: () => void;
  /** Whether we are currently previewing unsaved changes */
  isPreviewing: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  loading: true,
  updateBranding: () => {},
  previewBranding: () => {},
  cancelPreview: () => {},
  isPreviewing: false,
});

export const useBranding = () => useContext(BrandingContext);

/* ------------------------------------------------------------------ */
/*  Font loader helper                                                 */
/* ------------------------------------------------------------------ */

function loadFont(fontFamily: string): void {
  if (typeof document === 'undefined') return;
  const url = FONT_IMPORT_URLS[fontFamily as keyof typeof FONT_IMPORT_URLS];
  if (!url) return;
  const id = `font-${fontFamily}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [savedBranding, setSavedBranding] = useState<SchoolBranding>(DEFAULT_BRANDING);
  const [previewOverrides, setPreviewOverrides] = useState<Partial<SchoolBranding> | null>(null);
  const [loading, setLoading] = useState(true);

  // The active branding (preview wins over saved)
  const branding = useMemo<SchoolBranding>(
    () => previewOverrides ? resolveBranding({ ...savedBranding, ...previewOverrides }) : savedBranding,
    [savedBranding, previewOverrides],
  );

  // Subscribe to settings changes and extract branding
  useEffect(() => {
    const unsub = SettingsService.subscribeToSettings((settings) => {
      const resolved = resolveBranding({
        primaryColor: settings.primaryColor || DEFAULT_BRANDING.primaryColor,
        secondaryColor: settings.secondaryColor || DEFAULT_BRANDING.secondaryColor,
        logoURL: settings.logoURL,
        ...settings.branding,
      });
      setSavedBranding(resolved);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Apply CSS variables whenever active branding changes
  useEffect(() => {
    const vars = buildCSSVariables(branding);
    applyCSSVariables(vars);

    // Apply font-family to body
    if (typeof document !== 'undefined') {
      document.body.style.fontFamily = vars['--font-family'] || '';
    }

    // Load the font if non-default
    if (branding.fontFamily !== 'inter') {
      loadFont(branding.fontFamily);
    }

    return () => {
      // Reset on unmount (e.g., navigating to login)
      resetCSSVariables();
      if (typeof document !== 'undefined') {
        document.body.style.fontFamily = '';
      }
    };
  }, [branding]);

  // Persist branding update
  const updateBranding = useCallback(async (partial: Partial<SchoolBranding>) => {
    const merged = resolveBranding({ ...savedBranding, ...partial });
    setSavedBranding(merged);
    setPreviewOverrides(null);

    // Persist to backend
    try {
      await SettingsService.updateSettings({
        primaryColor: merged.primaryColor,
        secondaryColor: merged.secondaryColor,
        logoURL: merged.logoURL,
        branding: merged,
      });
    } catch (err) {
      console.error('Failed to persist branding', err);
    }
  }, [savedBranding]);

  // Preview only (no persist)
  const previewBranding = useCallback((partial: Partial<SchoolBranding>) => {
    setPreviewOverrides(prev => ({ ...prev, ...partial }));
  }, []);

  const cancelPreview = useCallback(() => {
    setPreviewOverrides(null);
  }, []);

  const value = useMemo<BrandingContextValue>(() => ({
    branding,
    loading,
    updateBranding,
    previewBranding,
    cancelPreview,
    isPreviewing: previewOverrides !== null,
  }), [branding, loading, updateBranding, previewBranding, cancelPreview, previewOverrides]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}
