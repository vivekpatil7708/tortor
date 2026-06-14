import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
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
          500: '#7bb86c',
          600: '#5c9a4e',
          700: '#3f7a35',
          800: '#2d5c25',
          900: '#1e3d18',
        },
        cream: '#fdf8f0',
        beige: '#f5ede3',
        charcoal: '#2c2c2c',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        xl: '20px',
        lg: '14px',
      },
    },
  },
  plugins: [],
}
export default config
