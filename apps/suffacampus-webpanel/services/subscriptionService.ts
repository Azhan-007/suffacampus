import { apiFetch } from '@/lib/api';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionPlanDetails,
  BillingCycle,
  Invoice,
  Payment,
  PlanFeature,
} from '@/types';

// =============================================================================
// PLAN DEFINITIONS (client-side configuration for UI display)
// =============================================================================

const createFeature = (
  id: string,
  name: string,
  description: string,
  included: boolean,
  limit?: number | 'unlimited'
): PlanFeature => ({ id, name, description, included, limit });

export const SUBSCRIPTION_PLANS: Record<
  SubscriptionPlan,
  SubscriptionPlanDetails
> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Perfect for small schools just getting started',
    pricing: { monthly: 0, yearly: 0, currency: 'INR', yearlyDiscount: 0 },
    limits: {
      maxStudents: 50,
      maxTeachers: 5,
      maxClasses: 5,
      maxAdmins: 1,
      maxStorage: 100,
    },
    features: [
      createFeature('dashboard', 'Dashboard', 'Basic analytics dashboard', true),
      createFeature('students', 'Student Management', 'Add and manage students', true, 50),
      createFeature('teachers', 'Teacher Management', 'Add and manage teachers', true, 5),
      createFeature('attendance', 'Attendance Tracking', 'Daily attendance marking', true),
      createFeature('classes', 'Class Management', 'Manage classes and sections', true, 5),
      createFeature('fees', 'Fee Management', 'Basic fee collection', false),
      createFeature('library', 'Library Management', 'Book inventory management', false),
      createFeature('reports', 'Reports & Analytics', 'Advanced reporting', false),
      createFeature('timetable', 'Timetable Builder', 'Schedule management', false),
      createFeature('events', 'Events & Calendar', 'School events management', true),
      createFeature('branding', 'Custom Branding', 'White-label with your logo', false),
      createFeature('api', 'API Access', 'REST API for integrations', false),
      createFeature('support', 'Support', 'Community support only', true),
    ],
    trialDays: 0,
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'For growing schools that need more features',
    pricing: { monthly: 2999, yearly: 29990, currency: 'INR', yearlyDiscount: 17 },
    limits: {
      maxStudents: 200,
      maxTeachers: 20,
      maxClasses: 15,
      maxAdmins: 3,
      maxStorage: 500,
    },
    features: [
      createFeature('dashboard', 'Dashboard', 'Advanced analytics dashboard', true),
      createFeature('students', 'Student Management', 'Add and manage students', true, 200),
      createFeature('teachers', 'Teacher Management', 'Add and manage teachers', true, 20),
      createFeature('attendance', 'Attendance Tracking', 'Daily attendance with reports', true),
      createFeature('classes', 'Class Management', 'Manage classes and sections', true, 15),
      createFeature('fees', 'Fee Management', 'Complete fee management', true),
      createFeature('library', 'Library Management', 'Book inventory management', false),
      createFeature('reports', 'Reports & Analytics', 'Standard reports', true),
      createFeature('timetable', 'Timetable Builder', 'Schedule management', true),
      createFeature('events', 'Events & Calendar', 'School events management', true),
      createFeature('branding', 'Custom Branding', 'White-label with your logo', false),
      createFeature('api', 'API Access', 'REST API for integrations', false),
      createFeature('support', 'Support', 'Email support (48h response)', true),
    ],
    trialDays: 14,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For established schools wanting full features',
    pricing: { monthly: 5999, yearly: 59990, currency: 'INR', yearlyDiscount: 17 },
    limits: {
      maxStudents: 1000,
      maxTeachers: 100,
      maxClasses: 50,
      maxAdmins: 10,
      maxStorage: 2000,
    },
    features: [
      createFeature('dashboard', 'Dashboard', 'Full analytics with insights', true),
      createFeature('students', 'Student Management', 'Unlimited student profiles', true, 1000),
      createFeature('teachers', 'Teacher Management', 'Full teacher management', true, 100),
      createFeature('attendance', 'Attendance Tracking', 'Advanced attendance system', true),
      createFeature('classes', 'Class Management', 'Full class management', true, 50),
      createFeature('fees', 'Fee Management', 'Advanced fee with reminders', true),
      createFeature('library', 'Library Management', 'Complete library system', true),
      createFeature('reports', 'Reports & Analytics', 'Advanced custom reports', true),
      createFeature('timetable', 'Timetable Builder', 'Full scheduling system', true),
      createFeature('events', 'Events & Calendar', 'Full event management', true),
      createFeature('branding', 'Custom Branding', 'White-label with your logo', true),
      createFeature('api', 'API Access', 'REST API for integrations', false),
      createFeature('support', 'Support', 'Priority email support (24h)', true),
    ],
    isPopular: true,
    trialDays: 14,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large institutions with custom needs',
    pricing: { monthly: 14999, yearly: 149990, currency: 'INR', yearlyDiscount: 17 },
    limits: {
      maxStudents: -1,
      maxTeachers: -1,
      maxClasses: -1,
      maxAdmins: -1,
      maxStorage: -1,
    },
    features: [
      createFeature('dashboard', 'Dashboard', 'Enterprise analytics', true, 'unlimited'),
      createFeature('students', 'Student Management', 'Unlimited students', true, 'unlimited'),
      createFeature('teachers', 'Teacher Management', 'Unlimited teachers', true, 'unlimited'),
      createFeature('attendance', 'Attendance Tracking', 'Biometric integration ready', true),
      createFeature('classes', 'Class Management', 'Unlimited classes', true, 'unlimited'),
      createFeature('fees', 'Fee Management', 'Multi-gateway payments', true),
      createFeature('library', 'Library Management', 'Full library + RFID ready', true),
      createFeature('reports', 'Reports & Analytics', 'Custom report builder', true),
      createFeature('timetable', 'Timetable Builder', 'AI-powered scheduling', true),
      createFeature('events', 'Events & Calendar', 'Full event + notifications', true),
      createFeature('branding', 'Custom Branding', 'Full white-label solution', true),
      createFeature('api', 'API Access', 'Full API with webhooks', true),
      createFeature('support', 'Support', 'Dedicated account manager', true),
    ],
    trialDays: 30,
  },
};

