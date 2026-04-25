import { apiFetch } from '@/lib/api';
import {
  PaymentRequest,
  PaymentResult,
  PaymentGatewayConfig,
  PaymentVerification,
  RazorpayOrder,
  PaymentMethod,
} from '@/types';

// =============================================================================
// Razorpay SDK Type Declarations
// =============================================================================

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  image?: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: { color: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    confirm_close?: boolean;
  };
}

interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutInstance {
  open: () => void;
  close: () => void;
  on: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

// =============================================================================
// Constants
// =============================================================================

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const SANDBOX_KEY = 'rzp_test_sandbox_demo';

/**
 * Returns true when running in production build without a Razorpay key.
 * In this case, payment features should be disabled " never serve demo data.
 */
function isPaymentUnconfigured(): boolean {
  return process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
}

// =============================================================================
// Configuration
// =============================================================================

function getConfig(): PaymentGatewayConfig {
  if (isPaymentUnconfigured()) {
    throw new Error(
      'Payment gateway is not configured. Set NEXT_PUBLIC_RAZORPAY_KEY_ID to enable payments.'
    );
  }

  const keyId =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''
      : '';

  const sandboxMode = !keyId || keyId.startsWith('rzp_test_');

  return {
    provider: sandboxMode ? 'sandbox' : 'razorpay',
    keyId: keyId || SANDBOX_KEY,
    companyName: 'SuffaCampus',
    logo: '/logo.png',
    theme: { color: '#2563EB' },
    sandboxMode,
  };
}

// =============================================================================
// Script Loader
// =============================================================================

let scriptLoadPromise: Promise<boolean> | null = null;

/**
 * Dynamically load the Razorpay checkout.js SDK.
 * Returns true if loaded successfully, false otherwise.
 */
function loadRazorpayScript(): Promise<boolean> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve) => {
    // Already loaded
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(true);
      return;
    }

    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      scriptLoadPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return scriptLoadPromise;
}

// =============================================================================
// Sandbox / Demo Mode
// =============================================================================

/**
 * Simulate a payment in sandbox mode.
 * Returns a mock payment result after a short delay.
 */
