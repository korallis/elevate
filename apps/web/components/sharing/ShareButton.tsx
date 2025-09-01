'use client';

import React, { useState } from 'react';
import { Button, Badge } from '../ui/design-system';
import { cn } from '@/lib/utils';
import { type ResourceType, useShares } from '@/lib/sharing';
import { ShareDialog } from './ShareDialog';

interface ShareButtonProps {
  resourceType: ResourceType;
  resourceId: string;
  resourceName?: string;
  variant?: 'default' | 'compact' | 'icon';
  className?: string;
  disabled?: boolean;
}

export function ShareButton({
  resourceType,
  resourceId,
  resourceName,
  variant = 'default',
  className,
  disabled = false,
}: ShareButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { shares } = useShares(resourceType, resourceId);

  const handleOpenDialog = () => {
    if (!disabled) {
      setIsDialogOpen(true);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
  };

  const shareCount = shares?.length || 0;

  if (variant === 'icon') {
    return (
      <>
        <Button
          variant="ghost"
          size="icon-md"
          onClick={handleOpenDialog}
          disabled={disabled}
          className={cn(className)}
          title={shareCount > 0 ? `Shared with ${shareCount} recipients` : 'Share resource'}
        >
          <div className="relative">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
              />
            </svg>
            {shareCount > 0 && (
              <Badge
                variant="default"
                className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 text-xs flex items-center justify-center"
              >
                {shareCount}
              </Badge>
            )}
          </div>
        </Button>

        <ShareDialog
          isOpen={isDialogOpen}
          onClose={handleCloseDialog}
          resourceType={resourceType}
          resourceId={resourceId}
          resourceName={resourceName}
        />
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenDialog}
          disabled={disabled}
          className={cn('gap-2', className)}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
            />
          </svg>
          Share
          {shareCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {shareCount}
            </Badge>
          )}
        </Button>

        <ShareDialog
          isOpen={isDialogOpen}
          onClose={handleCloseDialog}
          resourceType={resourceType}
          resourceId={resourceId}
          resourceName={resourceName}
        />
      </>
    );
  }

  // Default variant
  return (
    <>
      <Button
        variant="secondary"
        onClick={handleOpenDialog}
        disabled={disabled}
        className={cn('gap-2', className)}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
          />
        </svg>
        Share
        {shareCount > 0 && (
          <>
            <span className="text-foreground-muted">•</span>
            <Badge variant="secondary" className="text-xs">
              {shareCount} shared
            </Badge>
          </>
        )}
      </Button>

      <ShareDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        resourceType={resourceType}
        resourceId={resourceId}
        resourceName={resourceName}
      />
    </>
  );
}