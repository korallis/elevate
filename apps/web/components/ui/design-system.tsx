'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ============================================================================
// DESIGN SYSTEM FOUNDATION
// ============================================================================

/**
 * 8px Grid-Based Spacing Scale
 * Following the 8px grid system for consistent spacing across components
 */
export const spacing = {
  'space-1': '0.5rem', // 8px
  'space-2': '1rem', // 16px
  'space-3': '1.5rem', // 24px
  'space-4': '2rem', // 32px
  'space-5': '2.5rem', // 40px
  'space-6': '3rem', // 48px
  'space-7': '3.5rem', // 56px
  'space-8': '4rem', // 64px
  'space-9': '4.5rem', // 72px
  'space-10': '5rem', // 80px
  'space-11': '5.5rem', // 88px
  'space-12': '6rem', // 96px
} as const;

/**
 * Typography Scale with Consistent Line Heights
 * Following modern typography principles with proper vertical rhythm
 */
export const typography = {
  // Display fonts for headlines
  'display-sm': 'text-3xl font-display font-bold leading-9', // 30px / 36px
  'display-md': 'text-4xl font-display font-bold leading-10', // 36px / 40px
  'display-lg': 'text-5xl font-display font-bold leading-none', // 48px / 48px
  'display-xl': 'text-6xl font-display font-bold leading-none', // 60px / 60px
  'display-2xl': 'text-7xl font-display font-bold leading-none', // 72px / 72px

  // Headings
  'heading-sm': 'text-lg font-semibold leading-7', // 18px / 28px
  'heading-md': 'text-xl font-semibold leading-8', // 20px / 32px
  'heading-lg': 'text-2xl font-semibold leading-9', // 24px / 36px
  'heading-xl': 'text-3xl font-semibold leading-10', // 30px / 40px

  // Body text
  'body-xs': 'text-xs leading-5', // 12px / 20px
  'body-sm': 'text-sm leading-6', // 14px / 24px
  'body-md': 'text-base leading-7', // 16px / 28px
  'body-lg': 'text-lg leading-8', // 18px / 32px

  // Labels and captions
  'label-sm': 'text-xs font-medium leading-5', // 12px / 20px
  'label-md': 'text-sm font-medium leading-6', // 14px / 24px
  caption: 'text-xs leading-5 text-foreground-muted', // 12px / 20px
} as const;

// ============================================================================
// BUTTON COMPONENT SYSTEM
// ============================================================================

