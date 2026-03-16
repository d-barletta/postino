import type { Metadata } from 'next';
import './globals.css';
import { ClientProviders } from '@/components/auth/ClientProviders';
import { AppFooter } from '@/components/layout/AppFooter';

export const metadata: Metadata = {
  title: 'Postino - AI Email Redirector',
  description: 'Intelligent email processing powered by AI. Redirect, summarize, and filter your emails with natural language rules.',
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
      </body>
    </html>
  );
}
