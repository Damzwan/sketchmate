/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,vue}"],
  theme: {
    extend: {

      gridTemplateColumns: {
        '20': 'repeat(20, minmax(0, 1fr))',
      },

      fontSize: {
        sm2: "0.6rem"
      },

      colors: {
        primary: "var(--ion-color-primary)",
        "primary-shade": "var(--ion-color-primary-shade)",
        "primary-light": "#FFB995",
        secondary: "var(--ion-color-secondary)",
        "secondary-light": "#E3745E",
        background: "var(--ion-color-background)"
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" }
        }
      },
      animation: {
        wiggle: "wiggle 1s ease-in-out infinite"
      }
    }
  },
  plugins: [require("@tailwindcss/typography")]
};
