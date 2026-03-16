import type { Metadata } from 'next';
import './globals.css';
import { ClientProviders } from '@/components/auth/ClientProviders';

export const metadata: Metadata = {
  title: 'Postino - AI Email Redirector',
  description: 'Intelligent email processing powered by AI. Redirect, summarize, and filter your emails with natural language rules.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
