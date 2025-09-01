import './globals.css';
import { AppShell } from '@/components/AppShell';
import { RBACProvider } from '@/lib/rbac';
import { ToastProvider } from '@/components/ui/feedback';
import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';

export const metadata: Metadata = {
  title: 'SME Analytics – Elegant AI Analytics',
  description:
    'Snowflake‑first analytics. Discover your catalog, generate insights, and ship dashboards fast with an AI‑assisted semantic layer.',
  icons: {
    icon: [
      { url: '/icon', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'SME Analytics',
    description:
      'Elegant, ultra‑modern analytics for ambitious teams. Snowflake‑first with governance built‑in.',
    images: ['/opengraph-image.svg'],
    type: 'website',
  },
};

export const viewport = {
  themeColor: '#0A0A10',
};

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const display = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-display' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${display.variable}`}>
        <RBACProvider>
          <AppShell>{children}</AppShell>
          <ToastProvider />
        </RBACProvider>
      </body>
    </html>
  );
}
