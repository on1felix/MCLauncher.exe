/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#141417',
          2: '#18181c',
          3: '#1c1c20',
        },
        card: {
          DEFAULT: '#151517',
          hover: '#1a1a1e',
        },
        accent: {
          DEFAULT: '#ff7b1d',
          dark: '#e06a15',
          light: '#ff9b4d',
          glow: 'rgba(255, 123, 29, 0.3)',
        },
        text: {
          DEFAULT: '#ffffff',
          2: '#d8d8d8',
          secondary: '#656571',
          muted: '#45454e',
        },
        border: {
          DEFAULT: '#1c1c20',
        },
        success: '#34c759',
        danger: '#ff3b30',
        warning: '#ff9500',
      },
      fontFamily: {
        sans: ['Onest', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        base: '12px',
        lg: '16px',
        xl: '24px',
        pill: '48px',
      },
      keyframes: {
        'screen-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'indicator-in': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(1.3)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'screen-in': 'screen-in 0.3s ease-out',
        'indicator-in': 'indicator-in 0.2s ease-out',
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
        'slide-up': 'slide-up 0.4s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