// Plan tier order for upgrade/downgrade comparison
const PLAN_ORDER: SubscriptionPlan[] = ['free', 'basic', 'pro', 'enterprise'];

// =============================================================================
// Helpers
// =============================================================================

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number')
    return new Date(value);
  if (typeof value === 'object') {
    const v = value as Record<string, number>;
    if ('seconds' in v) return new Date(v.seconds * 1000);
    if ('_seconds' in v) return new Date(v._seconds * 1000);
  }
  return new Date(0);
}

function deserializeSubscription(raw: Record<string, unknown>): Subscription {
  return {
    ...(raw as unknown as Subscription),
    startDate: toDate(raw.startDate),
    endDate: toDate(raw.endDate),
    trialEndDate: raw.trialEndDate ? toDate(raw.trialEndDate) : undefined,
    cancelledAt: raw.cancelledAt ? toDate(raw.cancelledAt) : undefined,
    nextBillingDate: raw.nextBillingDate
      ? toDate(raw.nextBillingDate)
      : undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

function deserializeInvoice(raw: Record<string, unknown>): Invoice {
  return {
    ...(raw as unknown as Invoice),
    invoiceDate: toDate(raw.invoiceDate),
    dueDate: toDate(raw.dueDate),
    paidAt: raw.paidAt ? toDate(raw.paidAt) : undefined,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

function deserializePayment(raw: Record<string, unknown>): Payment {
  return {
    ...(raw as unknown as Payment),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class SubscriptionService {
  // ---------------------------------------------------------------------------
  // Pure / UI-only methods (no backend calls)
  // ---------------------------------------------------------------------------

  /** Get all plan details for display. */
  static getAllPlans(): SubscriptionPlanDetails[] {
    return Object.values(SUBSCRIPTION_PLANS);
  }

  /** Get details for a specific plan. */
  static getPlanDetails(plan: SubscriptionPlan): SubscriptionPlanDetails {
    return SUBSCRIPTION_PLANS[plan];
  }

  /** Format currency value for display (INR). */
  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /** Calculate price for a plan + billing cycle. */
  static calculatePrice(
    plan: SubscriptionPlan,
    billingCycle: BillingCycle
  ): { amount: number; savings: number } {
    const pricing = SUBSCRIPTION_PLANS[plan].pricing;
    if (billingCycle === 'yearly') {
      const monthlyCost = pricing.monthly * 12;
      return {
        amount: pricing.yearly,
        savings: monthlyCost - pricing.yearly,
      };
    }
    return { amount: pricing.monthly, savings: 0 };
  }

  /** Check if moving from one plan to another is an upgrade. */
  static isUpgrade(
    fromPlan: SubscriptionPlan,
    toPlan: SubscriptionPlan
  ): boolean {
    return PLAN_ORDER.indexOf(toPlan) > PLAN_ORDER.indexOf(fromPlan);
  }

  /** Days until a given expiry date. */
  static getDaysUntilRenewal(endDate: Date): number {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /** True if the subscription ends within 30 days. */
  static isExpiringSoon(endDate: Date): boolean {
    return SubscriptionService.getDaysUntilRenewal(endDate) <= 30;
  }

  /** Check if a feature is accessible on the given plan. */
  static canAccessFeature(
    plan: SubscriptionPlan,
    featureId: string
  ): boolean {
    const planDetails = SUBSCRIPTION_PLANS[plan];
    const feature = planDetails.features.find((f) => f.id === featureId);
    return feature?.included ?? false;
  }

  // ---------------------------------------------------------------------------
  // Backend API methods
  // ---------------------------------------------------------------------------

  /**
   * Get current subscription — backend: GET /subscriptions/status
   */
  static async getSubscription(
    _schoolId: string
  ): Promise<Subscription | null> {
    try {
      const raw = await apiFetch<Record<string, unknown>>(
        '/subscriptions/status'
      );
      return deserializeSubscription(raw);
    } catch {
      return null;
    }
  }

  /**
   * Poll for subscription updates every 30 seconds.
   */
  static subscribeToSubscription(
    schoolId: string,
    callback: (subscription: Subscription | null) => void
  ): () => void {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const sub = await SubscriptionService.getSubscription(schoolId);
        if (!cancelled) callback(sub);
      } catch (err) {
        console.error('subscribeToSubscription: poll error', err);
        if (!cancelled) callback(null);
      }
    };

    poll();
    const intervalId = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }

  /**
   * Get invoices — backend: GET /subscriptions/invoices
   */
  static async getInvoices(_schoolId: string): Promise<Invoice[]> {
    try {
      const raw = await apiFetch<Record<string, unknown>[]>(
        '/subscriptions/invoices?limit=100'
      );
      return raw.map(deserializeInvoice);
    } catch {
      return [];
    }
  }

  /**
   * Get payments — derived from invoices (backend has no separate payments list).
   * Returns empty array if backend does not support a payments endpoint.
   */
  static async getPayments(_schoolId: string): Promise<Payment[]> {
    try {
      // If a dedicated payments endpoint exists, use it; otherwise return [].
      const raw = await apiFetch<Record<string, unknown>[]>(
        '/subscriptions/invoices?limit=100'
      );
      // Map invoices to payment-like objects for backward compatibility
      return raw
        .filter((inv) => inv.paymentId)
        .map((inv) => deserializePayment(inv));
    } catch {
      return [];
    }
  }

  /**
   * Change subscription plan — backend: POST /payments/create-order
   * Creates a Razorpay order for the new plan amount.
   */
  static async changePlan(
    _schoolId: string,
    plan: SubscriptionPlan,
    billingCycle: BillingCycle
  ): Promise<void> {
    const { amount } = SubscriptionService.calculatePrice(plan, billingCycle);
    const durationDays = billingCycle === 'yearly' ? 365 : 30;

    await apiFetch('/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({
        amount: amount * 100, // convert to paise
        currency: 'INR',
        plan,
        durationDays,
      }),
    });
  }

  /**
   * Cancel subscription — backend: POST /subscriptions/cancel
   */
  static async cancelSubscription(
    _schoolId: string,
    reason?: string
  ): Promise<void> {
    await apiFetch('/subscriptions/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * Get usage stats — backend: GET /subscriptions/usage
   */
  static async getUsageStats(
    _schoolId: string
  ): Promise<Record<string, unknown>> {
    try {
      return await apiFetch<Record<string, unknown>>('/subscriptions/usage');
    } catch {
      return {};
    }
  }
}
