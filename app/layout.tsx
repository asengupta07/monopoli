import type { Metadata, Viewport } from 'next';
import { Barlow_Semi_Condensed, Space_Grotesk } from 'next/font/google';
import './globals.css';

/**
 * Two families, chosen for the board:
 *
 * Barlow Semi Condensed carries every label. Tiles are narrow and names like
 * "Power Company" have to sit inside one, so a condensed face buys the width a
 * normal one cannot.
 *
 * Space Grotesk handles display type — the wordmark, card titles, money — where
 * there is room for its wider, more characterful shapes.
 */
const body = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-body',
});

const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'MonoPoli',
  description: 'MonoPoli — a multiplayer board game. Play with friends, no sign up required.',
};

export const viewport: Viewport = {
  themeColor: '#07060a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
