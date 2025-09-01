'use client';

import React, { useState } from 'react';
import { Button, Card, Badge } from '../ui/design-system';
import { cn } from '@/lib/utils';
import {
  type ResourceType,
  type ResourceShare,
  type Permission,
  useUpdateShare,
  useRevokeShare,
  getShareTypeIcon,
  getPermissionLabel,
} from '@/lib/sharing';
import { SharePermissions } from './SharePermissions';

interface ShareListProps {
  resourceType: ResourceType;
  resourceId: string;
  shares: ResourceShare[];
  loading?: boolean;
  onShareUpdated?: () => void;
  className?: string;
}

export function ShareList({
  resourceType,
  resourceId,
  shares,
  loading = false,
  onShareUpdated,
  className,
}: ShareListProps) {
  const [editingShareId, setEditingShareId] = useState<number | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Permission[]>([]);

  const { updateShare, loading: updateLoading } = useUpdateShare();
  const { revokeShare, loading: revokeLoading } = useRevokeShare();

  const handleEditPermissions = (share: ResourceShare) => {
    setEditingShareId(share.id);
    setEditingPermissions(share.permissions);
  };

  const handleSavePermissions = async () => {
    if (editingShareId === null) return;

    try {
      await updateShare(editingShareId, editingPermissions);
      setEditingShareId(null);
      onShareUpdated?.();
    } catch (error) {
      console.error('Failed to update share:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingShareId(null);
    setEditingPermissions([]);
  };

  const handleRevokeAccess = async (shareId: number) => {
    if (!confirm('Are you sure you want to revoke access? This action cannot be undone.')) {
      return;
    }

    try {
      await revokeShare(shareId);
      onShareUpdated?.();
    } catch (error) {
      console.error('Failed to revoke share:', error);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} hours ago`;
    } else if (diffInHours < 168) { // 7 days
      return `${Math.floor(diffInHours / 24)} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <Card variant="default" padding="md" className={cn('text-center', className)}>
        <div className="flex items-center justify-center py-8">
          <svg className="w-6 h-6 animate-spin text-primary" viewBox="0 0 24 24">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              className="opacity-25"
              fill="none"
            />
            <path
              fill="currentColor"
              className="opacity-75"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="ml-2 text-sm text-foreground-muted">Loading shares...</span>
        </div>
      </Card>
    );
  }

  if (shares.length === 0) {
    return (
      <Card variant="default" padding="md" className={cn('text-center', className)}>
        <div className="py-8">
          <svg
            className="w-12 h-12 mx-auto text-foreground-muted mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
            />
          </svg>
          <h3 className="text-foreground font-medium mb-2">No shares yet</h3>
          <p className="text-foreground-muted text-sm">
            This resource hasn't been shared with anyone yet. Use the Share tab to give others access.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {shares.map((share) => (
        <Card
          key={share.id}
          variant="default"
          padding="md"
          className="relative"
        >
          {editingShareId === share.id ? (
            // Edit Mode
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-card border border-card-border flex items-center justify-center text-sm">
                  {getShareTypeIcon(share.share_type)}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-foreground">{share.recipient_name}</h4>
                  <p className="text-xs text-foreground-muted capitalize">
                    {share.share_type}
                    {share.recipient_email && ` • ${share.recipient_email}`}
                  </p>
                </div>
              </div>

              <SharePermissions
                permissions={editingPermissions}
                onChange={setEditingPermissions}
                disabled={updateLoading}
              />

              <div className="flex justify-end gap-2 pt-4 border-t border-card-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={updateLoading}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSavePermissions}
                  disabled={updateLoading}
                >
                  {updateLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          ) : (
            // View Mode
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center">
                  {getShareTypeIcon(share.share_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-foreground">{share.recipient_name}</h4>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {share.share_type}
                    </Badge>
                  </div>
                  {share.recipient_email && (
                    <p className="text-sm text-foreground-muted mb-2">{share.recipient_email}</p>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    {share.permissions.map((permission) => (
                      <Badge
                        key={permission}
                        variant={
                          permission === 'admin'
                            ? 'destructive'
                            : permission === 'edit'
                            ? 'warning'
                            : 'default'
                        }
                        className="text-xs"
                      >
                        {getPermissionLabel(permission)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-foreground-muted">
                    Shared {formatDate(share.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditPermissions(share)}
                  disabled={revokeLoading}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeAccess(share.id)}
                  disabled={revokeLoading}
                  className="text-destructive hover:text-destructive/80"
                >
                  {revokeLoading ? (
                    <>
                      <svg className="w-4 h-4 mr-1 animate-spin" viewBox="0 0 24 24">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          className="opacity-25"
                          fill="none"
                        />
                        <path
                          fill="currentColor"
                          className="opacity-75"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Removing...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Revoke
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}