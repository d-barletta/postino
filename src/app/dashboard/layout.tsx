import { AppShellLayout } from '@/components/layout/AppShellLayout';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShellLayout mode="dashboard">{children}</AppShellLayout>;
}
