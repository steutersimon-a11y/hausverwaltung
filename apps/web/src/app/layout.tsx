import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ATLAS Property OS", template: "%s · ATLAS" },
  description: "Räumlicher Verwaltungsprototyp mit klar gekennzeichneten synthetischen Demodaten.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de" suppressHydrationWarning><body>{children}</body></html>;
}
