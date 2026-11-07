import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chronicle OG image service',
  description: 'Open Graph images for Chronicle, rendered from a single URL.',
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#2b2b2b', color: '#e6e8ea', fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
