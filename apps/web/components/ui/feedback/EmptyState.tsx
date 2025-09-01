import React from 'react';
import { 
  Database, 
  Search, 
  FileX, 
  Users, 
  BarChart3, 
  Settings,
  Plus,
  RefreshCw,
  AlertCircle 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * Generic empty state component
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 text-center',
      'min-h-[300px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-300',
      className
    )}>
      {icon && (
        <div className="flex items-center justify-center w-16 h-16 bg-gray-200 rounded-full mb-4">
          {React.cloneElement(icon as React.ReactElement, {
            className: 'w-8 h-8 text-gray-400',
          })}
        </div>
      )}
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-gray-600 max-w-sm mb-6">
          {description}
        </p>
      )}
      
      <div className="flex flex-col sm:flex-row gap-3">
        {action && (
          <button
            onClick={action.onClick}
            className={cn(
              'inline-flex items-center px-4 py-2 rounded-lg font-medium transition-colors',
              action.variant === 'secondary'
                ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {action.label}
          </button>
        )}
        
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="inline-flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Empty state for no data/results
 */
export const NoDataEmptyState: React.FC<{
  title?: string;
  description?: string;
  onRefresh?: () => void;
  onCreate?: () => void;
  createLabel?: string;
  className?: string;
}> = ({ 
  title = 'No data available',
  description = 'There is no data to display at this time.',
  onRefresh,
  onCreate,
  createLabel = 'Create new',
  className 
}) => {
  return (
    <EmptyState
      icon={<Database />}
      title={title}
      description={description}
      action={onCreate ? {
        label: createLabel,
        onClick: onCreate,
      } : undefined}
      secondaryAction={onRefresh ? {
        label: 'Refresh',
        onClick: onRefresh,
      } : undefined}
      className={className}
    />
  );
};

/**
 * Empty state for search results
 */
export const NoSearchResultsEmptyState: React.FC<{
  searchTerm: string;
  onClearSearch: () => void;
  className?: string;
}> = ({ searchTerm, onClearSearch, className }) => {
  return (
    <EmptyState
      icon={<Search />}
      title="No results found"
      description={`No results found for "${searchTerm}". Try adjusting your search terms.`}
      action={{
        label: 'Clear search',
        onClick: onClearSearch,
        variant: 'secondary',
      }}
      className={className}
    />
  );
};

/**
 * Empty state for dashboards
 */
export const NoDashboardsEmptyState: React.FC<{
  onCreate: () => void;
  className?: string;
}> = ({ onCreate, className }) => {
  return (
    <EmptyState
      icon={<BarChart3 />}
      title="No dashboards yet"
      description="Create your first dashboard to start visualizing your data and gaining insights."
      action={{
        label: 'Create Dashboard',
        onClick: onCreate,
      }}
      className={className}
    />
  );
};

/**
 * Empty state for users/team members
 */
export const NoUsersEmptyState: React.FC<{
  onInvite: () => void;
  className?: string;
}> = ({ onInvite, className }) => {
  return (
    <EmptyState
      icon={<Users />}
      title="No team members"
      description="Invite team members to collaborate and share insights together."
      action={{
        label: 'Invite Members',
        onClick: onInvite,
      }}
      className={className}
    />
  );
};

/**
 * Empty state for configuration/settings
 */
export const NoConfigEmptyState: React.FC<{
  onConfigure: () => void;
  title?: string;
  description?: string;
  className?: string;
}> = ({ 
  onConfigure, 
  title = 'Configuration needed',
  description = 'Complete the setup to get started.',
  className 
}) => {
  return (
    <EmptyState
      icon={<Settings />}
      title={title}
      description={description}
      action={{
        label: 'Configure',
        onClick: onConfigure,
      }}
      className={className}
    />
  );
};

/**
 * Empty state for files/documents
 */
export const NoFilesEmptyState: React.FC<{
  onUpload?: () => void;
  onCreate?: () => void;
  title?: string;
  description?: string;
  className?: string;
}> = ({ 
  onUpload,
  onCreate,
  title = 'No files',
  description = 'Upload files or create new ones to get started.',
  className 
}) => {
  const action = onUpload ? {
    label: 'Upload Files',
    onClick: onUpload,
  } : onCreate ? {
    label: 'Create File',
    onClick: onCreate,
  } : undefined;

  return (
    <EmptyState
      icon={<FileX />}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
};

/**
 * Empty state for errors/failed states
 */
export const ErrorEmptyState: React.FC<{
  title?: string;
  description?: string;
  onRetry?: () => void;
  onReset?: () => void;
  className?: string;
}> = ({
  title = 'Something went wrong',
  description = 'An error occurred while loading data. Please try again.',
  onRetry,
  onReset,
  className,
}) => {
  return (
    <EmptyState
      icon={<AlertCircle />}
      title={title}
      description={description}
      action={onRetry ? {
        label: 'Try Again',
        onClick: onRetry,
      } : undefined}
      secondaryAction={onReset ? {
        label: 'Reset',
        onClick: onReset,
      } : undefined}
      className={cn('bg-red-50 border-red-300', className)}
    />
  );
};

/**
 * Empty state with custom content
 */
export const CustomEmptyState: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 text-center',
      'min-h-[300px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-300',
      className
    )}>
      {children}
    </div>
  );
};

/**
 * Loading empty state
 */
export const LoadingEmptyState: React.FC<{
  title?: string;
  description?: string;
  className?: string;
}> = ({
  title = 'Loading...',
  description = 'Please wait while we fetch your data.',
  className,
}) => {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-8 text-center',
      'min-h-[300px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200',
      className
    )}>
      <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      
      <p className="text-gray-600 max-w-sm">
        {description}
      </p>
    </div>
  );
};

export default EmptyState;