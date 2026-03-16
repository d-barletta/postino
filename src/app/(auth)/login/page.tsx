import { LoginForm } from '@/components/auth/LoginForm';
import { PostinoLogo } from '@/components/brand/PostinoLogo';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-yellow-50 via-white to-amber-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <PostinoLogo className="h-9 w-9" />
            <span className="font-bold text-2xl text-gray-900">Postino</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Sign in to your account</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
