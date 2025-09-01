import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Basic skeleton component for loading states
 */
export const Skeleton = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-200 dark:bg-gray-800',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * Skeleton for text content
 */
export const SkeletonText = ({ 
  lines = 3, 
  className 
}: { 
  lines?: number; 
  className?: string; 
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  );
};

/**
 * Skeleton for data table rows
 */
export const SkeletonTable = ({ 
  rows = 5, 
  columns = 4,
  className 
}: { 
  rows?: number; 
  columns?: number;
  className?: string; 
}) => {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-8 flex-1" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

/**
 * Skeleton for cards
 */
export const SkeletonCard = ({ className }: { className?: string }) => {
  return (
    <div className={cn('rounded-lg border border-gray-200 p-6 space-y-4', className)}>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
};

/**
 * Skeleton for dashboard widgets
 */
export const SkeletonWidget = ({ 
  type = 'chart',
  className 
}: { 
  type?: 'chart' | 'metric' | 'table';
  className?: string; 
}) => {
  return (
    <div className={cn(
      'rounded-lg border border-gray-200 bg-white p-4 space-y-4',
      className
    )}>
      {/* Widget header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-4" />
      </div>
      
      {/* Widget content based on type */}
      {type === 'chart' && (
        <div className="space-y-2">
          <div className="flex items-end justify-between h-32 space-x-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="flex-1"
                style={{ height: `${20 + Math.random() * 80}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-8" />
            ))}
          </div>
        </div>
      )}
      
      {type === 'metric' && (
        <div className="text-center space-y-2">
          <Skeleton className="h-12 w-24 mx-auto" />
          <Skeleton className="h-4 w-16 mx-auto" />
        </div>
      )}
      
      {type === 'table' && (
        <SkeletonTable rows={3} columns={3} />
      )}
    </div>
  );
};

/**
 * Skeleton for navigation items
 */
export const SkeletonNav = ({ items = 5 }: { items?: number }) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
};

/**
 * Full page skeleton layout
 */
export const SkeletonPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-6 w-px" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center space-x-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>
      
      {/* Sidebar */}
      <div className="flex">
        <div className="w-64 bg-white border-r border-gray-200 p-4">
          <SkeletonNav items={8} />
        </div>
        
        {/* Main content */}
        <div className="flex-1 p-6">
          <div className="space-y-6">
            {/* Page header */}
            <div>
              <Skeleton className="h-8 w-1/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            
            {/* Content grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            
            {/* Table section */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <Skeleton className="h-6 w-1/4 mb-4" />
              <SkeletonTable rows={6} columns={5} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};