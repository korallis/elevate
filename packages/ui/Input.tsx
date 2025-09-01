import React from 'react';
import { cn } from './cn';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export function Input({ className, ...props }: InputProps) {
  const base =
    'flex h-10 w-full rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm placeholder:text-[color:var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]';
  return <input className={cn(base, className)} {...props} />;
}
