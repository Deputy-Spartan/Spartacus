import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#1C1D20",
          900: "#242529",
          800: "#2C2E33",
          700: "#37393F",
        },
        neon: {
          blue: "#7B99BC",
          purple: "#94A3B8",
          cyan: "#5E7FA6",
        },
      },
      fontFamily: {
        sans: ["Inter", "Roboto", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-blue": "none",
        "glow-blue-lg": "none",
        "glow-purple": "none",
      },
      backgroundImage: {
        "neon-gradient": "linear-gradient(135deg, #7B99BC 0%, #5E7FA6 100%)",
      },
      borderColor: {
        "neon-blue": "rgba(123, 153, 188, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
