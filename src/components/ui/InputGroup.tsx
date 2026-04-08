import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type InputGroupAddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end';

const addonAlignmentClasses: Record<InputGroupAddonAlign, string> = {
  'inline-start': 'order-first px-3 dark:border-gray-600',
  'inline-end': 'order-last px-3 dark:border-gray-600',
  'block-start': 'order-first basis-full px-3 py-2 dark:border-gray-600',
  'block-end': 'order-last basis-full px-2 py-2 dark:border-gray-600',
};

type InputGroupButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';
type InputGroupButtonSize = 'xs' | 'icon-xs' | 'sm' | 'icon-sm';

const buttonVariantMap: Record<InputGroupButtonVariant, NonNullable<ButtonProps['variant']>> = {
  default: 'primary',
  destructive: 'destructive',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'link',
};

const buttonSizeMap: Record<InputGroupButtonSize, NonNullable<ButtonProps['size']>> = {
  xs: 'sm',
  'icon-xs': 'icon',
  sm: 'sm',
  'icon-sm': 'icon',
};

const buttonSizeClasses: Record<InputGroupButtonSize, string> = {
  xs: 'h-7 rounded-md px-2.5 text-xs',
  'icon-xs': 'h-7 w-7 rounded-md',
  sm: 'h-8 rounded-md px-3 text-sm',
  'icon-sm': 'h-8 w-8 rounded-md',
};

const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="input-group"
      className={cn(
        'group/input-group flex min-w-0 w-full flex-wrap items-stretch overflow-hidden rounded-lg border border-gray-300 bg-transparent shadow-sm transition-[border-color,box-shadow]',
        'focus-within:border-[#efd957] focus-within:ring-1 focus-within:ring-[#efd957]',
        'dark:border-gray-600 dark:bg-gray-800/50',
        className,
      )}
      {...props}
    />
  ),
);
InputGroup.displayName = 'InputGroup';

interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: InputGroupAddonAlign;
}

const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ align = 'inline-start', className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        'flex shrink-0 items-center gap-2 text-gray-500 dark:text-gray-400',
        addonAlignmentClasses[align],
        className,
      )}
      {...props}
    />
  ),
);
InputGroupAddon.displayName = 'InputGroupAddon';

const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    data-slot="input-group-control"
    className={cn(
      'min-w-0 flex-1 basis-0 border-0 bg-transparent px-3 py-2 text-sm text-gray-900 shadow-none outline-none',
      'placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50',
      'dark:text-gray-100 dark:placeholder:text-gray-500',
      className,
    )}
    {...props}
  />
));
InputGroupInput.displayName = 'InputGroupInput';

const InputGroupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="input-group-control"
    className={cn(
      'field-sizing-content min-h-10 w-full basis-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm text-gray-900 shadow-none outline-none',
      'placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50',
      'dark:text-gray-100 dark:placeholder:text-gray-500',
      className,
    )}
    {...props}
  />
));
InputGroupTextarea.displayName = 'InputGroupTextarea';

const InputGroupText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="input-group-text"
      className={cn('text-sm whitespace-nowrap text-gray-500 dark:text-gray-400', className)}
      {...props}
    />
  ),
);
InputGroupText.displayName = 'InputGroupText';

interface InputGroupButtonProps extends Omit<ButtonProps, 'size' | 'variant'> {
  size?: InputGroupButtonSize;
  variant?: InputGroupButtonVariant;
}

const InputGroupButton = React.forwardRef<HTMLButtonElement, InputGroupButtonProps>(
  ({ className, size = 'xs', variant = 'ghost', ...props }, ref) => (
    <Button
      ref={ref}
      size={buttonSizeMap[size]}
      variant={buttonVariantMap[variant]}
      className={cn(buttonSizeClasses[size], className)}
      {...props}
    />
  ),
);
InputGroupButton.displayName = 'InputGroupButton';

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
