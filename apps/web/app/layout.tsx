import './globals.css';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import AuthNav from '@/components/auth-nav';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline">Home</Link>
              <Link href="/examples" className="hover:underline">Examples</Link>
              <Link href="/dashboard" className="hover:underline">Dashboard</Link>
              <Link href="/admin" className="hover:underline">Admin</Link>
            </nav>
            <div className="flex gap-4 items-center">
              <ThemeToggle />
              <AuthNav />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-4">{children}</div>
      </body>
    </html>
  );
}
