'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Input, Label } from 'ui';
import { api } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [resetToken, setResetToken] = useState<string>('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);

    // Clear error when user starts typing
    if (errors.email) {
      setErrors((prev) => ({ ...prev, email: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.forgotPassword(email);
      setIsSuccess(true);
      // In development, show the reset token for testing
      if (response.resetToken) {
        setResetToken(response.resetToken);
      }
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to send reset email' });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <section className="py-10">
        <div className="max-w-md mx-auto glass rounded-2xl p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold">Check your email</h1>
            <p className="text-[color:var(--muted)] mt-2">
              We've sent password reset instructions to {email}
            </p>
          </div>

          <div className="text-center space-y-4">
            <p className="text-sm text-[color:var(--muted)]">
              Didn't receive the email? Check your spam folder, or{' '}
              <button
                onClick={() => {
                  setIsSuccess(false);
                  setEmail('');
                  setErrors({});
                }}
                className="text-[var(--primary)] hover:underline"
              >
                try again
              </button>
            </p>

            {resetToken && (
              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                  <strong>Development Mode:</strong> Use this token to reset your password:
                </p>
                <code className="text-xs font-mono bg-yellow-100 dark:bg-yellow-800 px-2 py-1 rounded break-all">
                  {resetToken}
                </code>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                  Copy this token and use it on the{' '}
                  <Link href="/reset-password" className="underline">
                    password reset page
                  </Link>
                </p>
              </div>
            )}

            <div className="pt-4">
              <Link href="/login">
                <Button variant="secondary" className="w-full">
                  Back to login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10">
      <div className="max-w-md mx-auto glass rounded-2xl p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold">Forgot password?</h1>
          <p className="text-[color:var(--muted)] mt-2">
            No worries, we'll send you reset instructions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.submit && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={handleInputChange}
              className={errors.email ? 'border-red-500 focus:ring-red-500' : ''}
            />
            {errors.email && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.email}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Reset password'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
            ← Back to login
          </Link>
        </div>
      </div>
    </section>
  );
}
