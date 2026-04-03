'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/Command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';

export interface ComboboxChipsOption {
  value: string;
  label: string;
}

interface ComboboxChipsProps {
  options: ComboboxChipsOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function ComboboxChips({
  options,
  values,
  onValuesChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No options found.',
  className,
  disabled,
  loading,
}: ComboboxChipsProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (optionValue: string) => {
    if (values.includes(optionValue)) {
      onValuesChange(values.filter((v) => v !== optionValue));
    } else {
      onValuesChange([...values, optionValue]);
    }
  };

  const handleRemove = (e: React.MouseEvent, optionValue: string) => {
    e.stopPropagation();
    onValuesChange(values.filter((v) => v !== optionValue));
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValuesChange([]);
  };

  const selectedLabels = values.map(
    (v) => options.find((o) => o.value === v)?.label ?? v,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal min-h-9 h-auto',
            values.length > 0 ? 'py-1.5 px-2' : '',
            className,
          )}
          disabled={disabled || loading}
        >
          {values.length === 0 ? (
            <span className="text-gray-400 dark:text-gray-500 truncate text-sm">
              {loading ? '…' : placeholder}
            </span>
          ) : (
            <span className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selectedLabels.map((label, i) => (
                <span
                  key={values[i]}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]"
                >
                  {label}
                  <span
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer hover:opacity-70"
                    onClick={(e) => handleRemove(e, values[i])}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onValuesChange(values.filter((v) => v !== values[i]));
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
            </span>
          )}
          <span className="flex items-center gap-1 ml-2 shrink-0">
            {values.length > 0 && (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100 transition-opacity"
                onClick={handleClearAll}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      values.includes(option.value) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
