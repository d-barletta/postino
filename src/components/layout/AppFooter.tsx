import { ThemeToggle } from './ThemeToggle';

export function AppFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white/70 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-sm text-gray-500 dark:text-gray-400">
        <p>© {new Date().getFullYear()} Postino. All rights reserved.</p>
        <ThemeToggle />
      </div>
    </footer>
  );
}
