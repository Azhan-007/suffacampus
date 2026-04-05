import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core palette — blue-based modern educational theme
        primary: {
          DEFAULT: "#f0f5fa",    // page bg
          light: "#f8fafc",      // slate-50
          dark: "#e8eef6",       // page bg alt
        },
        accent: {
          DEFAULT: "#2563eb",    // blue-600
          light: "#3b82f6",      // blue-500
          dark: "#1d4ed8",       // blue-700
        },
        sidebar: {
          DEFAULT: "#ffffff",
          hover: "#f8fafc",
        },
        // Semantic colors
        success: {
          DEFAULT: "#059669",    // emerald-600
          light: "#ecfdf5",      // emerald-50
          dark: "#047857",       // emerald-700
        },
        warning: {
          DEFAULT: "#d97706",    // amber-600
          light: "#fffbeb",      // amber-50
          dark: "#b45309",       // amber-700
        },
        danger: {
          DEFAULT: "#dc2626",    // red-600
          light: "#fef2f2",      // red-50
          dark: "#b91c1c",       // red-700
        },
        info: {
          DEFAULT: "#2563eb",    // blue-600
          light: "#eff6ff",      // blue-50
        },
        // Text colors — slate palette
        heading: "#0f172a",      // slate-900
        body: "#334155",         // slate-700
        muted: "#94a3b8",        // slate-400
        border: "#e2e8f0",       // slate-200
        // Icon background colors (soft pastels)
        "icon-blue": "#eff6ff",     // blue-50
        "icon-green": "#ecfdf5",    // emerald-50
        "icon-orange": "#fffbeb",   // amber-50
        "icon-red": "#fef2f2",      // red-50
        "icon-purple": "#f5f3ff",   // violet-50
        "icon-pink": "#fdf2f8",     // pink-50
        "icon-teal": "#f0fdfa",     // teal-50
        "icon-yellow": "#fefce8",   // yellow-50
        "icon-gray": "#f8fafc",     // slate-50
      },
      textColor: {
        heading: "#0f172a",      // slate-900
        body: "#334155",         // slate-700
        muted: "#94a3b8",        // slate-400
      },
      boxShadow: {
        'card': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 2px 8px rgba(0, 0, 0, 0.06)',
        'button': 'none',
        'glow': '0 0 16px rgba(37, 99, 235, 0.08)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
