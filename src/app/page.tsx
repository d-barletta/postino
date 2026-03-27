import type { Metadata } from 'next';
import { HomePageContent } from '@/components/home/HomePageContent';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'Postino | AI Email Redirector',
  description:
    'Postino gives you a private email address and uses AI to clean, summarize, and forward only the content that matters.',
  keywords: [
    'AI email assistant',
    'email summarizer',
    'newsletter summarizer',
    'email filtering',
    'inbox automation',
    'Postino',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    siteName: 'Postino',
    title: 'Postino | AI Email Redirector',
    description:
      'Get a private email address and let Postino summarize newsletters, remove noise, and forward clean content to your inbox.',
    url: '/',
    type: 'website',
    images: [
      {
        url: '/og_cover.png',
        width: 1463,
        height: 768,
        alt: 'Postino cover image',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postino | AI Email Redirector',
    description:
      'Get a private email address and let Postino summarize newsletters, remove noise, and forward clean content to your inbox.',
    images: [
      {
        url: '/og_cover.png',
        alt: 'Postino cover image',
      },
    ],
  },
};

export default function HomePage() {
  return <HomePageContent />;
}
