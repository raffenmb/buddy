/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx}', './src/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree-Regular'],
        semibold: ['Figtree-SemiBold'],
        bold: ['Figtree-Bold'],
      },
    },
  },
  plugins: [],
};
