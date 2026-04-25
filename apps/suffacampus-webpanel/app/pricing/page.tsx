'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { School, ArrowRight, CheckCircle2, X, Zap, Crown, Building2, Sparkles, ChevronDown } from 'lucide-react';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';
import { SUBSCRIPTION_PLANS, SubscriptionService } from '@/services/subscriptionService';
import { BillingCycle, SubscriptionPlan } from '@/types';

const planIcons: Record<string, React.ReactNode> = {
  free: <Zap className="w-6 h-6 text-slate-400" />,
  starter: <Sparkles className="w-6 h-6 text-blue-500" />,
  pro: <Crown className="w-6 h-6 text-blue-500" />,
  enterprise: <Building2 className="w-6 h-6 text-amber-500" />,
};

export default function PricingPage() {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plans = SubscriptionService.getAllPlans();

  const handleGetStarted = (plan: SubscriptionPlan) => {
    router.push(`/login?plan=${plan}&billing=${billingCycle}`);
  };

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

  const faqItems = [
    {
      question: 'Can I switch plans anytime?',
      answer:
        'Yes! You can upgrade or downgrade your plan at any time. When upgrading, you\'ll be charged the prorated difference. When downgrading, the change takes effect at the end of your billing cycle.',
    },
    {
      question: 'What happens when I reach my limits?',
      answer:
        'You\'ll receive alerts when approaching your limits. If you reach the limit, you won\'t be able to add more data until you upgrade or the new billing cycle begins.',
    },
    {
      question: 'Is there a setup fee?',
      answer:
        'No, there are no setup fees. You can start using SuffaCampus immediately after signing up. We also offer free data migration assistance for Pro and Enterprise plans.',
    },
    {
      question: 'What payment methods do you accept?',
      answer:
        'We accept all major credit/debit cards, UPI, Net Banking, and digital wallets through our secure payment partner Razorpay.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 w-10 h-10 rounded-lg flex items-center justify-center">
                <School className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">SuffaCampus</h1>
                <p className="text-xs text-slate-500">School Management Platform</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => router.push('/login')}>
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="page-header justify-center mb-2">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Pricing Plans
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10">
            Welcome to SuffaCampus " choose the plan that best fits your school&apos;s needs.
            From free starter tools to enterprise-grade solutions, we have a tier for every institution.
          </p>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-16">
            <div className="inline-flex items-center bg-slate-100 rounded-full p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 text-sm font-medium rounded-full transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2 text-sm font-medium rounded-full transition-colors flex items-center gap-2 ${
                  billingCycle === 'yearly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Yearly
                <Badge variant="success" size="sm">Save 17%</Badge>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 items-start">
            {plans.map((plan) => {
              const monthlyEquiv = getMonthlyEquivalent(plan.id);
              const isPopular = plan.isPopular;

              return (
                <div
                  key={plan.id}
                  className={`relative bg-white rounded-xl border p-8 flex flex-col ${
                    isPopular
                      ? 'border-blue-600 shadow-sm'
                      : 'border-slate-200'
                  }`}
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  {/* Popular Badge */}
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-medium flex items-center gap-1.5">
                        <Crown className="w-3 h-3" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Plan Icon & Name */}
                  <div className="text-center mb-6">
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 ${
                      isPopular ? 'bg-blue-50' : 'bg-slate-50'
                    }`}>
                      {planIcons[plan.id] || <Zap className="w-6 h-6 text-slate-400" />}
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
                    <p className="text-sm text-slate-500 mt-1.5">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="text-center mb-8">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold text-slate-900">
                        {formatPrice(plan.id)}
                      </span>
                      {plan.pricing.monthly > 0 && (
                        <span className="text-base font-normal text-slate-500">
                          /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                        </span>
                      )}
                    </div>
                    {monthlyEquiv && (
                      <p className="text-sm text-slate-400 mt-2">
                        {monthlyEquiv}/month when billed yearly
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handleGetStarted(plan.id)}
                    className={`w-full mb-8 py-2.5 px-6 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                      isPopular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    {plan.pricing.monthly === 0 ? 'Get Started Free' : 'Start Free Trial'}
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  {/* Limits */}
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">
                      What&apos;s Included
                    </h4>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-slate-600">
                          <strong className="text-slate-800">{formatLimit(plan.limits.maxStudents)}</strong> students
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-slate-600">
                          <strong className="text-slate-800">{formatLimit(plan.limits.maxTeachers)}</strong> teachers
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-slate-600">
                          <strong className="text-slate-800">{formatLimit(plan.limits.maxClasses)}</strong> classes
                        </span>
                      </li>
                      <li className="flex items-center gap-3">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm text-slate-600">
                          <strong className="text-slate-800">
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
                    <h4 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">
                      Features
                    </h4>
                    <ul className="space-y-2.5">
                      {plan.features.filter((f) => f.included).map((feature) => (
                        <li key={feature.id} className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-slate-600">{feature.name}</span>
                        </li>
                      ))}
                      {plan.features.filter((f) => !f.included).map((feature) => (
                        <li key={feature.id} className="flex items-start gap-2.5">
                          <X className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-slate-400 line-through">{feature.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Trial Notice */}
                  {plan.trialDays > 0 && (
                    <p className="text-center text-sm text-slate-400 mt-6 pt-6 border-t border-slate-200">
                      {plan.trialDays}-day free trial included
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-semibold text-slate-900 mb-3">
              Frequently Asked Questions
            </h2>
            <p className="text-slate-500">Everything you need to know about our plans and billing.</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
              <h3 className="text-sm font-semibold text-slate-800">Common Questions</h3>
            </div>
            <div className="p-6 space-y-3">
            {faqItems.map((item, index) => (
              <div
                key={index}
                className="border border-slate-200 rounded-xl overflow-hidden transition-all duration-300"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
                >
                  <h3 className="font-medium text-slate-800">{item.question}</h3>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 transition-transform duration-300 flex-shrink-0 ml-4 ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === index ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <p className="text-slate-500 px-5 pb-5 leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-slate-900 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative">
          <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">
            Ready to transform your school management?
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-2xl mx-auto">
            Join thousands of schools already using SuffaCampus to streamline their operations.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-8 py-3 rounded-lg font-medium text-base transition-colors"
          >
            Start Your Free Trial
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center">
                <School className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold">SuffaCampus</span>
            </div>
            <p className="text-slate-400 text-sm">
              (c) 2026 SuffaCampus. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

