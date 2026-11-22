/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Taleora brand palette — dark-first, neon-green accent, no purple/violet
        canvas: "#080B0D",
        surface: "#101518",
        elevated: "#151D20",
        line: "#1E262A",
        ink: "#F5F7F5",
        muted: "#A0AAA5",
        accent: "#39FF14",
        "accent-dim": "#2BD40F",
      },
      fontFamily: {
        display: ["Georgia", "'Times New Roman'", "serif"],
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(57,255,20,0.25), 0 8px 40px rgba(57,255,20,0.08)",
        panel: "0 12px 40px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};
