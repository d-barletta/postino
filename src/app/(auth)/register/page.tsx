import Link from 'next/link';
import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { DashboardLink } from '@/components/auth/DashboardLink';
import { RegisterHeading } from '@/components/auth/RegisterHeading';

export const metadata: Metadata = {
  title: 'Sign Up',
  description:
    'Create a Postino account to get a private address and start automating your inbox with AI rules.',
  alternates: {
    canonical: '/register',
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Sign Up | Postino',
    description: 'Create your Postino account and get your private routing address.',
    url: '/register',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Sign Up | Postino',
    description: 'Create your Postino account and get your private routing address.',
  },
};

export default function RegisterPage() {
  return (
    <div className="flex-1 from-yellow-50 via-white to-amber-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md ui-fade-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-0 mb-4 hover:opacity-80 transition-opacity">
            <PostinoLogo className="h-12 w-12" />
            <span className="font-bold text-3xl text-gray-900 dark:text-white">Postino</span>
          </Link>
          <RegisterHeading />
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
          <RegisterForm />
        </div>
        <DashboardLink />
      </div>
    </div>
  );
}
