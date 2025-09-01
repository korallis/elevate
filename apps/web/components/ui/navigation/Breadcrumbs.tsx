import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  current?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  showHomeIcon?: boolean;
  maxItems?: number;
  className?: string;
}

/**
 * Breadcrumb navigation component
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  separator = <ChevronRight className="w-4 h-4 text-gray-400" />,
  showHomeIcon = true,
  maxItems,
  className,
}) => {
  // Truncate items if maxItems is specified
  let displayItems = items;
  let hasEllipsis = false;

  if (maxItems && items.length > maxItems) {
    hasEllipsis = true;
    // Keep first item, ellipsis, and last few items
    const keepLast = Math.max(1, maxItems - 2);
    displayItems = [
      items[0],
      { label: '...', current: false },
      ...items.slice(-keepLast),
    ];
  }

  return (
    <nav
      className={cn('flex items-center space-x-2', className)}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center space-x-2">
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isEllipsis = item.label === '...';

          return (
            <React.Fragment key={index}>
              <li className="flex items-center">
                {isEllipsis ? (
                  <span className="px-2 text-gray-500">
                    {item.label}
                  </span>
                ) : item.href && !item.current ? (
                  <Link
                    href={item.href}
                    className={cn(
                      'inline-flex items-center text-sm font-medium transition-colors hover:text-gray-900',
                      isLast ? 'text-gray-900' : 'text-gray-500'
                    )}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {showHomeIcon && index === 0 && !item.icon ? (
                      <Home className="w-4 h-4 mr-1" />
                    ) : (
                      item.icon && (
                        <span className="mr-1">
                          {React.cloneElement(item.icon as React.ReactElement, {
                            className: 'w-4 h-4',
                          })}
                        </span>
                      )
                    )}
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      'inline-flex items-center text-sm font-medium',
                      isLast || item.current ? 'text-gray-900' : 'text-gray-500'
                    )}
                    aria-current={isLast || item.current ? 'page' : undefined}
                  >
                    {showHomeIcon && index === 0 && !item.icon ? (
                      <Home className="w-4 h-4 mr-1" />
                    ) : (
                      item.icon && (
                        <span className="mr-1">
                          {React.cloneElement(item.icon as React.ReactElement, {
                            className: 'w-4 h-4',
                          })}
                        </span>
                      )
                    )}
                    {item.label}
                  </span>
                )}
              </li>

              {/* Separator */}
              {!isLast && (
                <li className="flex items-center">
                  {separator}
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

/**
 * Simplified breadcrumb component for common use cases
 */
export const SimpleBreadcrumbs: React.FC<{
  items: Array<{ label: string; href?: string }>;
  className?: string;
}> = ({ items, className }) => {
  return (
    <Breadcrumbs
      items={items.map((item, index) => ({
        ...item,
        current: index === items.length - 1,
      }))}
      className={className}
    />
  );
};

/**
 * Breadcrumb component with dropdown for truncated items
 */
export const BreadcrumbsWithDropdown: React.FC<{
  items: BreadcrumbItem[];
  maxItems?: number;
  className?: string;
}> = ({ items, maxItems = 4, className }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (items.length <= maxItems) {
    return <Breadcrumbs items={items} className={className} />;
  }

  // Show first item, dropdown, and last few items
  const firstItem = items[0];
  const lastItems = items.slice(-(maxItems - 2));
  const hiddenItems = items.slice(1, -(maxItems - 2));

  return (
    <nav className={cn('flex items-center space-x-2', className)} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {/* First item */}
        <li className="flex items-center">
          {firstItem.href ? (
            <Link
              href={firstItem.href}
              className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Home className="w-4 h-4 mr-1" />
              {firstItem.label}
            </Link>
          ) : (
            <span className="inline-flex items-center text-sm font-medium text-gray-500">
              <Home className="w-4 h-4 mr-1" />
              {firstItem.label}
            </span>
          )}
        </li>

        {/* Separator */}
        <li>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </li>

        {/* Dropdown for hidden items */}
        <li className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center px-2 py-1 text-sm font-medium text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
            aria-expanded={isOpen}
            aria-haspopup="true"
          >
            ...
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 z-10 mt-1 bg-white border border-gray-200 rounded-md shadow-lg min-w-[200px]">
              <div className="py-1">
                {hiddenItems.map((item, index) => (
                  <div key={index}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="block px-4 py-2 text-sm text-gray-700">
                        {item.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </li>

        {/* Separator */}
        <li>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </li>

        {/* Last items */}
        {lastItems.map((item, index) => (
          <React.Fragment key={index}>
            <li className="flex items-center">
              {item.href && !item.current ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="inline-flex items-center text-sm font-medium text-gray-900"
                  aria-current="page"
                >
                  {item.label}
                </span>
              )}
            </li>

            {/* Separator for non-last items */}
            {index < lastItems.length - 1 && (
              <li>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
};

/**
 * Hook for building breadcrumb items from pathname
 */
export const useBreadcrumbs = (
  pathname: string,
  pathLabels?: Record<string, string>
): BreadcrumbItem[] => {
  return React.useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [
      {
        label: pathLabels?.[''] || 'Home',
        href: '/',
      },
    ];

    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;
      
      items.push({
        label: pathLabels?.[segment] || segment.charAt(0).toUpperCase() + segment.slice(1),
        href: isLast ? undefined : currentPath,
        current: isLast,
      });
    });

    return items;
  }, [pathname, pathLabels]);
};

/**
 * Breadcrumb component that automatically generates items from current path
 */
export const AutoBreadcrumbs: React.FC<{
  pathname: string;
  pathLabels?: Record<string, string>;
  className?: string;
}> = ({ pathname, pathLabels, className }) => {
  const items = useBreadcrumbs(pathname, pathLabels);
  
  return <Breadcrumbs items={items} className={className} />;
};

// Click outside hook for dropdown
function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  handler: () => void
) {
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, handler]);
}

export default Breadcrumbs;