function simulateSandboxPayment(
  request: PaymentRequest
): Promise<PaymentResult> {
  return new Promise((resolve) => {
    const delay = 1500 + Math.random() * 1000;

    setTimeout(() => {
      const success = Math.random() > 0.1; // 90% success rate in sandbox

      if (success) {
        const methods: PaymentMethod[] = ['card', 'upi', 'netbanking', 'wallet'];
        const method = methods[Math.floor(Math.random() * methods.length)];

        resolve({
          success: true,
          paymentId: `pay_sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          orderId: `order_sandbox_${Date.now()}`,
          signature: `sig_sandbox_${Math.random().toString(36).slice(2, 20)}`,
          method,
          amount: request.amount,
        });
      } else {
        resolve({
          success: false,
          error: 'Payment was declined. Please try again.',
          amount: request.amount,
        });
      }
    }, delay);
  });
}

// =============================================================================
// Service
// =============================================================================

export class PaymentGatewayService {
  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /** Get current payment gateway configuration */
  static getConfig(): PaymentGatewayConfig {
    return getConfig();
  }

  /** Check if running in sandbox mode */
  static isSandboxMode(): boolean {
    return getConfig().sandboxMode;
  }

  // ---------------------------------------------------------------------------
  // Order Management
  // ---------------------------------------------------------------------------

  /**
   * Create a payment order on the backend.
   * Backend endpoint: POST /payments/create-order
   */
  static async createOrder(
    schoolId: string,
    request: PaymentRequest
  ): Promise<RazorpayOrder> {
    const config = getConfig();

    // In sandbox mode, return a mock order
    if (config.sandboxMode) {
      return {
        id: `order_sandbox_${Date.now()}`,
        amount: Math.round(request.amount * 100), // convert to paise
        currency: request.currency || 'INR',
        receipt: `rcpt_${request.feeId || request.subscriptionId || Date.now()}`,
        status: 'created',
        notes: {
          schoolId,
          ...(request.feeId ? { feeId: request.feeId } : {}),
          ...(request.plan ? { plan: request.plan } : {}),
          ...(request.notes || {}),
        },
      };
    }

    // Real backend call
    const raw = await apiFetch<Record<string, unknown>>(
      '/payments/create-order',
      {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(request.amount * 100), // paise
          currency: request.currency || 'INR',
          description: request.description,
          feeId: request.feeId,
          subscriptionId: request.subscriptionId,
          plan: request.plan,
          billingCycle: request.billingCycle,
          notes: {
            schoolId,
            customerName: request.customerName,
            ...(request.notes || {}),
          },
        }),
      }
    );

    return raw as unknown as RazorpayOrder;
  }

  /**
   * Verify payment on the backend.
   * Backend endpoint: POST /payments/verify
   */
  static async verifyPayment(
    _schoolId: string,
    verification: PaymentVerification
  ): Promise<{ verified: boolean; paymentId?: string }> {
    const config = getConfig();

    // In sandbox mode, always verify successfully
    if (config.sandboxMode) {
      return { verified: true, paymentId: verification.razorpay_payment_id };
    }

    const result = await apiFetch<{ verified: boolean; paymentId?: string }>(
      '/payments/verify',
      {
        method: 'POST',
        body: JSON.stringify(verification),
      }
    );

    return result;
  }

  /**
   * Request a refund for a payment.
   * Backend endpoint: POST /payments/refund
   */
  static async refundPayment(
    _schoolId: string,
    paymentId: string,
    amount?: number,
    reason?: string
  ): Promise<{ success: boolean; refundId?: string }> {
    const config = getConfig();

    if (config.sandboxMode) {
      return {
        success: true,
        refundId: `rfnd_sandbox_${Date.now()}`,
      };
    }

    return await apiFetch<{ success: boolean; refundId?: string }>(
      '/payments/refund',
      {
        method: 'POST',
        body: JSON.stringify({ paymentId, amount, reason }),
      }
    );
  }

  /**
   * Get payment history.
   * Backend endpoint: GET /payments/history
   */
  static async getPaymentHistory(
    _schoolId: string,
    params?: { page?: number; limit?: number; status?: string }
  ): Promise<PaymentResult[]> {
    const config = getConfig();

    if (config.sandboxMode) {
      // Return demo payment history
      return generateDemoPaymentHistory();
    }

    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);

    return await apiFetch<PaymentResult[]>(
      `/payments/history?${query.toString()}`
    );
  }

  // ---------------------------------------------------------------------------
  // Checkout Flow
  // ---------------------------------------------------------------------------

  /**
   * Initiate a payment via Razorpay Checkout or sandbox simulation.
   * This is the main entry point for starting a payment.
   */
  static async initiatePayment(
    schoolId: string,
    request: PaymentRequest
  ): Promise<PaymentResult> {
    const config = getConfig();

    // "" Sandbox mode: simulate payment """"""""""""""""""""""""""""""""""
    if (config.sandboxMode) {
      return simulateSandboxPayment(request);
    }

    // "" Production mode: Razorpay Checkout """"""""""""""""""""""""""""""
    // 1. Load the SDK
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      return {
        success: false,
        error: 'Failed to load payment gateway. Please try again.',
        amount: request.amount,
      };
    }

    // 2. Create order on backend
    const order = await PaymentGatewayService.createOrder(schoolId, request);

    // 3. Open Razorpay Checkout
    return new Promise<PaymentResult>((resolve) => {
      const options: RazorpayCheckoutOptions = {
        key: config.keyId,
        amount: order.amount,
        currency: order.currency,
        name: config.companyName,
        description: request.description,
        image: config.logo,
        order_id: order.id,
        prefill: {
          name: request.customerName,
          email: request.customerEmail,
          contact: request.customerPhone,
        },
        notes: order.notes,
        theme: config.theme,
        handler: async (response: RazorpayCheckoutResponse) => {
          try {
            // Verify on backend
            const verification =
              await PaymentGatewayService.verifyPayment(schoolId, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });

            if (verification.verified) {
              resolve({
                success: true,
                paymentId: response.razorpay_payment_id,
                orderId: response.razorpay_order_id,
                signature: response.razorpay_signature,
                amount: request.amount,
              });
            } else {
              resolve({
                success: false,
                error: 'Payment verification failed. Please contact support.',
                amount: request.amount,
              });
            }
          } catch {
            resolve({
              success: false,
              error: 'Payment verification error. Please contact support.',
              amount: request.amount,
            });
          }
        },
        modal: {
          ondismiss: () => {
            resolve({
              success: false,
              error: 'Payment cancelled by user.',
              amount: request.amount,
            });
          },
          escape: true,
          confirm_close: true,
        },
      };

      const rzp = new window.Razorpay!(options);
      rzp.on('payment.failed', () => {
        resolve({
          success: false,
          error: 'Payment failed. Please try again or use a different method.',
          amount: request.amount,
        });
      });
      rzp.open();
    });
  }

  // ---------------------------------------------------------------------------
  // Fee Payment Helper
  // ---------------------------------------------------------------------------

  /**
   * Pay a fee online via payment gateway.
   * Creates order ' opens checkout ' verifies ' returns result.
   */
  static async payFeeOnline(
    schoolId: string,
    feeId: string,
    amount: number,
    studentName: string,
    feeType: string,
    email?: string,
    phone?: string
  ): Promise<PaymentResult> {
    return PaymentGatewayService.initiatePayment(schoolId, {
      amount,
      description: `${feeType} Fee " ${studentName}`,
      feeId,
      customerName: studentName,
      customerEmail: email,
      customerPhone: phone,
      notes: {
        feeType,
        studentName,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Subscription Payment Helper
  // ---------------------------------------------------------------------------

  /**
   * Pay for a subscription plan change via payment gateway.
   */
  static async payForSubscription(
    schoolId: string,
    plan: string,
    billingCycle: string,
    amount: number,
    schoolName: string,
    email?: string
  ): Promise<PaymentResult> {
    return PaymentGatewayService.initiatePayment(schoolId, {
      amount,
      description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan " ${billingCycle === 'yearly' ? 'Annual' : 'Monthly'} Subscription`,
      plan: plan as import('@/types').SubscriptionPlan,
      billingCycle: billingCycle as import('@/types').BillingCycle,
      customerName: schoolName,
      customerEmail: email,
      notes: {
        plan,
        billingCycle,
      },
    });
  }
}

// =============================================================================
// Demo Data Generator
// =============================================================================

function generateDemoPaymentHistory(): PaymentResult[] {
  const methods: PaymentMethod[] = ['card', 'upi', 'netbanking', 'wallet'];
  const descriptions = [
    'Tuition Fee " Rahul Sharma',
    'Transport Fee " Priya Patel',
    'Annual Fee " Amit Kumar',
    'Lab Fee " Sneha Gupta',
    'Pro Plan " Monthly Subscription',
    'Library Fee " Rohit Singh',
    'Exam Fee " Meera Joshi',
    'Sports Fee " Vikram Chauhan',
  ];

  return descriptions.map((desc, i) => ({
    success: i !== 3, // one failed payment for demo
    paymentId: `pay_demo_${1000 + i}`,
    orderId: `order_demo_${1000 + i}`,
    signature: `sig_demo_${i}`,
    method: methods[i % methods.length],
    amount: [5000, 3000, 15000, 2000, 5999, 1500, 2500, 4000][i],
    ...(i === 3 ? { error: 'Insufficient funds' } : {}),
  }));
}

