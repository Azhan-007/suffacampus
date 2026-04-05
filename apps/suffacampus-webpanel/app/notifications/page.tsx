'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import NotificationList from '@/components/notifications/NotificationList';
import NotificationPreferencesPanel from '@/components/notifications/NotificationPreferencesPanel';
import { useDocumentTitle } from '@/hooks';
import { Bell } from 'lucide-react';

type NotificationTab = 'all' | 'unread';

const tabs: Array<{ key: NotificationTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];

export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Notifications</h1>
              <p className="text-sm text-slate-500">Track alerts and manage your preferences.</p>
            </div>
          </div>
        </div>

        <div className="sticky top-16 z-10 -mx-2 px-2 py-2 bg-white/90 backdrop-blur-sm">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div>
            <NotificationList
              unreadOnly={activeTab === 'unread'}
              limit={100}
            />
          </div>

          <aside className="xl:sticky xl:top-24">
            <NotificationPreferencesPanel />
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
