'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label } from 'ui';
import { api } from '../../lib/api';

interface PasswordStrength {
  score: number;
  feedback: string[];
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    token: searchParams.get('token') || '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    feedback: [],
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Check password strength when password changes
  useEffect(() => {
    if (formData.password) {
      checkPasswordStrength();
    } else {
      setPasswordStrength({ score: 0, feedback: [] });
    }
  }, [formData.password]);

  const checkPasswordStrength = async () => {
    try {
      const strength = await api.checkPasswordStrength(formData.password);
      setPasswordStrength(strength);
    } catch (error) {
      console.error('Password strength check failed:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.token.trim()) {
      newErrors.token = 'Reset token is required';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
      await api.resetPassword(formData.token, formData.password, formData.confirmPassword);
      setIsSuccess(true);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Password reset failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrengthColor = (score: number): string => {
    if (score >= 5) return 'bg-green-500';
    if (score >= 3) return 'bg-yellow-500';
    if (score >= 1) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getPasswordStrengthText = (score: number): string => {
    if (score >= 5) return 'Strong';
    if (score >= 3) return 'Good';
    if (score >= 1) return 'Weak';
    return 'Very weak';
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
            <h1 className="text-2xl font-semibold">Password reset successful</h1>
            <p className="text-[color:var(--muted)] mt-2">
              Your password has been successfully reset. You can now log in with your new password.
            </p>
          </div>

          <div className="text-center">
            <Button onClick={() => router.push('/login')} className="w-full">
              Continue to login
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10">
      <div className="max-w-md mx-auto glass rounded-2xl p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="text-[color:var(--muted)] mt-2">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.submit && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="token">Reset token</Label>
            <Input
              id="token"
              name="token"
              type="text"
              placeholder="Enter the reset token from your email"
              value={formData.token}
              onChange={handleInputChange}
              className={errors.token ? 'border-red-500 focus:ring-red-500' : ''}
            />
            {errors.token && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.token}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Create a new password"
              value={formData.password}
              onChange={handleInputChange}
              className={errors.password ? 'border-red-500 focus:ring-red-500' : ''}
            />
            {errors.password && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.password}</p>
            )}

            {formData.password && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[color:var(--muted)]">Password strength</span>
                  <span
                    className={`font-medium ${
                      passwordStrength.score >= 3 ? 'text-green-600' : 'text-orange-600'
                    }`}
                  >
                    {getPasswordStrengthText(passwordStrength.score)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor(passwordStrength.score)}`}
                    style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                  />
                </div>
                {passwordStrength.feedback.length > 0 && (
                  <ul className="mt-2 text-xs text-[color:var(--muted)] space-y-1">
                    {passwordStrength.feedback.map((item, index) => (
                      <li key={index} className="flex items-center">
                        <span className="w-1 h-1 bg-[color:var(--muted)] rounded-full mr-2" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Confirm your new password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              className={errors.confirmPassword ? 'border-red-500 focus:ring-red-500' : ''}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Resetting password...' : 'Reset password'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
