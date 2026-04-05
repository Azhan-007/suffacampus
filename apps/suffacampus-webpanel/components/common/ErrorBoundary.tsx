'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback component. If not provided, uses the default error UI. */
  fallback?: ReactNode;
  /** Optional label for error context (e.g. "Dashboard", "Students table") */
  context?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

/**
 * React Error Boundary — catches render errors in child components
 * and shows a recovery UI instead of crashing the entire page.
 *
 * Usage:
 *   <ErrorBoundary context="Dashboard">
 *     <DashboardContent />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console (and Sentry if available)
    console.error(
      `[ErrorBoundary${this.props.context ? ` — ${this.props.context}` : ''}]`,
      error,
      errorInfo.componentStack
    );
    this.setState({ errorInfo: errorInfo.componentStack ?? '' });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[300px] p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-500 mb-1">
              {this.props.context
                ? `An error occurred in the ${this.props.context} module.`
                : 'An unexpected error occurred while rendering this section.'}
            </p>
            {this.state.error && (
              <p className="text-xs text-red-500 font-mono bg-red-50 rounded-lg px-3 py-2 mb-4 break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                Dashboard
              </a>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-slate-400 cursor-pointer flex items-center gap-1">
                  <Bug className="w-3 h-3" /> Component Stack
                </summary>
                <pre className="mt-2 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-3 overflow-auto max-h-40 font-mono whitespace-pre-wrap">
                  {this.state.errorInfo}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
