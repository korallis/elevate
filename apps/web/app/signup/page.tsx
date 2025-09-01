"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Signup failed');
      return;
    }
    router.push('/dashboard');
  };

  return (
    <main className="p-6 max-w-md mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Sign Up</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-1">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-md border px-3 bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-md border px-3 bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit">Create Account</Button>
        </div>
      </form>
      <p className="text-sm">
        Have an account? <a className="underline" href="/login">Log in</a>
      </p>
    </main>
  );
}

