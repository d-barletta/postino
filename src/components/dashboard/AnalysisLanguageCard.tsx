'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { useI18n, SUPPORTED_LOCALES } from '@/lib/i18n';

interface AnalysisLanguageCardProps {
  currentLanguage: string | null | undefined;
  onSave: (language: string | null) => Promise<void>;
}

const AUTO_VALUE = '__auto__';

export function AnalysisLanguageCard({ currentLanguage, onSave }: AnalysisLanguageCardProps) {
  const { t } = useI18n();
  const ts = t.dashboard.analysisLanguage;
  const [saving, setSaving] = useState(false);

  const handleChange = async (value: string) => {
    setSaving(true);
    try {
      await onSave(value === AUTO_VALUE ? null : value);
    } finally {
      setSaving(false);
    }
  };

  const selectValue = currentLanguage || AUTO_VALUE;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{ts.title}</h2>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{ts.description}</p>
        <Select value={selectValue} onValueChange={handleChange} disabled={saving}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder={ts.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO_VALUE}>{ts.autoLabel}</SelectItem>
            {SUPPORTED_LOCALES.map((locale) => (
              <SelectItem key={locale.code} value={locale.code}>
                {locale.flag} {locale.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
