import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/InputGroup';

export interface PasswordInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: string;
  error?: string;
  hint?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
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
        <InputGroup
          className={cn(
            error && 'border-red-400 focus-within:border-red-400 focus-within:ring-red-400',
            className,
          )}
        >
          <InputGroupInput ref={ref} id={inputId} type={show ? 'text' : 'password'} {...props} />
          <InputGroupAddon align="inline-end" className="pr-1">
            <InputGroupButton
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow((v) => !v)}
              tabIndex={-1}
            >
              {show ? (
                <EyeOff className="h-4 w-4 text-gray-400" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {hint && !error && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
