import Link from 'next/link';
import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { DashboardLink } from '@/components/auth/DashboardLink';
import { ForgotPasswordHeading } from '@/components/auth/ForgotPasswordHeading';

export const metadata: Metadata = {
  title: 'Forgot Password',
  description: 'Request a password reset email to regain access to your Postino account.',
  alternates: {
    canonical: '/forgot-password',
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Forgot Password | Postino',
    description: 'Request a password reset email for your Postino account.',
    url: '/forgot-password',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Forgot Password | Postino',
    description: 'Request a password reset email for your Postino account.',
  },
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex-1 from-yellow-50 via-white to-amber-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md ui-fade-up">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex flex-col items-center gap-0 mb-4 hover:opacity-80 transition-opacity"
          >
            <PostinoLogo className="h-12 w-12" />
            <span className="font-bold text-3xl text-gray-900 dark:text-white">Postino</span>
          </Link>
          <ForgotPasswordHeading />
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
          <ForgotPasswordForm />
        </div>
        <DashboardLink />
      </div>
    </div>
  );
}
