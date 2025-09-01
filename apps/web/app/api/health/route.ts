import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'web', version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0' });
}
