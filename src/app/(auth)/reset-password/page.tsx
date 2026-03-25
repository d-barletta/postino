import Link from 'next/link';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { DashboardLink } from '@/components/auth/DashboardLink';

export const metadata: Metadata = {
  title: 'Set New Password',
  description: 'Choose a new password for your Postino account.',
  alternates: {
    canonical: '/reset-password',
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Set New Password | Postino',
    description: 'Choose a new password for your Postino account.',
    url: '/reset-password',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Set New Password | Postino',
    description: 'Choose a new password for your Postino account.',
  },
};

export default function ResetPasswordPage() {
  return (
    <div className="flex-1 from-yellow-50 via-white to-amber-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md ui-fade-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-0 mb-4 hover:opacity-80 transition-opacity">
            <PostinoLogo className="h-12 w-12" />
            <span className="font-bold text-3xl text-gray-900 dark:text-white">Postino</span>
          </Link>
          <h1 className="text-1xl font-bold text-gray-900">Create a new password</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Your new password must be at least 8 characters</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
          <ResetPasswordForm />
        </div>
        <DashboardLink />
      </div>
    </div>
  );
}
