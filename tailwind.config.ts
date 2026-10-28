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
        // Semantic Token Mapping
        bg: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          muted: "var(--color-surface-muted)",
          elevated: "var(--color-surface)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          subtle: "var(--color-border-subtle)",
        },
        text: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          contrast: "var(--color-primary-contrast)",
          dark: "var(--color-primary-active)",
          light: "var(--color-primary-hover)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          strong: "var(--color-accent-strong)",
          soft: "var(--color-accent-soft)",
          light: "var(--color-accent-hover)",
          dark: "var(--color-accent-strong)",
        },
        ring: "var(--color-ring)",

        // Status Tokens
        success: {
          DEFAULT: "var(--color-success)",
          hover: "var(--color-success-hover)",
          soft: "var(--color-success-soft)",
          text: "var(--color-success-text)",
          border: "var(--color-success-border)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          hover: "var(--color-warning-hover)",
          soft: "var(--color-warning-soft)",
          text: "var(--color-warning-text)",
          border: "var(--color-warning-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          hover: "var(--color-danger-hover)",
          soft: "var(--color-danger-soft)",
          text: "var(--color-danger-text)",
          border: "var(--color-danger-border)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          hover: "var(--color-info-hover)",
          soft: "var(--color-info-soft)",
          text: "var(--color-info-text)",
          border: "var(--color-info-border)",
        },

        // Role & Area Accents
        "role-accent": {
          DEFAULT: "var(--color-role-accent)",
          strong: "var(--color-role-accent-strong)",
          soft: "var(--color-role-accent-soft)",
          contrast: "var(--color-role-accent-contrast)",
        },
        "accent-marketplace": "var(--accent-marketplace)",
        "accent-studio": "var(--accent-studio)",
        "accent-admin": {
          DEFAULT: "var(--accent-admin)",
          hover: "var(--accent-admin-hover)",
          soft: "var(--accent-admin-soft)",
          strong: "var(--accent-admin-strong)",
          contrast: "var(--accent-admin-contrast)",
          border: "var(--accent-admin-border)",
          light: "var(--accent-admin-soft)",
          dark: "var(--accent-admin-strong)",
        },

        // Backward-Compatibility Aliases
        background: {
          DEFAULT: "var(--color-bg)",
          warm: "var(--color-bg)",
          alt: "var(--color-surface-muted)",
        },
        ivory: {
          DEFAULT: "var(--color-bg)",
          light: "var(--color-surface)",
          dark: "var(--color-surface-muted)",
        },
        navy: {
          DEFAULT: "var(--color-primary)",
          dark: "var(--color-primary-active)",
          light: "var(--color-primary-hover)",
        },
        gold: {
          DEFAULT: "var(--color-accent)",
          light: "var(--color-accent-hover)",
          dark: "var(--color-accent-strong)",
        },
        main: "var(--color-text)",
        secondary: "var(--color-text-muted)",

        status: {
          pending: "var(--color-warning)",
          pendingBg: "var(--color-warning-soft)",
          pendingBorder: "var(--color-warning-border)",
          verified: "var(--color-success)",
          verifiedBg: "var(--color-success-soft)",
          verifiedBorder: "var(--color-success-border)",
          rejected: "var(--color-danger)",
          rejectedBg: "var(--color-danger-soft)",
          rejectedBorder: "var(--color-danger-border)",
          success: "var(--color-success)",
          successBg: "var(--color-success-soft)",
          successBorder: "var(--color-success-border)",
          warning: "var(--color-warning)",
          warningBg: "var(--color-warning-soft)",
          warningBorder: "var(--color-warning-border)",
          danger: "var(--color-danger)",
          dangerBg: "var(--color-danger-soft)",
          dangerBorder: "var(--color-danger-border)",
          info: "var(--color-info)",
          infoBg: "var(--color-info-soft)",
          infoBorder: "var(--color-info-border)",
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
        book: "var(--shadow-book)",
        "book-hover": "var(--shadow-book-hover)",
        card: "var(--shadow-card)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
    },
  },
  plugins: [],
};

export default config;
