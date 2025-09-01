import React from 'react';
import { cn } from './cn';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  asChild?: boolean;
};

export function Button({
  className,
  variant = 'primary',
  asChild,
  children,
  ...props
}: ButtonProps & { children?: React.ReactNode }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    primary:
      'bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 border border-transparent',
    secondary:
      'bg-transparent border border-[color:var(--border)] text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/10',
    ghost: 'bg-transparent text-[var(--fg)] hover:bg-black/5 dark:hover:bg-white/10',
  };
  const classes = cn(base, variants[variant], className);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, {
      className: cn(classes, (children as any).props?.className),
    });
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
