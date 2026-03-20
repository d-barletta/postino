import { AppShellLayout } from '@/components/layout/AppShellLayout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShellLayout mode="admin">{children}</AppShellLayout>;
}
