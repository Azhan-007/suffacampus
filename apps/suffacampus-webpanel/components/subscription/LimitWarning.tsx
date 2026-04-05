'use client';

import { AlertTriangle, TrendingUp, X } from 'lucide-react';
import { useState } from 'react';
import Button from '@/components/common/Button';
import { useRouter } from 'next/navigation';

interface LimitWarningProps {
  resource: string;
  current: number;
  limit: number;
  percentage: number;
  dismissible?: boolean;
  showUpgradeButton?: boolean;
  className?: string;
}

export default function LimitWarning({
  resource,
  current,
  limit,
  percentage,
  dismissible = true,
  showUpgradeButton = true,
  className = '',
}: LimitWarningProps) {
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  if (dismissed || percentage < 80) return null;

  const isCritical = percentage >= 95;
  const isAtLimit = percentage >= 100;

  const getMessage = () => {
    if (isAtLimit) {
      return `You've reached your ${resource} limit (${current}/${limit}). Upgrade to add more.`;
    }
    if (isCritical) {
      return `You're at ${percentage}% of your ${resource} limit. Upgrade soon to avoid interruptions.`;
    }
    return `You're using ${percentage}% of your ${resource} limit (${current}/${limit}).`;
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg ${
        isCritical
          ? 'bg-red-50 border border-red-200'
          : 'bg-yellow-50 border border-yellow-200'
      } ${className}`}
    >
      <AlertTriangle
        className={`h-5 w-5 flex-shrink-0 ${
          isCritical ? 'text-red-500' : 'text-yellow-500'
        }`}
      />
      <div className="flex-1">
        <p
          className={`text-sm font-medium ${
            isCritical ? 'text-red-800' : 'text-yellow-800'
          }`}
        >
          {getMessage()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {showUpgradeButton && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => router.push('/settings/subscription')}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Upgrade
          </Button>
        )}
        {dismissible && (
          <button
            onClick={() => setDismissed(true)}
            className={`p-1 rounded hover:bg-opacity-20 ${
              isCritical ? 'hover:bg-red-500' : 'hover:bg-yellow-500'
            }`}
          >
            <X className={`h-4 w-4 ${isCritical ? 'text-red-500' : 'text-yellow-500'}`} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Inline limit indicator for showing in headers/cards
 */
export function LimitIndicator({
  current,
  limit,
  label,
  showWarning = true,
}: {
  current: number;
  limit: number;
  label?: string;
  showWarning?: boolean;
}) {
  const percentage = limit === -1 ? 0 : Math.round((current / limit) * 100);
  const isWarning = showWarning && percentage >= 80;
  const isCritical = showWarning && percentage >= 95;

  return (
    <div className="flex items-center gap-2 text-sm">
      {label && <span className="text-gray-500">{label}:</span>}
      <span
        className={`font-medium ${
          isCritical
            ? 'text-red-600'
            : isWarning
            ? 'text-yellow-600'
            : 'text-gray-700'
        }`}
      >
        {current.toLocaleString('en-IN')}
        {limit !== -1 && ` / ${limit.toLocaleString('en-IN')}`}
      </span>
      {isWarning && (
        <AlertTriangle
          className={`h-4 w-4 ${isCritical ? 'text-red-500' : 'text-yellow-500'}`}
        />
      )}
    </div>
  );
}
