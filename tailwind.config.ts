import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // High-Trust Editorial Palette
        primary: {
          DEFAULT: "#17243A", // Deep Navy
          dark: "#0F1725",
          light: "#23344F",
        },
        navy: {
          DEFAULT: "#17243A",
          dark: "#0F1725",
          light: "#23344F",
        },
        background: {
          DEFAULT: "#FAF7F0", // Warm Ivory
          warm: "#FAF7F0",
          alt: "#F3EDE1",
        },
        ivory: {
          DEFAULT: "#FAF7F0",
          light: "#FCFBF7",
          dark: "#EFE7D8",
        },
        surface: {
          DEFAULT: "#FFFFFF", // Pure White
          elevated: "#FFFFFF",
          muted: "#F7F5F0",
        },
        accent: {
          DEFAULT: "#C39A55", // Muted Gold
          light: "#D8B474",
          dark: "#A37D3B",
        },
        "accent-admin": {
          DEFAULT: "#4338CA", // Deep Indigo
          light: "#EEF2FF",
          dark: "#312E81",
          border: "#C7D2FE",
        },
        gold: {
          DEFAULT: "#C39A55",
          light: "#D8B474",
          dark: "#A37D3B",
        },
        main: "#202735", // Main Text
        text: {
          DEFAULT: "#202735",
          muted: "#6B7280",
        },
        secondary: "#6B7280", // Secondary Text
        border: "#E5E7EB", // Subtle Border
        
        // Semantic Verification & Moderation Status Colors
        status: {
          pending: "#D97706",
          pendingBg: "#FEF3C7",
          pendingBorder: "#FDE68A",
          verified: "#059669",
          verifiedBg: "#D1FAE5",
          verifiedBorder: "#A7F3D0",
          rejected: "#DC2626",
          rejectedBg: "#FEE2E2",
          rejectedBorder: "#FECACA",
          success: "#059669",
          successBg: "#D1FAE5",
          successBorder: "#A7F3D0",
          warning: "#D97706",
          warningBg: "#FEF3C7",
          warningBorder: "#FDE68A",
          danger: "#DC2626",
          dangerBg: "#FEE2E2",
          dangerBorder: "#FECACA",
          info: "#2563EB",
          infoBg: "#DBEAFE",
          infoBorder: "#BFDBFE",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Cormorant Garamond", "serif"],
        urdu: ["var(--font-urdu)", "Noto Nastaliq Urdu", "serif"],
        arabic: ["var(--font-arabic)", "Amiri", "Noto Naskh Arabic", "serif"],
      },
      lineHeight: {
        nastaliq: "2.1",
        "nastaliq-tight": "1.8",
        "nastaliq-loose": "2.4",
      },
      aspectRatio: {
        "book-cover": "2 / 3",
      },
      boxShadow: {
        book: "0 10px 25px -5px rgba(23, 36, 58, 0.15), 0 8px 10px -6px rgba(23, 36, 58, 0.1)",
        "book-hover": "0 20px 30px -10px rgba(23, 36, 58, 0.25), 0 10px 15px -5px rgba(195, 154, 85, 0.15)",
        card: "0 2px 10px -2px rgba(23, 36, 58, 0.05), 0 1px 3px -1px rgba(23, 36, 58, 0.05)",
        gold: "0 4px 14px 0 rgba(195, 154, 85, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
