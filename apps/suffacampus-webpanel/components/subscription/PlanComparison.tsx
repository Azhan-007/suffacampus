'use client';

import { Check, X, Sparkles, Zap } from 'lucide-react';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';
import { SubscriptionPlan, BillingCycle } from '@/types';
import { SUBSCRIPTION_PLANS, SubscriptionService } from '@/services/subscriptionService';

interface PlanComparisonProps {
  currentPlan?: SubscriptionPlan;
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  onSelectPlan: (plan: SubscriptionPlan) => void;
  loading?: boolean;
  showAllFeatures?: boolean;
}

export default function PlanComparison({
  currentPlan,
  billingCycle,
  onBillingCycleChange,
  onSelectPlan,
  loading = false,
  showAllFeatures = false,
}: PlanComparisonProps) {
  const plans = SubscriptionService.getAllPlans();

  const formatPrice = (plan: SubscriptionPlan) => {
    const details = SUBSCRIPTION_PLANS[plan];
    const price = billingCycle === 'yearly' 
      ? details.pricing.yearly 
      : details.pricing.monthly;
    
    if (price === 0) return 'Free';
    
    return SubscriptionService.formatCurrency(price);
  };

  const getMonthlyEquivalent = (plan: SubscriptionPlan) => {
    const details = SUBSCRIPTION_PLANS[plan];
    if (billingCycle === 'monthly' || details.pricing.yearly === 0) return null;
    
    const monthlyEquiv = Math.round(details.pricing.yearly / 12);
    return SubscriptionService.formatCurrency(monthlyEquiv);
  };

  const formatLimit = (value: number) => {
    if (value === -1) return 'Unlimited';
    return value.toLocaleString('en-IN');
  };

  const getButtonProps = (plan: SubscriptionPlan) => {
    if (!currentPlan) {
      return { text: 'Get Started', variant: 'primary' as const };
    }
    if (plan === currentPlan) {
      return { text: 'Current Plan', variant: 'secondary' as const, disabled: true };
    }
    if (SubscriptionService.isUpgrade(currentPlan, plan)) {
      return { text: 'Upgrade', variant: 'primary' as const };
    }
    return { text: 'Downgrade', variant: 'secondary' as const };
  };

  return (
    <div className="space-y-6">
      {/* Billing Cycle Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => onBillingCycleChange('monthly')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              billingCycle === 'monthly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => onBillingCycleChange('yearly')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              billingCycle === 'yearly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Yearly
            <Badge variant="success" size="sm">Save 17%</Badge>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const buttonProps = getButtonProps(plan.id);
          const monthlyEquiv = getMonthlyEquivalent(plan.id);
          const isCurrent = plan.id === currentPlan;
          const isPopular = plan.isPopular;

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-6 flex flex-col ${
                isPopular
                  ? 'border-blue-600 shadow-sm'
                  : isCurrent
                  ? 'border-emerald-500'
                  : 'border-slate-200'
              }`}
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              {/* Popular Badge */}
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Most Popular
                  </span>
                </div>
              )}

              {/* Current Badge */}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Current Plan
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
              </div>

              {/* Pricing */}
              <div className="text-center mb-6">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-semibold text-slate-900">
                    {formatPrice(plan.id)}
                  </span>
                  {plan.pricing.monthly > 0 && (
                    <span className="text-gray-500">
                      /{billingCycle === 'yearly' ? 'year' : 'month'}
                    </span>
                  )}
                </div>
                {monthlyEquiv && (
                  <p className="text-sm text-gray-500 mt-1">
                    {monthlyEquiv}/month when billed yearly
                  </p>
                )}
                {plan.trialDays > 0 && !currentPlan && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center justify-center gap-1">
                    <Zap className="h-4 w-4" />
                    {plan.trialDays}-day free trial
                  </p>
                )}
              </div>

              {/* CTA Button */}
              <Button
                variant={buttonProps.variant}
                className="w-full mb-6"
                onClick={() => onSelectPlan(plan.id)}
                disabled={buttonProps.disabled || loading}
              >
                {buttonProps.text}
              </Button>

              {/* Limits */}
              <div className="space-y-3 mb-6">
                <h4 className="text-sm font-medium text-gray-900">Includes:</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>
                      <strong>{formatLimit(plan.limits.maxStudents)}</strong> students
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>
                      <strong>{formatLimit(plan.limits.maxTeachers)}</strong> teachers
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>
                      <strong>{formatLimit(plan.limits.maxClasses)}</strong> classes
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span>
                      <strong>
                        {plan.limits.maxStorage === -1 
                          ? 'Unlimited' 
                          : plan.limits.maxStorage >= 1000 
                          ? `${plan.limits.maxStorage / 1000} GB` 
                          : `${plan.limits.maxStorage} MB`}
                      </strong>{' '}
                      storage
                    </span>
                  </li>
                </ul>
              </div>

              {/* Features */}
              <div className="flex-1">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Features:</h4>
                <ul className="space-y-2 text-sm">
                  {plan.features
                    .filter((f) => showAllFeatures || f.included)
                    .slice(0, showAllFeatures ? undefined : 6)
                    .map((feature) => (
                      <li key={feature.id} className="flex items-start gap-2">
                        {feature.included ? (
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-4 w-4 text-gray-300 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={feature.included ? 'text-gray-700' : 'text-gray-400'}>
                          {feature.name}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table (Optional) */}
      {showAllFeatures && (
        <div className="mt-12">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 text-center">
            Full Feature Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Feature
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.id}
                      className={`text-center py-3 px-4 text-sm font-medium ${
                        plan.id === currentPlan ? 'text-green-600' : 'text-gray-900'
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Limits rows */}
                <tr className="border-b bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium text-gray-700" colSpan={5}>
                    Limits
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm text-gray-600">Students</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm">
                      {formatLimit(plan.limits.maxStudents)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm text-gray-600">Teachers</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm">
                      {formatLimit(plan.limits.maxTeachers)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm text-gray-600">Classes</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm">
                      {formatLimit(plan.limits.maxClasses)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm text-gray-600">Storage</td>
                  {plans.map((plan) => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm">
                      {plan.limits.maxStorage === -1
                        ? 'Unlimited'
                        : plan.limits.maxStorage >= 1000
                        ? `${plan.limits.maxStorage / 1000} GB`
                        : `${plan.limits.maxStorage} MB`}
                    </td>
                  ))}
                </tr>

                {/* Feature rows */}
                <tr className="border-b bg-gray-50">
                  <td className="py-3 px-4 text-sm font-medium text-gray-700" colSpan={5}>
                    Features
                  </td>
                </tr>
                {plans[0].features.map((feature) => (
                  <tr key={feature.id} className="border-b">
                    <td className="py-3 px-4 text-sm text-gray-600">{feature.name}</td>
                    {plans.map((plan) => {
                      const planFeature = plan.features.find((f) => f.id === feature.id);
                      return (
                        <td key={plan.id} className="text-center py-3 px-4">
                          {planFeature?.included ? (
                            <Check className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            <X className="h-5 w-5 text-gray-300 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
