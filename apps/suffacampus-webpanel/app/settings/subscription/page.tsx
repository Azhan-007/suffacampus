'use client';

import { useEffect, useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { SubscriptionService, SUBSCRIPTION_PLANS } from '@/services/subscriptionService';
import { useAuthStore } from '@/store/authStore';

import {
  Subscription,
  SubscriptionPlan,
  SubscriptionPlanDetails,
  BillingCycle,
  Invoice,
  Payment,
} from '@/types';
import {
  CreditCard,
  Crown,
  Check,
  X,
  ArrowRight,
  Calendar,
  Clock,
  Shield,
  FileText,
  Download,
  RotateCw,
  RefreshCw,
  Zap,
  Star,
  ChevronDown,
  ChevronUp,
  Receipt,
  Wallet,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
} from 'lucide-react';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import PaymentModal from '@/components/common/PaymentModal';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/designTokens';
import { format } from 'date-fns';

export default function SubscriptionPage() {
  const { currentSchool, user } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || '';

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const plans = useMemo(() => SubscriptionService.getAllPlans(), []);
  const currentPlan = subscription ? SUBSCRIPTION_PLANS[subscription.plan] : SUBSCRIPTION_PLANS.free;
  const daysRemaining = subscription?.endDate ? SubscriptionService.getDaysUntilRenewal(new Date(subscription.endDate)) : 0;
  const isExpiringSoon = subscription?.endDate ? SubscriptionService.isExpiringSoon(new Date(subscription.endDate)) : false;

  useEffect(() => {
    const unsub = SubscriptionService.subscribeToSubscription(schoolId, (sub) => {
      setSubscription(sub);
      setLastSynced(new Date());
      setLoading(false);
    });
    SubscriptionService.getInvoices(schoolId).then(setInvoices).catch(() => {});
    SubscriptionService.getPayments(schoolId).then(setPayments).catch(() => {});
    return unsub;
  }, [schoolId]);

  const fmtCurrency = (n: number) => formatCurrency(n);

  const statusStyles: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    trial: 'bg-blue-50 text-blue-700 border-blue-200',
    expired: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
    inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const planColors: Record<SubscriptionPlan, { bg: string; border: string; text: string; accent: string; icon: string }> = {
    free: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', accent: 'bg-slate-600', icon: 'text-slate-600' },
    basic: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'bg-blue-600', icon: 'text-blue-600' },
    pro: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', accent: 'bg-violet-600', icon: 'text-violet-600' },
    enterprise: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', accent: 'bg-amber-600', icon: 'text-amber-600' },
  };

  const handleChangePlan = async () => {
    if (!selectedPlan) return;
    const price = SubscriptionService.calculatePrice(selectedPlan, billingCycle);
    if (price.amount === 0) {
      // Free plan — no payment needed
      setChangingPlan(true);
      try {
        await SubscriptionService.changePlan(schoolId, selectedPlan, billingCycle);
        toast.success(`Plan changed to ${SUBSCRIPTION_PLANS[selectedPlan].name}`);
        setShowChangePlan(false);
        setSelectedPlan(null);
        const sub = await SubscriptionService.getSubscription(schoolId);
        if (sub) setSubscription(sub);
      } catch {
        toast.error('Failed to change plan');
      } finally {
        setChangingPlan(false);
      }
      return;
    }
    // Paid plan — open payment modal
    setShowChangePlan(false);
    setShowPaymentModal(true);
  };

  const handleSubscriptionPaymentSuccess = async () => {
    try {
      if (selectedPlan) {
        await SubscriptionService.changePlan(schoolId, selectedPlan, billingCycle);
        toast.success(`Plan changed to ${SUBSCRIPTION_PLANS[selectedPlan!].name}`);
      }
      const sub = await SubscriptionService.getSubscription(schoolId);
      if (sub) setSubscription(sub);
    } catch {
      toast.error('Payment succeeded but plan change failed. Contact support.');
    }
    setShowPaymentModal(false);
    setSelectedPlan(null);
  };

  if (loading) {
    return (<DashboardLayout><div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-slate-400">Loading subscription...</p></div></div></DashboardLayout>);
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Subscription</h1><p className="text-base text-slate-500 mt-1">Manage your plan and billing</p></div>
          <div className="flex items-center gap-2">
            {lastSynced && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-2" suppressHydrationWarning title={`Last synced: ${lastSynced.toLocaleTimeString()}`}>
                <RefreshCw className="w-3 h-3 text-emerald-500 animate-[spin_3s_linear_infinite]" />
                <span suppressHydrationWarning>Synced {format(lastSynced, 'h:mm:ss a')}</span>
              </div>
            )}
            <Button variant="secondary" onClick={() => setShowInvoices(!showInvoices)}><Receipt className="w-4 h-4" /><span>Invoices</span></Button>
            <Button onClick={() => setShowChangePlan(true)}><Zap className="w-4 h-4" /><span>Change Plan</span></Button>
          </div>
        </div>

        {/* Current Plan Card */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500" />
            <h3 className="text-[14px] font-semibold text-slate-700">Current Plan</h3>
          </div>
          <div className="p-5">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Plan Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${planColors[subscription?.plan || 'free'].bg} flex items-center justify-center`}>
                    <Crown className={`w-6 h-6 ${planColors[subscription?.plan || 'free'].icon}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-800">{currentPlan.name} Plan</h2>
                      {subscription && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyles[subscription.status] || statusStyles.inactive}`}>
                          {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">{currentPlan.description}</p>
                  </div>
                </div>
                {subscription && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Billing</p>
                      <p className="text-[14px] font-semibold text-slate-700 mt-0.5">{subscription.billingCycle === 'yearly' ? 'Annual' : 'Monthly'}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</p>
                      <p className="text-[14px] font-semibold text-slate-700 mt-0.5">{fmtCurrency(subscription.amount)}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Renews</p>
                      <p className="text-[14px] font-semibold text-slate-700 mt-0.5">{subscription.endDate ? format(new Date(subscription.endDate), 'MMM dd, yyyy') : '—'}</p>
                    </div>
                    <div className={`p-3 rounded-lg border ${isExpiringSoon ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Days Left</p>
                      <p className={`text-[14px] font-semibold mt-0.5 ${isExpiringSoon ? 'text-amber-600' : 'text-slate-700'}`}>{daysRemaining > 0 ? daysRemaining : 0}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Usage Limits */}
              <div className="lg:w-72 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Plan Limits</h4>
                <div className="space-y-2.5">
                  {[
                    { label: 'Students', value: currentPlan.limits.maxStudents, icon: '👨‍🎓' },
                    { label: 'Teachers', value: currentPlan.limits.maxTeachers, icon: '👩‍🏫' },
                    { label: 'Classes', value: currentPlan.limits.maxClasses, icon: '📚' },
                    { label: 'Admins', value: currentPlan.limits.maxAdmins, icon: '🔑' },
                    { label: 'Storage', value: currentPlan.limits.maxStorage, icon: '💾', suffix: currentPlan.limits.maxStorage >= 1000 ? ' GB' : ' MB' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 flex items-center gap-1.5"><span className="text-[14px]">{item.icon}</span>{item.label}</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {item.value === -1 ? 'Unlimited' : item.suffix ? (item.label === 'Storage' && item.value >= 1000 ? `${item.value / 1000}${item.suffix}` : `${item.value}${item.suffix}`) : item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {isExpiringSoon && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700">Your subscription expires in {daysRemaining} days. {subscription?.autoRenew ? 'It will auto-renew.' : 'Please renew to continue using all features.'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <h3 className="text-[14px] font-semibold text-slate-700">Included Features</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {currentPlan.features.map((feature) => (
                <div key={feature.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${feature.included ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-50'}`}>
                  {feature.included ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                  <div>
                    <p className={`text-xs font-medium ${feature.included ? 'text-slate-700' : 'text-slate-400'}`}>{feature.name}</p>
                    <p className="text-xs text-slate-400">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Invoices & Payment History */}
        {showInvoices && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Invoices */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-600" />
                <h3 className="text-[14px] font-semibold text-slate-700">Invoices</h3>
                <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{invoices.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <div className="p-8 text-center"><p className="text-sm text-slate-400">No invoices yet</p></div>
                ) : invoices.map((inv) => (
                  <div key={inv.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{inv.invoiceNumber}</p>
                      <p className="text-xs text-slate-400">{format(new Date(inv.invoiceDate), 'MMM dd, yyyy')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-700">{fmtCurrency(inv.total)}</p>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : inv.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payments */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <h3 className="text-[14px] font-semibold text-slate-700">Payments</h3>
                <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{payments.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <div className="p-8 text-center"><p className="text-sm text-slate-400">No payments yet</p></div>
                ) : payments.map((pay) => (
                  <div key={pay.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 capitalize">{pay.method} {pay.paymentMethodDetails?.last4 ? `•••• ${pay.paymentMethodDetails.last4}` : ''}</p>
                      <p className="text-xs text-slate-400">{format(new Date(pay.createdAt), 'MMM dd, yyyy')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-700">{fmtCurrency(pay.amount)}</p>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${pay.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : pay.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                        {pay.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Plan Comparison */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /><h3 className="text-[14px] font-semibold text-slate-700">All Plans</h3></div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setBillingCycle('monthly')} className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${billingCycle === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Monthly</button>
              <button onClick={() => setBillingCycle('yearly')} className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${billingCycle === 'yearly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Yearly <span className="text-emerald-600 font-bold">-17%</span></button>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan) => {
                const isCurrent = subscription?.plan === plan.id;
                const colors = planColors[plan.id];
                const price = SubscriptionService.calculatePrice(plan.id, billingCycle);
                return (
                  <div key={plan.id} className={`relative rounded-xl border-2 p-5 transition-all ${isCurrent ? `${colors.border} ${colors.bg}` : 'border-slate-200 hover:border-slate-300'} ${(plan as any).isPopular ? 'ring-2 ring-violet-200' : ''}`}>
                    {(plan as any).isPopular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold text-white bg-violet-600 px-3 py-0.5 rounded-full">POPULAR</span>}
                    {isCurrent && <span className="absolute -top-2.5 right-3 text-xs font-bold text-white bg-emerald-600 px-3 py-0.5 rounded-full">CURRENT</span>}
                    <div className="text-center mb-4">
                      <h4 className="text-[15px] font-semibold text-slate-800">{plan.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{plan.description}</p>
                    </div>
                    <div className="text-center mb-4">
                      <span className="text-[28px] font-extrabold text-slate-800">{price.amount === 0 ? 'Free' : fmtCurrency(price.amount)}</span>
                      {price.amount > 0 && <span className="text-xs text-slate-400">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>}
                      {price.savings > 0 && <p className="text-xs text-emerald-600 font-medium mt-0.5">Save {fmtCurrency(price.savings)}/year</p>}
                    </div>
                    <div className="space-y-2 mb-4">
                      <p className="text-xs font-medium text-slate-400 uppercase">Limits</p>
                      {Object.entries(plan.limits).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 capitalize">{key.replace('max', '')}</span>
                          <span className="font-medium text-slate-700">{val === -1 ? '∞' : key === 'maxStorage' ? (val >= 1000 ? `${val / 1000} GB` : `${val} MB`) : val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5 mb-4">
                      <p className="text-xs font-medium text-slate-400 uppercase">Features</p>
                      {plan.features.slice(0, 6).map((f) => (
                        <div key={f.id} className="flex items-center gap-1.5 text-xs">
                          {f.included ? <Check className="w-3 h-3 text-emerald-500" /> : <X className="w-3 h-3 text-slate-300" />}
                          <span className={f.included ? 'text-slate-600' : 'text-slate-400'}>{f.name}</span>
                        </div>
                      ))}
                    </div>
                    {isCurrent ? (
                      <div className="w-full py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-200">Current Plan</div>
                    ) : (
                      <button onClick={() => { setSelectedPlan(plan.id); setShowChangePlan(true); }} className={`w-full py-2 text-xs font-semibold rounded-lg border transition-all ${SubscriptionService.isUpgrade(subscription?.plan || 'free', plan.id) ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                        {SubscriptionService.isUpgrade(subscription?.plan || 'free', plan.id) ? 'Upgrade' : 'Switch'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Change Plan Modal */}
      <Modal isOpen={showChangePlan} onClose={() => { setShowChangePlan(false); setSelectedPlan(null); }} title="Change Plan">
        <div className="p-5 space-y-4">
          {selectedPlan && (
            <>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${planColors[selectedPlan].bg} flex items-center justify-center`}>
                    <Crown className={`w-5 h-5 ${planColors[selectedPlan].icon}`} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-800">{SUBSCRIPTION_PLANS[selectedPlan].name} Plan</h3>
                    <p className="text-xs text-slate-400">{SUBSCRIPTION_PLANS[selectedPlan].description}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  {SubscriptionService.isUpgrade(subscription?.plan || 'free', selectedPlan)
                    ? 'Your plan will be upgraded immediately.'
                    : 'Your plan will be changed at the end of the current billing period.'}
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-sm text-slate-600">Billing Cycle</span>
                <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-0.5">
                  <button onClick={() => setBillingCycle('monthly')} className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${billingCycle === 'monthly' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'}`}>Monthly</button>
                  <button onClick={() => setBillingCycle('yearly')} className={`text-xs font-medium px-3 py-1 rounded-md transition-all ${billingCycle === 'yearly' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'}`}>Yearly</button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-sm text-slate-600">Amount</span>
                <span className="text-[15px] font-semibold text-slate-800">{fmtCurrency(SubscriptionService.calculatePrice(selectedPlan, billingCycle).amount)}<span className="text-xs font-normal text-slate-400">/{billingCycle === 'yearly' ? 'year' : 'month'}</span></span>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50">
          <Button variant="secondary" onClick={() => { setShowChangePlan(false); setSelectedPlan(null); }}>Cancel</Button>
          <Button onClick={handleChangePlan} disabled={changingPlan || !selectedPlan}>{changingPlan ? <><RotateCw className="w-4 h-4 animate-spin" /><span>Processing...</span></> : <><Zap className="w-4 h-4" /><span>Confirm Change</span></>}</Button>
        </div>
      </Modal>

      {/* Payment Modal for Subscription Upgrades */}
      {selectedPlan && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => { setShowPaymentModal(false); setSelectedPlan(null); }}
          schoolId={schoolId}
          amount={SubscriptionService.calculatePrice(selectedPlan, billingCycle).amount}
          description={`${SUBSCRIPTION_PLANS[selectedPlan].name} Plan`}
          customerName={currentSchool?.name || 'School'}
          plan={selectedPlan}
          billingCycle={billingCycle}
          onSuccess={handleSubscriptionPaymentSuccess}
          onFailure={() => { toast.error('Payment failed. Please try again.'); }}
        />
      )}
    </DashboardLayout>
  );
}
