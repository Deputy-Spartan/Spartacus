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
          blue: "#00E5FF",
          purple: "#B14BFF",
          cyan: "#22D3EE",
        },
      },
      fontFamily: {
        sans: ["Inter", "Roboto", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-blue": "0 0 15px rgba(0, 229, 255, 0.35)",
        "glow-blue-lg": "0 0 30px rgba(0, 229, 255, 0.45)",
        "glow-purple": "0 0 15px rgba(177, 75, 255, 0.35)",
      },
      backgroundImage: {
        "neon-gradient": "linear-gradient(135deg, #00E5FF 0%, #B14BFF 100%)",
      },
      borderColor: {
        "neon-blue": "rgba(0, 229, 255, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
