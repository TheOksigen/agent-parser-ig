import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Postarxiv — Instagram arxivi",
  description: "Instagram profillərinin paylaşımları və tam təsvirləri.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
