import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  charCount?: { current: number; max: number };
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, charCount, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          className={cn(
            'flex min-h-20 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-y',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#efd957] focus-visible:border-[#efd957]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-100',
            error && 'border-red-400 focus-visible:ring-red-400 focus-visible:border-red-400',
            className
          )}
          ref={ref}
          {...props}
        />
        <div className="flex justify-between items-start">
          <div>
            {hint && !error && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
          {charCount && (
            <p
              className={cn(
                'text-xs tabular-nums',
                charCount.current > charCount.max ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
              )}
            >
              {charCount.current}/{charCount.max}
            </p>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
