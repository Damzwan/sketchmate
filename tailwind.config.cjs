/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx,vue}'],
  theme: {
    extend: {

      gridTemplateColumns: {
        '14': 'repeat(14, minmax(0, 1fr))',
        '16': 'repeat(16, minmax(0, 1fr))'
      },

      fontSize: {
        sm2: '0.6rem'
      },

      colors: {
        primary: 'var(--ion-color-primary)',
        'primary-shade': 'var(--ion-color-primary-shade)',
        'primary-light': '#FFB995',
        secondary: 'var(--ion-color-secondary)',
        'secondary-light': '#E3745E',
        background: 'var(--ion-color-background)'
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' }
        },
        ping_slow: {
          '25%': { transform: 'scale(1)', opacity: '1' },
          '50%, 100%': { transform: 'scale(2)', opacity: '0' }
        }
      },
      animation: {
        wiggle: 'wiggle 1s ease-in-out infinite',
        'ping-slow': 'ping_slow 3s cubic-bezier(0, 0, 0.2, 1) infinite'
      }
    }
  },
  plugins: [require('@tailwindcss/typography'), require('tailwindcss-animated')]
}
