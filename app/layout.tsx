import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finderz Meta Engine",
  description: "Intern dashboard voor het genereren, bewaken en optimaliseren van Meta-wervingscampagnes.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
