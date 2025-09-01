import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showPageNumbers?: boolean;
  maxVisiblePages?: number;
  className?: string;
}

/**
 * Pagination component for navigating through data
 */
export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  showPageNumbers = true,
  maxVisiblePages = 7,
  className,
}) => {
  // Don't render if there's only one page or no pages
  if (totalPages <= 1) {
    return null;
  }

  const getVisiblePages = (): (number | 'ellipsis')[] => {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const halfVisible = Math.floor(maxVisiblePages / 2);
    const visiblePages: (number | 'ellipsis')[] = [];

    // Always show first page
    visiblePages.push(1);

    if (currentPage <= halfVisible + 2) {
      // Show pages from start
      for (let i = 2; i <= Math.min(maxVisiblePages - 1, totalPages - 1); i++) {
        visiblePages.push(i);
      }
      if (totalPages > maxVisiblePages - 1) {
        visiblePages.push('ellipsis');
      }
    } else if (currentPage >= totalPages - halfVisible - 1) {
      // Show pages from end
      if (totalPages > maxVisiblePages - 1) {
        visiblePages.push('ellipsis');
      }
      for (let i = Math.max(2, totalPages - maxVisiblePages + 2); i <= totalPages - 1; i++) {
        visiblePages.push(i);
      }
    } else {
      // Show pages around current
      visiblePages.push('ellipsis');
      for (let i = currentPage - halfVisible + 1; i <= currentPage + halfVisible - 1; i++) {
        visiblePages.push(i);
      }
      visiblePages.push('ellipsis');
    }

    // Always show last page (if more than 1)
    if (totalPages > 1) {
      visiblePages.push(totalPages);
    }

    return visiblePages;
  };

  const visiblePages = showPageNumbers ? getVisiblePages() : [];

  return (
    <nav
      className={cn('flex items-center justify-between', className)}
      role="navigation"
      aria-label="Pagination"
    >
      <div className="flex items-center space-x-2">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={cn(
            'inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
            currentPage <= 1
              ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:text-gray-900'
          )}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </button>

        {/* Page numbers */}
        {showPageNumbers && (
          <div className="hidden sm:flex items-center space-x-1">
            {visiblePages.map((page, index) => (
              <React.Fragment key={index}>
                {page === 'ellipsis' ? (
                  <span className="px-3 py-2 text-gray-500">
                    <MoreHorizontal className="w-4 h-4" />
                  </span>
                ) : (
                  <button
                    onClick={() => onPageChange(page as number)}
                    className={cn(
                      'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      page === currentPage
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    )}
                    aria-current={page === currentPage ? 'page' : undefined}
                    aria-label={`Go to page ${page}`}
                  >
                    {page}
                  </button>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Next button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={cn(
            'inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
            currentPage >= totalPages
              ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:text-gray-900'
          )}
          aria-label="Go to next page"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </div>

      {/* Page info */}
      <div className="text-sm text-gray-700">
        Page <span className="font-medium">{currentPage}</span> of{' '}
        <span className="font-medium">{totalPages}</span>
      </div>
    </nav>
  );
};

/**
 * Simple pagination with just previous/next buttons
 */
export const SimplePagination: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}> = ({ currentPage, totalPages, onPageChange, className }) => {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className={cn('flex items-center justify-between', className)}>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={cn(
          'inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
          currentPage <= 1
            ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        )}
      >
        <ChevronLeft className="w-4 h-4 mr-2" />
        Previous
      </button>

      <span className="text-sm text-gray-700">
        {currentPage} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={cn(
          'inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
          currentPage >= totalPages
            ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        )}
      >
        Next
        <ChevronRight className="w-4 h-4 ml-2" />
      </button>
    </nav>
  );
};

/**
 * Pagination with page size selector
 */
export const PaginationWithPageSize: React.FC<{
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  className,
}) => {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-4', className)}>
      {/* Items info and page size selector */}
      <div className="flex items-center space-x-4 text-sm text-gray-700">
        <span>
          Showing {startItem} to {endItem} of {totalItems} results
        </span>
        
        <div className="flex items-center space-x-2">
          <label htmlFor="pageSize" className="text-sm">
            Show:
          </label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-sm">per page</span>
        </div>
      </div>

      {/* Pagination controls */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        showPageNumbers={totalPages > 1}
      />
    </div>
  );
};

/**
 * Hook for managing pagination state
 */
export const usePagination = (
  totalItems: number,
  initialPageSize = 10,
  initialPage = 1
) => {
  const [currentPage, setCurrentPage] = React.useState(initialPage);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  const totalPages = Math.ceil(totalItems / pageSize);

  // Reset to first page when page size changes
  const handlePageSizeChange = React.useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  }, []);

  // Ensure current page is valid when total items change
  React.useEffect(() => {
    const maxPage = Math.max(1, totalPages);
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalPages]);

  return {
    currentPage,
    pageSize,
    totalPages,
    setCurrentPage,
    setPageSize: handlePageSizeChange,
    // Calculated values
    startIndex: (currentPage - 1) * pageSize,
    endIndex: Math.min(currentPage * pageSize, totalItems),
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
};

export default Pagination;