const buttonVariants = cva(
  // Base button styles with clean design principles
  [
    'inline-flex items-center justify-center rounded-xl font-medium',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'relative',
  ],
  {
    variants: {
      variant: {
        // Primary: Clean solid color
        primary: ['text-white font-semibold', 'bg-[hsl(252,60%,60%)]', 'hover:opacity-90'],

        // Secondary: Clean border design
        secondary: [
          'text-foreground font-medium',
          'bg-card/50 border border-card-border backdrop-blur-sm',
          'hover:bg-card-hover hover:border-card-border/50',
        ],

        // Ghost: Minimal design for subtle actions
        ghost: ['text-foreground-muted font-medium', 'hover:bg-card/30 hover:text-foreground'],

        // Outline: Clean border design
        outline: [
          'text-foreground font-medium border border-border',
          'hover:bg-card/20 hover:border-primary/30',
          'hover:text-primary',
        ],

        // Destructive: For dangerous actions
        destructive: ['text-white font-semibold', 'bg-destructive hover:opacity-90'],

        // Link: Text-only button
        link: ['text-primary font-medium underline-offset-4', 'hover:underline hover:opacity-80'],
      },
      size: {
        // Small: Compact for tight spaces
        sm: 'min-h-[36px] px-4 py-2 text-sm rounded-lg',

        // Medium: Standard size (default)
        md: 'min-h-[44px] px-6 py-2.5 text-base rounded-xl',

        // Large: Prominent CTAs
        lg: 'min-h-[56px] px-8 py-3.5 text-lg rounded-xl',

        // Icon only variants
        'icon-sm': 'h-9 w-9 p-0 rounded-lg',
        'icon-md': 'h-11 w-11 p-0 rounded-xl',
        'icon-lg': 'h-14 w-14 p-0 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

// ============================================================================
// CARD COMPONENT SYSTEM
// ============================================================================

const cardVariants = cva(
  ['rounded-2xl overflow-hidden transition-all duration-300', 'border backdrop-blur-sm'],
  {
    variants: {
      variant: {
        // Default: Subtle glass morphism
        default: [
          'bg-card/50 border-card-border',
          'hover:bg-card-hover hover:border-card-border/70',
          'shadow-sm hover:shadow-md',
        ],

        // Premium: Clean glass with subtle effects
        premium: [
          'bg-card/60 border-card-border/50',
          'backdrop-blur-lg shadow-md',
          'hover:shadow-lg hover:border-primary/20',
          'relative',
        ],

        // Elevated: Clean shadow and border
        elevated: [
          'bg-card border-card-border shadow-md',
          'hover:shadow-lg hover:border-primary/20',
        ],

        // Minimal: Clean and simple
        minimal: ['bg-background border-border/50', 'hover:border-border'],
      },
      padding: {
        none: 'p-0',
        sm: 'p-4', // 16px - space-2
        md: 'p-6', // 24px - space-3
        lg: 'p-8', // 32px - space-4
        xl: 'p-12', // 48px - space-6
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(cardVariants({ variant, padding, className }))} {...props}>
        {variant === 'premium' && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        )}
        <div className="relative z-10">{children}</div>
      </div>
    );
  },
);
Card.displayName = 'Card';

// ============================================================================
// INPUT COMPONENT SYSTEM
// ============================================================================

const inputVariants = cva(
  [
    'flex w-full rounded-lg border px-3 py-2 text-base',
    'bg-background/50 backdrop-blur-sm',
    'transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'placeholder:text-foreground-muted',
  ],
  {
    variants: {
      variant: {
        default: ['border-border hover:border-border/70', 'focus-visible:border-primary/50'],
        ghost: ['border-transparent bg-card/30', 'hover:bg-card/50 focus-visible:bg-card/70'],
      },
      size: {
        sm: 'h-9 px-3 text-sm rounded-md',
        md: 'h-11 px-4 text-base rounded-lg',
        lg: 'h-14 px-6 text-lg rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

// ============================================================================
// BADGE COMPONENT SYSTEM
// ============================================================================

const badgeVariants = cva(
  [
    'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
    'transition-all duration-200',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary border border-primary/20',
        secondary: 'bg-card text-foreground border border-card-border',
        success: 'bg-success/15 text-success border border-success/20',
        warning: 'bg-warning/15 text-warning border border-warning/20',
        destructive: 'bg-destructive/15 text-destructive border border-destructive/20',
        outline: 'text-foreground border border-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ============================================================================
// LAYOUT COMPONENTS
// ============================================================================

/**
 * Container: Responsive container with consistent max-width and padding
 */
const Container = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  }
>(({ className, size = 'xl', ...props }, ref) => {
  const containerSizes = {
    sm: 'max-w-2xl', // 672px
    md: 'max-w-4xl', // 896px
    lg: 'max-w-6xl', // 1152px
    xl: 'max-w-7xl', // 1280px
    full: 'max-w-none',
  };

  return (
    <div
      ref={ref}
      className={cn('mx-auto px-6 lg:px-8', containerSizes[size], className)}
      {...props}
    />
  );
});
Container.displayName = 'Container';

/**
 * Section: Consistent section spacing following 8px grid
 */
const Section = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & {
    spacing?: 'sm' | 'md' | 'lg' | 'xl';
  }
>(({ className, spacing = 'lg', ...props }, ref) => {
  const spacingClasses = {
    sm: 'py-16 lg:py-20', // 64px-80px
    md: 'py-20 lg:py-24', // 80px-96px
    lg: 'py-24 lg:py-32', // 96px-128px
    xl: 'py-32 lg:py-40', // 128px-160px
  };

  return <section ref={ref} className={cn(spacingClasses[spacing], className)} {...props} />;
});
Section.displayName = 'Section';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Responsive breakpoint utility
 */
export const breakpoints = {
  xs: '(min-width: 475px)',
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export {
  Button,
  buttonVariants,
  Card,
  cardVariants,
  Input,
  inputVariants,
  Badge,
  badgeVariants,
  Container,
  Section,
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Button Examples:
 *
 * <Button variant="primary" size="lg">Get Started</Button>
 * <Button variant="secondary" size="md">Learn More</Button>
 * <Button variant="ghost" size="sm">Cancel</Button>
 * <Button variant="outline">Contact Us</Button>
 * <Button variant="destructive">Delete</Button>
 */

/**
 * Card Examples:
 *
 * <Card variant="default" padding="md">Basic card content</Card>
 * <Card variant="premium" padding="lg">Premium feature card</Card>
 * <Card variant="elevated" padding="sm">Elevated card</Card>
 * <Card variant="minimal" padding="none">Minimal styling</Card>
 */

/**
 * Layout Examples:
 *
 * <Container size="lg">
 *   <Section spacing="xl">
 *     <h1 className={typography['display-lg']}>Page Title</h1>
 *     <p className={typography['body-lg']}>Description text</p>
 *   </Section>
 * </Container>
 */
