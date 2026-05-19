/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        uganda: {
          red: '#e11d48', // Uganda flag red
          yellow: '#fbbf24', // Uganda flag yellow
          black: '#000000', // Uganda flag black
          white: '#ffffff', // Uganda flag white
          grey: '#6b7280', // Common grey
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  safelist: [
    // Sidebar / hamburger hovers (ensure production CSS always includes these)
    'hover:bg-primary-100',
    'hover:text-primary-900',
    'hover:border-primary-500',
    'hover:border-primary-300',
    'hover:text-primary-800',
    'group-hover:text-primary-700',
    'border-primary-800',
    'bg-primary-100',
    'active:bg-primary-200',
  ],
  plugins: [],
}
