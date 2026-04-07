'use client';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/Pagination';

interface ResultsPaginationProps {
  page: number;
  totalPages?: number;
  hasNextPage: boolean;
  disabled?: boolean;
  compact?: boolean;
  previousLabel: string;
  nextLabel: string;
  onPageChange: (page: number) => void;
}

type PageToken = number | 'start-ellipsis' | 'end-ellipsis';

function buildPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 'end-ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, 'start-ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [
    1,
    'start-ellipsis',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'end-ellipsis',
    totalPages,
  ];
}

export function ResultsPagination({
  page,
  totalPages,
  hasNextPage,
  disabled = false,
  compact = false,
  previousLabel,
  nextLabel,
  onPageChange,
}: ResultsPaginationProps) {
  const resolvedTotalPages = totalPages ?? Math.max(1, page + (hasNextPage ? 1 : 0));

  if (resolvedTotalPages <= 1) {
    return null;
  }

  const pageTokens = buildPageTokens(page, resolvedTotalPages);

  return (
    <Pagination className="max-w-full">
      <PaginationContent className="flex-wrap justify-center">
        <PaginationItem>
          <PaginationPrevious
            text={previousLabel}
            compact={compact}
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          />
        </PaginationItem>
        {pageTokens.map((token, index) => (
          <PaginationItem key={`${token}-${index}`}>
            {typeof token === 'number' ? (
              <PaginationLink
                isActive={token === page}
                size="default"
                className="min-w-9 px-3"
                disabled={disabled || token === page}
                onClick={() => onPageChange(token)}
              >
                {token}
              </PaginationLink>
            ) : (
              <PaginationEllipsis />
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            text={nextLabel}
            compact={compact}
            disabled={disabled || !hasNextPage || page >= resolvedTotalPages}
            onClick={() => onPageChange(page + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
