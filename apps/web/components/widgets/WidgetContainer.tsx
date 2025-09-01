'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/design-system';
import { Settings, X, GripVertical } from 'lucide-react';

export interface WidgetContainerProps {
  title: string;
  children: ReactNode;
  onConfigClick?: () => void;
  onDeleteClick?: () => void;
  isReadOnly?: boolean;
  className?: string;
  headerActions?: ReactNode;
}

export function WidgetContainer({
  title,
  children,
  onConfigClick,
  onDeleteClick,
  isReadOnly = false,
  className = '',
  headerActions
}: WidgetContainerProps) {
  return (
    <div className={`bg-card/50 backdrop-blur-sm border border-card-border rounded-xl overflow-hidden group hover:shadow-lg transition-all ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/20">
        {/* Drag handle - only visible when not read-only */}
        {!isReadOnly && (
          <div className="drag-handle flex items-center cursor-move opacity-0 group-hover:opacity-100 transition-opacity mr-2">
            <GripVertical className="w-4 h-4 text-foreground-muted" />
          </div>
        )}

        <h3 className="font-semibold text-foreground truncate flex-1">
          {title}
        </h3>

        <div className="flex items-center gap-1 ml-2">
          {/* Custom header actions */}
          {headerActions}

          {/* Configuration button */}
          {!isReadOnly && onConfigClick && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onConfigClick}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}

          {/* Delete button */}
          {!isReadOnly && onDeleteClick && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDeleteClick}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}