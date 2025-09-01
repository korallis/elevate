import React from 'react';
import { cn } from './cn';

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;
export function Label({ className, ...props }: LabelProps) {
  const base = 'text-sm font-medium text-[color:var(--muted)]';
  return <label className={cn(base, className)} {...props} />;
}
