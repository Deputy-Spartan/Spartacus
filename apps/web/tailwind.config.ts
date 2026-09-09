import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0B0F19",
          900: "#111827",
          800: "#1E2640",
          700: "#2A3350",
        },
        neon: {
          blue: "#4C8DFF",
          purple: "#94A3B8",
          cyan: "#4C8DFF",
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
        "neon-gradient": "linear-gradient(135deg, #4C8DFF 0%, #4C8DFF 100%)",
      },
      borderColor: {
        "neon-blue": "rgba(76, 141, 255, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
