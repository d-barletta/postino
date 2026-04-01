'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:dark:bg-gray-900 group-[.toaster]:text-gray-900 group-[.toaster]:dark:text-gray-100 group-[.toaster]:border-gray-200 group-[.toaster]:dark:border-gray-700 group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-gray-500 group-[.toast]:dark:text-gray-400',
          actionButton: 'group-[.toast]:bg-[#efd957] group-[.toast]:text-black',
          cancelButton:
            'group-[.toast]:bg-gray-100 group-[.toast]:dark:bg-gray-700 group-[.toast]:text-gray-500',
        },
      }}
      {...props}
    />
  );
}
