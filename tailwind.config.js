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
        bank: {
          primary: '#10b981', // emerald-500
          secondary: '#059669', // emerald-600
          dark: '#0f172a', // slate-900
        },
      },
    },
  },
  plugins: [],
};
