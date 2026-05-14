/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cn: {
          red:       'var(--cn-red)',
          'red-dark':  'var(--cn-red-dark)',
          'red-light': 'var(--cn-red-light)',
          blue:      'var(--cn-blue)',
          'blue-dark': 'var(--cn-blue-dark)',
          'blue-light':'var(--cn-blue-light)',
          charcoal:  'var(--cn-charcoal)',
          'gray-bg': 'var(--cn-gray-bg)',
          'gray-100':'var(--cn-gray-100)',
          'gray-200':'var(--cn-gray-200)',
          'gray-400':'var(--cn-gray-400)',
          'gray-600':'var(--cn-gray-600)',
          'gray-800':'var(--cn-gray-800)',
          white:     'var(--cn-white)',
          online:    'var(--cn-online)',
          danger:    'var(--cn-danger)',
          warning:   'var(--cn-warning)',
          success:   'var(--cn-success)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm:   '6px',
        md:   '10px',
        lg:   '16px',
        full: '9999px',
      },
      boxShadow: {
        card:    'var(--shadow-card)',
        modal:   'var(--shadow-modal)',
        sidebar: 'var(--shadow-sidebar)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '250ms',
      },
    },
  },
  plugins: [],
}
