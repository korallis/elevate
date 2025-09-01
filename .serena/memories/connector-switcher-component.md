# ConnectorSwitcher Component Documentation

## Purpose

Rotating text display showing different data source connectors that Elev8 supports, creating dynamic visual interest on the landing page hero section.

## Location

`/apps/web/components/ConnectorSwitcher.tsx`

## Supported Connectors

- Snowflake Data Cloud
- Xero Accounting
- Microsoft SQL Server
- MySQL Database
- PostgreSQL Database
- Spendesk Finance
- Azure SQL Database
- Salesforce CRM
- Google BigQuery
- Amazon Redshift
- Databricks Lakehouse

## Animation Behavior

- Rotates through connectors every 3 seconds
- Smooth fade transition (300ms)
- Scale and blur effects during transition
- Icon rotates and scales with text change

## Critical Bug Fix (2025-08-29)

### The Problem

After the first rotation, a colored square would appear and overlay the text, making it unreadable. The text gradient effect was broken after initial display.

### Root Cause

Inline styles for gradient text clipping were not working properly:

```typescript
// BROKEN CODE
style={{
  background: currentConnector.gradient,  // Custom gradient per connector
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  textShadow: `0 0 40px ${currentConnector.color}`,
}}
```

The browser was not properly applying `background-clip: text`, causing the gradient background to display as a solid rectangle instead of being clipped to the text shape.

### The Solution

Replaced inline styles with Tailwind CSS classes that properly handle text gradients:

```typescript
// FIXED CODE
className={`
  inline-block transition-all duration-300 font-bold text-5xl sm:text-6xl lg:text-7xl xl:text-8xl
  bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent
  ${isAnimating ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}
`}
```

### Benefits of Fix

1. **Consistent gradient** - All connectors use same muted gradient matching design system
2. **Proper text clipping** - Tailwind's utilities work reliably
3. **Better performance** - No inline style calculations
4. **Dark theme harmony** - Muted colors instead of bright custom gradients

## Component Structure

```tsx
<div className="inline-flex items-center gap-2">
  <span className="gradient-text-with-animation">{currentConnector.displayName}</span>
  <span className="icon-with-rotation">{currentConnector.icon}</span>
</div>
```

## Usage

Simply import and place in JSX:

```tsx
import { ConnectorSwitcher } from '@/components/ConnectorSwitcher';

<h1>
  Turn your
  <ConnectorSwitcher />
  into insights
</h1>;
```

## Styling Classes Used

- `bg-gradient-to-r from-primary to-accent` - Gradient direction and colors
- `bg-clip-text` - Clips background to text shape
- `text-transparent` - Makes text fill transparent to show gradient
- Animation classes for transitions

## State Management

- `currentIndex` - Tracks which connector is displayed
- `isAnimating` - Controls transition effects
- Uses `setInterval` for automatic rotation
- Cleanup on unmount prevents memory leaks

## Best Practices

1. Always use Tailwind's gradient text utilities for reliability
2. Avoid inline styles for complex effects like text gradients
3. Keep animations subtle (opacity, scale, blur)
4. Ensure consistent colors across rotating elements
5. Test across browsers for gradient support

## Common Issues & Solutions

### Issue: Text gradient not working

**Solution**: Use Tailwind's `bg-clip-text text-transparent` combo

### Issue: Animation janky

**Solution**: Use CSS transforms with `transition-all duration-300`

### Issue: Memory leak from interval

**Solution**: Clear interval in useEffect cleanup

### Issue: Gradient too bright

**Solution**: Use muted design system colors (50-60% saturation)

This component is a critical part of the hero section's visual appeal and must maintain smooth animations while staying consistent with the overall design system.
