# Elev8 Design System Implementation

## Core Design System Location

`/apps/web/components/ui/design-system.tsx`

## Design Tokens

### Spacing System (8px Grid)

- space-1: 8px (0.5rem)
- space-2: 16px (1rem)
- space-3: 24px (1.5rem)
- space-4: 32px (2rem)
- space-5: 40px (2.5rem)
- space-6: 48px (3rem)
- space-7: 56px (3.5rem)
- space-8: 64px (4rem)
- space-9: 72px (4.5rem)
- space-10: 80px (5rem)
- space-11: 88px (5.5rem)
- space-12: 96px (6rem)

### Button Sizes (Standardized)

```typescript
const buttonSizes = {
  sm: 'h-9 px-3 text-sm', // 36px height, 12px padding
  md: 'h-11 px-6 text-base', // 44px height, 24px padding
  lg: 'h-14 px-8 text-lg', // 56px height, 32px padding
  'icon-sm': 'h-9 w-9', // 36x36px square
  'icon-md': 'h-11 w-11', // 44x44px square
  'icon-lg': 'h-14 w-14', // 56x56px square
};
```

### Button Variants

- **primary**: Gradient background with glow effect
- **secondary**: Glass morphism with subtle backdrop
- **ghost**: Minimal with hover background
- **outline**: Border only, transparent background
- **destructive**: Red/danger styling
- **link**: Text only, underline on hover

### Card Variants

```typescript
const cardVariants = {
  default: 'glass-card', // Basic glass morphism
  premium: 'glass-card-premium', // Enhanced with gradient overlay
  elevated: 'elevated hover effects', // Strong shadows
  minimal: 'subtle borders', // Clean, content-focused
};
```

### Typography Scale

- **Display**: display-2xl, display-xl, display-lg, display-md, display-sm
- **Heading**: heading-xl, heading-lg, heading-md, heading-sm
- **Body**: body-lg, body-md, body-sm, body-xs
- **Label**: label-md, label-sm, caption

## Component Usage Patterns

### Navigation

```tsx
// Header navigation
<Button size="sm" variant="ghost">Catalog</Button>

// Header CTAs
<Button size="md" variant="secondary">Login</Button>
<Button size="md" variant="primary">Get Started</Button>
```

### Hero Section

```tsx
// Primary CTAs
<Button size="lg" variant="primary">Start Free Trial</Button>
<Button size="lg" variant="secondary">Watch Demo</Button>
```

### Cards

```tsx
// Problem/Solution cards
<Card variant="elevated" padding="lg">
  <CardContent>...</CardContent>
</Card>

// Feature cards
<Card variant="default" padding="md">
  <CardContent>...</CardContent>
</Card>

// Premium sections (ROI Calculator)
<Card variant="premium" padding="xl">
  <CardContent>...</CardContent>
</Card>
```

### Forms

```tsx
// Input fields
<Input variant="default" size="md" />

// Form buttons
<Button size="md" variant="primary" type="submit">
  Submit
</Button>
```

## Implementation Files

### Core Components

- `/apps/web/components/ui/design-system.tsx` - All design system components
- `/apps/web/lib/utils.ts` - Utility functions (cn, formatters)

### Applied To

- `/apps/web/app/page.tsx` - Landing page with full design system
- `/apps/web/components/AppShell.tsx` - Navigation and layout
- `/apps/web/app/design-system-demo/page.tsx` - Component showcase

## Dependencies

```json
{
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "class-variance-authority": "^0.7.1",
  "@radix-ui/react-slot": "^1.1.1"
}
```

## Design Principles

1. **Consistency First**: All similar elements use same component with same props
2. **8px Grid**: All spacing follows the 8px increment system
3. **Hierarchy Through Size**: sm < md < lg for visual importance
4. **Variant Purpose**:
   - primary: Main actions
   - secondary: Supporting actions
   - ghost: Tertiary/navigation
   - outline: Alternative actions
5. **Glass Morphism**: Consistent backdrop-blur and opacity patterns
6. **Responsive Scaling**: Components adapt size on mobile vs desktop

## Quality Checklist

- ✅ TypeScript strict mode compliance
- ✅ No `any` types
- ✅ Accessibility (focus states, ARIA)
- ✅ Responsive design
- ✅ Consistent hover/active states
- ✅ Performance optimized
- ✅ Cross-browser tested
