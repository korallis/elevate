import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Modern color palette with depth
        background: {
          DEFAULT: 'hsl(240, 33%, 4%)',
          secondary: 'hsl(240, 25%, 8%)',
          tertiary: 'hsl(240, 20%, 11%)',
        },
        foreground: {
          DEFAULT: 'hsl(240, 5%, 96%)',
          muted: 'hsl(240, 5%, 65%)',
          subtle: 'hsl(240, 5%, 45%)',
        },
        primary: {
          DEFAULT: 'hsl(252, 100%, 65%)',
          foreground: 'hsl(0, 0%, 100%)',
          glow: 'hsl(252, 100%, 65%, 0.3)',
        },
        accent: {
          DEFAULT: 'hsl(163, 100%, 39%)',
          foreground: 'hsl(0, 0%, 100%)',
          glow: 'hsl(163, 100%, 39%, 0.3)',
        },
        card: {
          DEFAULT: 'rgba(255, 255, 255, 0.03)',
          hover: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        border: {
          DEFAULT: 'hsl(240, 20%, 16%)',
          subtle: 'hsl(240, 15%, 12%)',
        },
        success: 'hsl(142, 76%, 46%)',
        warning: 'hsl(38, 100%, 52%)',
        destructive: 'hsl(0, 84%, 60%)',
      },
      backgroundImage: {
        // Modern gradients
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-brand':
          'linear-gradient(135deg, hsl(252, 100%, 65%) 0%, hsl(163, 100%, 39%) 100%)',
        'gradient-subtle':
          'linear-gradient(135deg, rgba(106, 76, 255, 0.1) 0%, rgba(0, 200, 150, 0.1) 100%)',
        'gradient-glass':
          'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
        'mesh-gradient':
          'radial-gradient(at 50% 0%, hsl(252, 100%, 65%, 0.15) 0px, transparent 50%), radial-gradient(at 90% 0%, hsl(163, 100%, 39%, 0.1) 0px, transparent 50%), radial-gradient(at 10% 50%, hsl(220, 100%, 60%, 0.08) 0px, transparent 50%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        shimmer: 'shimmer 2s linear infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.625rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '3.75rem',
        '7xl': '4.5rem',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
      boxShadow: {
        glow: '0 0 40px rgba(106, 76, 255, 0.25)',
        'glow-lg': '0 0 60px rgba(106, 76, 255, 0.35)',
        'glow-accent': '0 0 40px rgba(0, 200, 150, 0.25)',
        'inner-glow': 'inset 0 0 20px rgba(106, 76, 255, 0.15)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.12)',
        card: '0 4px 24px rgba(0, 0, 0, 0.08)',
        'elevation-1': '0 2px 8px rgba(0, 0, 0, 0.08)',
        'elevation-2': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'elevation-3': '0 8px 24px rgba(0, 0, 0, 0.16)',
      },
    },
  },
  plugins: [],
};

export default config;
