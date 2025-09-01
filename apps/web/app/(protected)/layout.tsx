export const runtime = 'nodejs';
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect('/login');
  }
  return <>{children}</>;
}
