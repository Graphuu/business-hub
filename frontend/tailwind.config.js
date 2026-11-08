/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: '#F4F7F6',
        surface: '#FFFFFF',
        raised: '#FFFFFF',
        ink: '#24292E',
        mint: '#3DD6A3',
        gold: '#C08A1E',
        azure: '#2F86C9',
        teal: '#1F9D76',
        coral: '#D9603F',
      },
      // Squarer corners across the board — every existing rounded-* class
      // tightens without touching the markup.
      borderRadius: {
        DEFAULT: '4px',
        md: '5px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
      },
    },
  },
  plugins: [],
}
