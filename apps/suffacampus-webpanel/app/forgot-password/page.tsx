'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthService } from '@/services/authService';
import { GraduationCap, Mail, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const validate = (value: string) => {
    if (!value) {
      setError('Email is required');
      return false;
    } else if (!/\S+@\S+\.\S+/.test(value)) {
      setError('Please enter a valid email');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isLoading || cooldownSeconds > 0) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== email) {
      setEmail(normalizedEmail);
    }

    if (!validate(normalizedEmail)) return;

    setIsLoading(true);

    try {
      await AuthService.resetPassword(normalizedEmail);
    } catch {
      // Intentionally ignore to avoid exposing account existence.
    }

    setEmailSent(true);
    setCooldownSeconds(30);
    toast.success('If an account exists, a reset link will be sent shortly.');

    setIsLoading(false);
  };

  return (
    <div className="h-screen flex bg-[linear-gradient(135deg,#e8ecf1_0%,#dfe4ea_25%,#d6dce5_50%,#cdd4df_75%,#c4ccd9_100%)] overflow-hidden">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-10 relative">
        {/* Subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />

        {/* Refined decorative gradient orbs */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-blue-100/30 via-blue-50/20 to-transparent rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-slate-200/40 via-slate-100/20 to-transparent rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gradient-to-r from-violet-50/20 to-blue-50/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

        {/* Content */}
        <div className="relative z-10 max-w-md text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <div className="w-16 h-16 bg-gradient-to-br from-[#5B6BE6] to-[#4f5fd9] rounded-2xl flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(91,107,230,0.35)] transition-transform duration-300 hover:scale-105 hover:shadow-[0_12px_32px_-4px_rgba(91,107,230,0.4)]">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <span className="text-[2rem] font-semibold text-slate-800 tracking-[-0.02em]">SuffaCampus</span>
          </div>

          {/* Headline */}
          <h1 className="text-[2.5rem] lg:text-[2.875rem] font-semibold text-slate-800 leading-[1.15] mb-4 tracking-[-0.025em]">
            Reset Your Password<br />
            <span className="bg-gradient-to-r from-[#5B6BE6] to-[#7C8AEF] bg-clip-text text-transparent">Securely</span>
          </h1>

          {/* Subtitle */}
          <p className="text-slate-400 text-base leading-relaxed max-w-[320px] mx-auto font-normal">
            Enter your email and we&apos;ll send you instructions to reset your password.
          </p>
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-slate-500 text-[13px] font-medium tracking-wide opacity-80">Â© 2026 SuffaCampus</p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 lg:w-1/2 flex items-center justify-center px-6 py-8 relative">
        {/* Subtle ambient glow */}
        <div className="absolute top-1/4 right-1/3 w-[400px] h-[400px] bg-blue-100/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-slate-200/30 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-[520px] relative z-10">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-center gap-3.5 mb-10">
            <div className="w-12 h-12 bg-gradient-to-br from-[#5B6BE6] to-[#4f5fd9] rounded-xl flex items-center justify-center shadow-[0_4px_12px_rgba(91,107,230,0.3)]">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-semibold text-slate-800 tracking-[-0.01em]">SuffaCampus</span>
          </div>

          {/* Form Card */}
          <div className="bg-white/60 backdrop-blur-md rounded-2xl p-8 lg:p-12 shadow-[0_0_0_1px_rgba(255,255,255,0.7),0_2px_4px_rgba(0,0,0,0.03),0_12px_24px_rgba(0,0,0,0.04)] relative border border-white/80">
            {/* Back Button */}
            <Link 
              href="/login" 
              className="inline-flex items-center gap-2 text-[14px] text-slate-600 hover:text-slate-900 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>

            {!emailSent ? (
              <>
                <h2 className="text-[1.75rem] font-semibold text-slate-900 mb-1.5 tracking-[-0.02em]">Forgot password?</h2>
                <p className="text-slate-400 text-[15px] mb-8">No worries, we&apos;ll send you reset instructions.</p>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Email */}
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-[15px] font-medium text-slate-700 ml-1 cursor-pointer">
                      Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="w-5 h-5 text-slate-400" />
                      </div>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        disabled={isLoading}
                        style={{ caretColor: '#000000', color: '#1e293b' }}
                        className={`block w-full h-[52px] pl-12 pr-4 bg-slate-200 border-2 ${error
                          ? 'border-red-400'
                          : 'border-slate-300 hover:border-slate-400 focus:border-[#5B6BE6]'
                          } rounded-xl placeholder:text-slate-400 outline-none disabled:bg-slate-200 disabled:cursor-not-allowed`}
                      />
                    </div>
                    {error && (
                      <p className="text-red-500 text-[13px] flex items-center gap-1.5 font-medium mt-1.5 ml-1">
                        {error}
                      </p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isLoading || cooldownSeconds > 0}
                    className="w-full h-[56px] bg-[#5B6BE6] hover:bg-[#4f5fd9] text-white text-[16px] font-semibold rounded-xl transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_4px_12px_rgba(91,107,230,0.2)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.05),0_8px_24px_rgba(91,107,230,0.25)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 mt-2"
                  >
                    {isLoading ? (
                      <span className="inline-flex items-center gap-2.5">
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending...
                      </span>
                    ) : cooldownSeconds > 0 ? (
                      `Try again in ${cooldownSeconds}s`
                    ) : (
                      'Reset password'
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-[1.75rem] font-semibold text-slate-900 mb-2">Check your email</h2>
                <p className="text-slate-600 text-[15px] mb-6">
                  If an account exists for<br />
                  <span className="font-medium text-slate-800">{email}</span>
                  , you&apos;ll receive a reset link shortly.
                </p>
                <Link 
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 h-[52px] px-6 bg-[#5B6BE6] hover:bg-[#4f5fd9] text-white text-[15px] font-semibold rounded-xl transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Footer */}
          <p className="lg:hidden text-center text-slate-500 text-xs font-medium mt-6 opacity-80">
            Â© 2026 SuffaCampus
          </p>
        </div>
      </div>
    </div>
  );
}

