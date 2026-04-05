'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { PaymentGatewayService } from '@/services/paymentGatewayService';
import { PaymentResult } from '@/types';
import { formatCurrency } from '@/lib/designTokens';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  Smartphone,
  Landmark,
  Wallet,
  AlertTriangle,
  Receipt,
  Copy,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

// =============================================================================
// Types
// =============================================================================

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: string;
  amount: number;
  description: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  /** Optional fee ID — when paying a fee */
  feeId?: string;
  /** Optional plan + billing — when paying for a subscription */
  plan?: string;
  billingCycle?: string;
  /** Callback on successful payment */
  onSuccess?: (result: PaymentResult) => void;
  /** Callback on payment failure */
  onFailure?: (result: PaymentResult) => void;
}

type PaymentStage = 'confirm' | 'processing' | 'success' | 'failure';

const methodIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  card: CreditCard,
  upi: Smartphone,
  netbanking: Landmark,
  wallet: Wallet,
};

// =============================================================================
// Component
// =============================================================================

export default function PaymentModal({
  isOpen,
  onClose,
  schoolId,
  amount,
  description,
  customerName,
  customerEmail,
  customerPhone,
  feeId,
  plan,
  billingCycle,
  onSuccess,
  onFailure,
}: PaymentModalProps) {
  const [stage, setStage] = useState<PaymentStage>('confirm');
  const [result, setResult] = useState<PaymentResult | null>(null);
  const isSandbox = PaymentGatewayService.isSandboxMode();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStage('confirm');
      setResult(null);
    }
  }, [isOpen]);

  const handlePay = async () => {
    setStage('processing');

    try {
      let paymentResult: PaymentResult;

      if (feeId) {
        // Fee payment
        paymentResult = await PaymentGatewayService.payFeeOnline(
          schoolId,
          feeId,
          amount,
          customerName,
          description,
          customerEmail,
          customerPhone
        );
      } else if (plan && billingCycle) {
        // Subscription payment
        paymentResult = await PaymentGatewayService.payForSubscription(
          schoolId,
          plan,
          billingCycle,
          amount,
          customerName,
          customerEmail
        );
      } else {
        // Generic payment
        paymentResult = await PaymentGatewayService.initiatePayment(schoolId, {
          amount,
          description,
          customerName,
          customerEmail,
          customerPhone,
        });
      }

      setResult(paymentResult);

      if (paymentResult.success) {
        setStage('success');
        onSuccess?.(paymentResult);
      } else {
        setStage('failure');
        onFailure?.(paymentResult);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Payment failed';
      const failResult: PaymentResult = {
        success: false,
        error: errorMsg,
        amount,
      };
      setResult(failResult);
      setStage('failure');
      onFailure?.(failResult);
    }
  };

  const handleCopyId = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleClose = () => {
    if (stage === 'processing') return; // Don't close during processing
    onClose();
  };

  const MethodIcon = result?.method ? methodIcons[result.method] || CreditCard : CreditCard;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Payment" size="md">
      <div className="p-5">
        {/* ── Confirm Stage ─────────────────────────────────────────── */}
        {stage === 'confirm' && (
          <div className="space-y-5">
            {/* Sandbox Badge */}
            {isSandbox && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Sandbox Mode</span> — No real charges will be applied. This is a simulated payment.
                </p>
              </div>
            )}

            {/* Amount Card */}
            <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
              <p className="text-sm text-slate-500 mb-1">Total Amount</p>
              <p className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {formatCurrency(amount)}
              </p>
              <p className="text-sm text-slate-500 mt-2">{description}</p>
            </div>

            {/* Payment Details */}
            <div className="space-y-2">
              <DetailRow label="Customer" value={customerName} />
              {customerEmail && <DetailRow label="Email" value={customerEmail} />}
              {plan && (
                <DetailRow
                  label="Plan"
                  value={`${plan.charAt(0).toUpperCase() + plan.slice(1)} — ${billingCycle === 'yearly' ? 'Annual' : 'Monthly'}`}
                />
              )}
              {feeId && <DetailRow label="Fee ID" value={feeId} mono />}
              <DetailRow label="Gateway" value={isSandbox ? 'Sandbox (Demo)' : 'Razorpay'} />
            </div>

            {/* Security Note */}
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
              <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-emerald-700">
                Payments are secured with 256-bit encryption via Razorpay. Your payment details are never stored on our servers.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handlePay}>
                <CreditCard className="w-4 h-4" />
                <span>Pay {formatCurrency(amount)}</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── Processing Stage ──────────────────────────────────────── */}
        {stage === 'processing' && (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-blue-50 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Processing Payment</h3>
              <p className="text-sm text-slate-500 mt-1">
                {isSandbox
                  ? 'Simulating payment in sandbox mode...'
                  : 'Please complete the payment in the Razorpay window...'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Do not close this window or refresh the page.
            </p>
          </div>
        )}

        {/* ── Success Stage ─────────────────────────────────────────── */}
        {stage === 'success' && result && (
          <div className="space-y-5">
            {/* Success Icon */}
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">Payment Successful</h3>
              <p className="text-sm text-slate-500 mt-1">
                {formatCurrency(amount)} has been paid successfully.
              </p>
            </div>

            {/* Receipt Details */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="w-4 h-4 text-slate-500" />
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Payment Receipt
                </h4>
              </div>

              {result.paymentId && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Payment ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-slate-700">{result.paymentId}</span>
                    <button
                      onClick={() => handleCopyId(result.paymentId!)}
                      className="p-1 rounded hover:bg-slate-200 transition-colors"
                    >
                      <Copy className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                </div>
              )}

              {result.orderId && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Order ID</span>
                  <span className="text-xs font-mono text-slate-700">{result.orderId}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Amount</span>
                <span className="text-xs font-semibold text-slate-700">
                  {formatCurrency(amount)}
                </span>
              </div>

              {result.method && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Method</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-700 capitalize">
                    <MethodIcon className="w-3.5 h-3.5" />
                    {result.method}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Status</span>
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  PAID
                </span>
              </div>

              {isSandbox && (
                <div className="pt-2 mt-2 border-t border-slate-200">
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Sandbox payment — not a real transaction
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* ── Failure Stage ─────────────────────────────────────────── */}
        {stage === 'failure' && result && (
          <div className="space-y-5">
            {/* Failure Icon */}
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-red-50 rounded-2xl flex items-center justify-center mb-3">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">Payment Failed</h3>
              <p className="text-sm text-slate-500 mt-1">
                {result.error || 'An unexpected error occurred.'}
              </p>
            </div>

            {/* Error Details */}
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 space-y-1">
                  <p className="font-medium">What you can do:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Check your payment details and try again</li>
                    <li>Use a different payment method</li>
                    <li>Contact your bank if the issue persists</li>
                    <li>Reach out to our support team for help</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setStage('confirm');
                  setResult(null);
                }}
              >
                <ExternalLink className="w-4 h-4" />
                <span>Try Again</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`text-xs font-medium text-slate-700 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
