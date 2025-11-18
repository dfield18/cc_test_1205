/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#34CAFF',
        'primary-glow': '#60D5FF',
        accent: '#A855F7',
        foreground: '#0F172A', // slate-900
        'card-foreground': '#0F172A', // slate-900 - same as foreground for card text
        'muted-foreground': '#64748B', // slate-500
        background: '#F8FAFC', // slate-50
        card: '#FFFFFF', // HSL 0 0% 100% light mode
        input: '#E2E8F0', // HSL 220 13% 91% light mode (slate-200)
        ring: '#34CAFF', // Primary color for focus ring
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.04)', // Light mode
      },
      keyframes: {
        'gradient-xy': {
          '0%, 100%': {
            'background-position': '0% 50%',
          },
          '50%': {
            'background-position': '100% 50%',
          },
        },
      },
      animation: {
        'gradient-xy': 'gradient-xy 15s ease infinite',
      },
      backgroundSize: {
        'gradient-xy': '400% 400%',
      },
    },
  },
  plugins: [],
}

