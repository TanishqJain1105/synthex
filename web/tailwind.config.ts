import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based dark mode — toggled by the Zustand store adding `.dark` to <html>.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          accent: 'var(--sidebar-accent)',
          border: 'var(--sidebar-border)',
        },
        // Chart tokens — needed for role labels (e.g. Synthesizer → text-chart-4).
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
        agent: {
          done: 'var(--agent-done)',
          running: 'var(--agent-running)',
          waiting: 'var(--agent-waiting)',
          error: 'var(--agent-error)',
          'done-bg': 'var(--agent-done-bg)',
          'running-bg': 'var(--agent-running-bg)',
          'error-bg': 'var(--agent-error-bg)',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
        serif: ['Georgia', 'serif'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'calc(var(--radius) + 4px)',
        sm: 'calc(var(--radius) - 2px)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'caret-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.25s ease-out',
        'caret-blink': 'caret-blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
