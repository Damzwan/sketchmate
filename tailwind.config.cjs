/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--ion-color-primary)",
        'primary-shade': "var(--ion-color-primary-shade)",
        secondary: "var(--ion-color-secondary)",
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
  plugins: []
};
