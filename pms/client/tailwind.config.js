/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0D1B2A',
        gold: '#C8922A',
        teal: '#1B5E7B',
      }
    }
  },
  plugins: []
};
