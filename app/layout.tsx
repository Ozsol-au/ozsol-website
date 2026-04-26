import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://ozsol.com.au'),
  title: {
    default: 'Ozsol - Software for industries that don\u2019t get to fail',
    template: '%s · Ozsol',
  },
  description:
    'Ozsol is a Melbourne-based software studio building for regulated practice, healthcare, and infrastructural data. Founded 2016. Selective engagements.',
  keywords: [
    'Ozsol',
    'Australian software',
    'Melbourne software studio',
    'regulated software',
    'healthcare software Australia',
    'data engineering Australia',
  ],
  authors: [{ name: 'Ozsol Pty Ltd' }],
  creator: 'Ozsol Pty Ltd',
  publisher: 'Ozsol Pty Ltd',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: 'https://ozsol.com.au',
    siteName: 'Ozsol',
    title: 'Ozsol - Software for industries that don\u2019t get to fail',
    description:
      'A Melbourne-based software studio building for regulated practice, healthcare, and infrastructural data. Founded 2016. Selective engagements.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Ozsol - Software for industries that don\u2019t get to fail',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ozsol - Software for industries that don\u2019t get to fail',
    description:
      'A Melbourne-based software studio building for regulated practice, healthcare, and infrastructural data.',
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://ozsol.com.au',
  },
  verification: {
    google: 'tN7aMFXxikjJLUht-86-1SrbMaBrfx7OKNheWtwvf1g',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}