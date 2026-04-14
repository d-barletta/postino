'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'flex items-center border-b border-gray-200 dark:border-gray-700 w-full gap-0',
      'overflow-x-auto overflow-y-hidden scrollbar-none',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLButtonElement>(null);

  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const scrollToCenter = () => {
      const parent = el.parentElement;
      if (!parent) return;
      parent.scrollTo({
        left: Math.max(0, el.offsetLeft - parent.clientWidth / 2 + el.offsetWidth / 2),
        behavior: 'smooth',
      });
    };

    const observer = new MutationObserver(() => {
      if (el.dataset.state === 'active') scrollToCenter();
    });

    observer.observe(el, { attributes: true, attributeFilter: ['data-state'] });

    if (el.dataset.state === 'active') scrollToCenter();

    return () => observer.disconnect();
  }, []);

  return (
    <TabsPrimitive.Trigger
      ref={setRef}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap pb-3 px-1 mr-4 sm:mr-6 text-sm font-medium',
        'transition-all focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-[#efd957]',
        'disabled:pointer-events-none disabled:opacity-50',
        'border-b-2 border-transparent text-gray-500 dark:text-gray-400',
        'hover:text-gray-700 dark:hover:text-gray-200',
        'data-[state=active]:border-[#efd957] data-[state=active]:text-[#a3891f] dark:data-[state=active]:text-[#f3df79]',
        '-mb-px',
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-6 focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-[#efd957]',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
