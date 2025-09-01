# Tailwind CSS v4 Setup and Configuration (2025)

## Key Changes from v3 to v4

- **CSS-first configuration**: Configure directly in CSS files, not JS
- **No more @tailwind directives**: Use `@import "tailwindcss"` instead
- **Automatic content detection**: No need for content paths in config
- **Native CSS variables**: All design tokens exposed as CSS variables
- **PostCSS plugin**: Use `@tailwindcss/postcss` instead of `tailwindcss`

## Installation for Next.js 15 with pnpm

```bash
pnpm add tailwindcss @tailwindcss/postcss --filter @sme/web
```

## PostCSS Configuration (postcss.config.mjs)

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

## CSS File Setup (app/globals.css)

```css
@import 'tailwindcss';

/* Theme customization using CSS variables */
@theme {
  --color-background: hsl(240 33% 4%);
  --color-foreground: hsl(240 5% 96%);
  --color-primary: hsl(252 100% 65%);
  --color-accent: hsl(163 100% 39%);
  --color-border: hsl(240 20% 16%);

  /* Custom animations */
  --animate-float: float 6s ease-in-out infinite;
  --animate-glow: glow-pulse 4s ease-in-out infinite;
}

/* Keyframes and custom utilities */
@layer utilities {
  .glass-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
}
```

## Optional tailwind.config.ts (for migration)

- Use `@config "./tailwind.config.ts"` in CSS if needed
- Keep darkMode as string, not array: `darkMode: 'class'`
- Remove explicit content paths (auto-detected now)

## Best Practices

1. Define custom colors/tokens in CSS with @theme
2. Use CSS variables for dynamic theming
3. Keep utilities in @layer utilities
4. Avoid deep JS config overrides
5. Leverage new v4 features:
   - Container queries (native)
   - 3D transforms
   - Adaptive gradients
   - not- variant for conditional styling
