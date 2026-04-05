'use client';

import { ReactNode, useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { BrandingProvider } from '@/components/providers/BrandingProvider';
import ErrorBoundary from '@/components/common/ErrorBoundary';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <BrandingProvider>
      <div className="flex h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        {/* Skip-to-content (visible on focus for keyboard users) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
        >
          Skip to main content
        </a>

        {/* Mobile overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar wrapper */}
        <div
          className={`
            fixed inset-y-0 left-0 z-50 lg:relative lg:z-0
            transition-transform duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Navbar onMenuClick={() => setMobileMenuOpen(true)} />
          <main id="main-content" className="flex-1 overflow-y-auto scrollbar-thin" role="main">
            <div className="mx-auto max-w-[1360px] px-6 py-8 lg:px-10 lg:py-10">
              <ErrorBoundary context="Page">
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </BrandingProvider>
  );
}
