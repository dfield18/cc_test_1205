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
        'muted-foreground': '#64748B', // slate-500
        background: '#F8FAFC', // slate-50
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

