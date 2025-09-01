import Link from 'next/link';
import { getSession } from '@/lib/session';

export default async function AuthNav() {
  const session = await getSession();
  const loggedIn = !!session.userId;
  return (
    <div className="flex items-center gap-3 text-sm">
      {loggedIn ? (
        <form action="/api/auth/logout" method="POST">
          <button className="underline" type="submit" aria-label="Logout">Logout</button>
        </form>
      ) : (
        <>
          <Link className="underline" href="/login">Login</Link>
          <Link className="underline" href="/signup">Sign up</Link>
        </>
      )}
    </div>
  );
}

