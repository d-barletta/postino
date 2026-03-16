import React from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  charCount?: { current: number; max: number };
}

export function Textarea({ label, error, hint, charCount, className, id, ...props }: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          'block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm',
          'placeholder:text-gray-400 resize-y min-h-[80px]',
          'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
          'disabled:cursor-not-allowed disabled:bg-gray-50',
          error && 'border-red-300 focus:border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      <div className="flex justify-between">
        <div>
          {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        {charCount && (
          <p className={cn('text-xs', charCount.current > charCount.max ? 'text-red-600' : 'text-gray-400')}>
            {charCount.current}/{charCount.max}
          </p>
        )}
      </div>
    </div>
  );
}
