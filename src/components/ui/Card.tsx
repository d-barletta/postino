import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'glass-panel ui-fade-up rounded-xl shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-px hover:shadow-[0_14px_35px_rgba(15,23,42,0.12)] dark:hover:shadow-[0_14px_35px_rgba(0,0,0,0.45)]',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, heading, description, actions, children, ...props }, ref) => {
    const hasStructuredContent =
      heading !== undefined || description !== undefined || actions !== undefined;

    return (
      <div
        ref={ref}
        className={cn(
          'px-4 py-4 border-b border-gray-200 dark:border-gray-700',
          hasStructuredContent ? 'space-y-1.5' : 'flex flex-col space-y-1.5',
          className,
        )}
        {...props}
      >
        {hasStructuredContent ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="min-w-0 space-y-1">
                {heading != null ? <CardTitle>{heading}</CardTitle> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 min-h-7">{actions}</div>
            </div>
            {description != null ? <CardDescription>{description}</CardDescription> : null}
          </div>
        ) : null}
        {children}
      </div>
    );
  },
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'text-md font-semibold leading-none tracking-tight text-gray-900 dark:text-gray-100',
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-sm text-gray-500 dark:text-gray-400', className)}
      {...props}
    />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-6 py-4', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center px-6 py-4 border-t border-gray-200 dark:border-gray-700',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
