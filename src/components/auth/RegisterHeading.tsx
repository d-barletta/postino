'use client';

import { useI18n } from '@/lib/i18n';

export function RegisterHeading() {
  const { t } = useI18n();
  return (
    <>
      <h1 className="text-1xl font-bold text-gray-900">{t.auth.register.createAccount}</h1>
      <p className="text-gray-500 dark:text-gray-400 mt-1">{t.auth.register.getYourAddress}</p>
    </>
  );
}
