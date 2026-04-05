'use client';

import { useState } from 'react';
import { Zap, ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { SUBSCRIPTION_PLANS, SubscriptionService } from '@/services/subscriptionService';
import { SubscriptionPlan, BillingCycle } from '@/types';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: SubscriptionPlan;
  blockedResource?: string;
  blockedMessage?: string;
  suggestedPlan?: SubscriptionPlan;
}

export default function UpgradePrompt({
  isOpen,
  onClose,
  currentPlan,
  blockedResource,
  blockedMessage,
  suggestedPlan,
}: UpgradePromptProps) {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');

  // Determine the suggested upgrade plan
  const getRecommendedPlan = (): SubscriptionPlan => {
    if (suggestedPlan) return suggestedPlan;
    
    const planOrder: SubscriptionPlan[] = ['free', 'basic', 'pro', 'enterprise'];
    const currentIndex = planOrder.indexOf(currentPlan);
    return planOrder[Math.min(currentIndex + 1, planOrder.length - 1)];
  };

  const recommendedPlan = getRecommendedPlan();
  const planDetails = SUBSCRIPTION_PLANS[recommendedPlan];
  const currentDetails = SUBSCRIPTION_PLANS[currentPlan];
  const priceInfo = SubscriptionService.calculatePrice(recommendedPlan, billingCycle);

  const handleUpgrade = () => {
    router.push('/settings/subscription');
    onClose();
  };

  // Get feature improvements
  const improvements = planDetails.features
    .filter((f) => {
      const currentFeature = currentDetails.features.find((cf) => cf.id === f.id);
      return f.included && (!currentFeature || !currentFeature.included);
    })
    .slice(0, 4);

  // Get limit improvements
  const limitImprovements = [
    {
      label: 'Students',
      current: currentDetails.limits.maxStudents,
      new: planDetails.limits.maxStudents,
    },
    {
      label: 'Teachers',
      current: currentDetails.limits.maxTeachers,
      new: planDetails.limits.maxTeachers,
    },
    {
      label: 'Classes',
      current: currentDetails.limits.maxClasses,
      new: planDetails.limits.maxClasses,
    },
    {
      label: 'Storage',
      current: currentDetails.limits.maxStorage,
      new: planDetails.limits.maxStorage,
      format: (v: number) =>
        v === -1 ? 'Unlimited' : v >= 1000 ? `${v / 1000} GB` : `${v} MB`,
    },
  ].filter((l) => l.new > l.current || l.new === -1);

  const formatLimit = (value: number, customFormat?: (v: number) => string) => {
    if (customFormat) return customFormat(value);
    if (value === -1) return 'Unlimited';
    return value.toLocaleString('en-IN');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="text-center py-2">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <Zap className="h-8 w-8 text-blue-600" />
        </div>

        {/* Header */}
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Upgrade to {planDetails.name}
        </h2>
        
        {blockedMessage && (
          <p className="text-gray-600 mb-4">
            {blockedMessage}
          </p>
        )}

        {!blockedMessage && blockedResource && (
          <p className="text-gray-600 mb-4">
            You&apos;ve reached your {blockedResource} limit. Upgrade to continue growing.
          </p>
        )}

        {!blockedMessage && !blockedResource && (
          <p className="text-gray-600 mb-4">
            Unlock more features and increase your limits.
          </p>
        )}

        {/* Billing Toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly (Save 17%)
            </button>
          </div>
        </div>

        {/* Price */}
        <div className="mb-6">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-semibold text-slate-900">
              {SubscriptionService.formatCurrency(priceInfo.amount)}
            </span>
            <span className="text-gray-500">
              /{billingCycle === 'yearly' ? 'year' : 'month'}
            </span>
          </div>
          {priceInfo.savings > 0 && (
            <p className="text-sm text-green-600 mt-1">
              Save {SubscriptionService.formatCurrency(priceInfo.savings)} per year
            </p>
          )}
        </div>

        {/* Limit Improvements */}
        {limitImprovements.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Increased Limits:</h4>
            <div className="grid grid-cols-2 gap-3">
              {limitImprovements.map((limit) => (
                <div key={limit.label} className="flex items-center gap-2 text-sm">
                  <ArrowRight className="h-4 w-4 text-green-500" />
                  <span className="text-gray-600">{limit.label}:</span>
                  <span className="font-medium text-gray-900">
                    {formatLimit(limit.new, limit.format)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Features */}
        {improvements.length > 0 && (
          <div className="text-left mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">New features you&apos;ll get:</h4>
            <ul className="space-y-2">
              {improvements.map((feature) => (
                <li key={feature.id} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-gray-900">{feature.name}</span>
                    <span className="text-gray-500"> - {feature.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Maybe Later
          </Button>
          <Button variant="primary" onClick={handleUpgrade} className="flex-1">
            <Zap className="h-4 w-4 mr-2" />
            Upgrade Now
          </Button>
        </div>

        {/* Trial Notice */}
        {planDetails.trialDays > 0 && (
          <p className="text-xs text-gray-500 mt-4">
            Start with a {planDetails.trialDays}-day free trial. Cancel anytime.
          </p>
        )}
      </div>
    </Modal>
  );
}
