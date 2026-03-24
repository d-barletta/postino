import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ClientProviders } from '@/components/auth/ClientProviders';
import { AppFooter } from '@/components/layout/AppFooter';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'Postino | AI Email Redirector',
    template: '%s | Postino',
  },
  description:
    'Intelligent email processing powered by AI. Redirect, summarize, and filter your emails with natural language rules.',
  applicationName: 'Postino',
  appleWebApp: {
    title: 'Postino',
  },
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
  openGraph: {
    type: 'website',
    siteName: 'Postino',
    title: 'Postino | AI Email Redirector',
    description:
      'Intelligent email processing powered by AI. Redirect, summarize, and filter your emails with natural language rules.',
    images: [
      {
        url: '/logo.svg',
        width: 512,
        height: 512,
        alt: 'Postino logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postino | AI Email Redirector',
    description:
      'Intelligent email processing powered by AI. Redirect, summarize, and filter your emails with natural language rules.',
    images: ['/logo.svg'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EFD957' },
    { media: '(prefers-color-scheme: dark)', color: '#d6c043' },
  ],
  colorScheme: 'light dark',
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})();`,
          }}
        />
        <div className="flex-1">
          <ClientProviders>{children}</ClientProviders>
        </div>
        <AppFooter />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
