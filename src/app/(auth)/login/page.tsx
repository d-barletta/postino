import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { LoginHeading } from '@/components/auth/LoginHeading';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to Postino to manage your AI email rules and inbox processing settings.',
  alternates: {
    canonical: '/login',
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Sign In | Postino',
    description: 'Sign in to your Postino account.',
    url: '/login',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Sign In | Postino',
    description: 'Sign in to your Postino account.',
  },
};

export default function LoginPage() {
  return (
    <div className="flex-1 from-yellow-50 via-white to-amber-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md ui-fade-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-0 mb-4 hover:opacity-80 transition-opacity">
            <PostinoLogo className="h-12 w-12" />
            <span className="font-bold text-3xl text-gray-900 dark:text-white">Postino</span>
          </Link>
          <LoginHeading />
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
