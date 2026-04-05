'use client';

import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { useEffect, useRef, useCallback } from 'react';
import Button from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const styles = {
    danger:  { bg: 'bg-red-50', text: 'text-red-500', Icon: XCircle },
    warning: { bg: 'bg-amber-50', text: 'text-amber-500', Icon: AlertTriangle },
    info:    { bg: 'bg-blue-50', text: 'text-blue-600', Icon: Info },
  };

  const { bg, text, Icon } = styles[type];

  return (
    <ConfirmDialogInner
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      message={message}
      confirmText={confirmText}
      cancelText={cancelText}
      type={type}
      isLoading={isLoading}
      bg={bg}
      text={text}
      Icon={Icon}
    />
  );
}

function ConfirmDialogInner({
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  type,
  isLoading,
  bg,
  text,
  Icon,
}: {
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  type: 'danger' | 'warning' | 'info';
  isLoading: boolean;
  bg: string;
  text: string;
  Icon: typeof XCircle;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Auto-focus cancel button
    const timer = setTimeout(() => {
      const btn = panelRef.current?.querySelector<HTMLElement>('button');
      btn?.focus();
    }, 50);
    return () => { document.removeEventListener('keydown', handleKeyDown); clearTimeout(timer); };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px] animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Panel */}
        <div ref={panelRef} className="relative inline-block w-full max-w-md my-8 overflow-hidden text-left align-middle bg-white rounded-xl border border-slate-200 animate-scale-in" style={{ boxShadow: 'var(--shadow-elevated)' }}>
          {/* Icon */}
          <div className="px-6 pt-6">
            <div className={`w-10 h-10 rounded-lg ${bg} ${text} flex items-center justify-center`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            <h3 id="confirm-title" className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
            <p id="confirm-message" className="text-sm text-slate-500 leading-relaxed">{message}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-200">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
              {cancelText}
            </Button>
            <Button variant={type === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm} isLoading={isLoading}>
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
