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
        // The accent color comes from CSS variables (set per theme in
        // globals.css, or the person's own pick), so one setting recolors
        // every highlight. "r g b" form keeps opacity classes working.
        neon: {
          blue: "rgb(var(--accent-rgb, 123 153 188) / <alpha-value>)",
          purple: "#94A3B8",
          cyan: "rgb(var(--accent2-rgb, 94 127 166) / <alpha-value>)",
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
        "neon-gradient": "linear-gradient(135deg, rgb(var(--accent-rgb, 123 153 188)) 0%, rgb(var(--accent2-rgb, 94 127 166)) 100%)",
      },
      borderColor: {
        // A plain border-neon-blue is the accent at 35%, as it always was;
        // border-neon-blue/50 and the like still pick their own strength.
        "neon-blue": (({ opacityValue }: { opacityValue?: string }) =>
          `rgb(var(--accent-rgb, 123 153 188) / ${opacityValue === undefined || opacityValue === "1" || opacityValue.startsWith("var(") ? "0.35" : opacityValue})`) as unknown as string,
      },
    },
  },
  plugins: [],
};

export default config;
