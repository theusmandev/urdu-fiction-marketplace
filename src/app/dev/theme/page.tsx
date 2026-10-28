import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DevThemeClient } from "./DevThemeClient";

export const metadata: Metadata = {
  title: "Theme Tokens & Component Showcase | UNB Dev Lab",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DevThemePage() {
  // Disallow in production builds
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DevThemeClient />;
}

