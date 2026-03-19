import * as React from 'react';
import { cn } from '@/lib/utils';

interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full appearance-none items-center rounded-lg border border-gray-300',
        'bg-transparent px-3 py-2 text-sm shadow-sm',
        'focus:outline-none focus:ring-1 focus:ring-[#EFD957] focus:border-[#EFD957]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-100',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);

NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
