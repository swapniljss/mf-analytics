import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 10px 30px -10px rgba(59, 130, 246, 0.45)',
        'glow-emerald': '0 10px 30px -10px rgba(16, 185, 129, 0.45)',
        'glow-rose': '0 10px 30px -10px rgba(244, 63, 94, 0.45)',
        'glow-amber': '0 10px 30px -10px rgba(245, 158, 11, 0.45)',
        'glow-violet': '0 10px 30px -10px rgba(139, 92, 246, 0.45)',
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.06)',
        'soft-lg': '0 4px 12px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.08)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)',
        'brand-gradient-br': 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        'app-shell':
          'linear-gradient(135deg, #f8fafc 0%, rgba(219, 234, 254, 0.45) 45%, rgba(237, 233, 254, 0.35) 100%)',
        'hero-text':
          'linear-gradient(90deg, #0f172a 0%, #1e3a8a 50%, #581c87 100%)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'blob-float': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(20px, -20px) scale(1.05)' },
          '66%': { transform: 'translate(-15px, 15px) scale(0.95)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.7' },
        },
        'wiggle': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%':       { transform: 'rotate(-6deg)' },
          '75%':       { transform: 'rotate(6deg)' },
        },
        'sparkle': {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)',  opacity: '1' },
          '50%':       { transform: 'scale(1.15) rotate(15deg)', opacity: '0.85' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 8px 24px -8px rgba(59,130,246,0.45)' },
          '50%':       { boxShadow: '0 14px 36px -8px rgba(139,92,246,0.6)' },
        },
        'bar-shimmer': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        'draw-line': {
          '0%':   { strokeDashoffset: '800' },
          '100%': { strokeDashoffset: '0' },
        },
        'float-up': {
          '0%':   { transform: 'translateY(0)', opacity: '0' },
          '15%':  { opacity: '0.6' },
          '85%':  { opacity: '0.6' },
          '100%': { transform: 'translateY(-140px)', opacity: '0' },
        },
        'slow-spin': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'tilt': {
          '0%, 100%': { transform: 'rotate(-1deg)' },
          '50%':       { transform: 'rotate(1deg)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':       { backgroundPosition: '100% 50%' },
        },
        'gradient-rotate': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'aurora': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '25%':       { transform: 'translate(40px, -30px) scale(1.1)' },
          '50%':       { transform: 'translate(-20px, 30px) scale(0.95)' },
          '75%':       { transform: 'translate(-40px, -20px) scale(1.05)' },
        },
        'glow-breath': {
          '0%, 100%': { opacity: '0.55', filter: 'blur(28px)' },
          '50%':       { opacity: '0.85', filter: 'blur(36px)' },
        },
        'login-exit': {
          '0%':   { opacity: '1', transform: 'scale(1) translateY(0)',     filter: 'blur(0px)' },
          '100%': { opacity: '0', transform: 'scale(0.96) translateY(-8px)', filter: 'blur(6px)' },
        },
        'dashboard-enter': {
          '0%':   { opacity: '0', transform: 'scale(1.02) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1)    translateY(0)'    },
        },
        'ring-pulse': {
          '0%':   { transform: 'scale(0.7)', opacity: '0.6' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'scan-x': {
          '0%':   { left: '-10%', opacity: '0' },
          '20%':  { opacity: '0.8' },
          '80%':  { opacity: '0.8' },
          '100%': { left: '110%', opacity: '0' },
        },
        'travel-dot': {
          '0%':   { offsetDistance: '0%',   opacity: '0' },
          '10%':  { opacity: '1' },
          '90%':  { opacity: '1' },
          '100%': { offsetDistance: '100%', opacity: '0' },
        },
        'count-pulse': {
          '0%, 100%': { textShadow: '0 0 0 rgba(34,211,238,0)' },
          '50%':       { textShadow: '0 0 24px rgba(34,211,238,0.5)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'fade-in-up': 'fade-in-up 0.45s ease-out both',
        'fade-in-down': 'fade-in-down 0.4s ease-out both',
        'slide-up': 'slide-up 0.5s ease-out both',
        'slide-in-right': 'slide-in-right 0.4s ease-out both',
        'shimmer': 'shimmer 1.6s linear infinite',
        'blob-float': 'blob-float 18s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'wiggle': 'wiggle 0.5s ease-in-out',
        'sparkle': 'sparkle 2.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'bar-shimmer': 'bar-shimmer 2.4s ease-in-out infinite',
        'draw-line': 'draw-line 3.2s ease-out forwards',
        'float-up': 'float-up 6s ease-in-out infinite',
        'slow-spin': 'slow-spin 25s linear infinite',
        'tilt': 'tilt 6s ease-in-out infinite',
        'gradient-shift':  'gradient-shift 6s ease-in-out infinite',
        'gradient-rotate': 'gradient-rotate 12s linear infinite',
        'aurora':          'aurora 18s ease-in-out infinite',
        'glow-breath':     'glow-breath 4s ease-in-out infinite',
        'login-exit':      'login-exit 0.55s ease-in forwards',
        'dashboard-enter': 'dashboard-enter 0.6s ease-out both',
        'ring-pulse':      'ring-pulse 3s ease-out infinite',
        'scan-x':          'scan-x 6s ease-in-out infinite',
        'count-pulse':     'count-pulse 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
