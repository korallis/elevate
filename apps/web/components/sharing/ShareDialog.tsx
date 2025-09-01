'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '../ui/design-system';
import { cn } from '@/lib/utils';
import {
  type ResourceType,
  type ShareType,
  type Permission,
  useShareResource,
  useShares,
  getResourceTypeLabel,
} from '@/lib/sharing';
import { SharePermissions } from './SharePermissions';
import { ShareRecipients } from './ShareRecipients';
import { ShareList } from './ShareList';
import { InviteDialog } from './InviteDialog';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: ResourceType;
  resourceId: string;
  resourceName?: string;
}

export function ShareDialog({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
}: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<'share' | 'existing' | 'invite'>('share');
  const [selectedRecipient, setSelectedRecipient] = useState<{
    id: number;
    name: string;
    type: ShareType;
  } | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(['view']);

  const { shareResource, loading: shareLoading, error: shareError } = useShareResource();
  const { shares, fetchShares, loading: sharesLoading } = useShares(resourceType, resourceId);

  // Fetch shares when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchShares();
    }
  }, [isOpen, fetchShares]);

  const handleShare = async () => {
    if (!selectedRecipient) return;

    try {
      await shareResource({
        resourceType,
        resourceId,
        shareType: selectedRecipient.type,
        shareWithId: selectedRecipient.id,
        permissions: selectedPermissions,
      });

      // Reset form and refresh shares
      setSelectedRecipient(null);
      setSelectedPermissions(['view']);
      fetchShares();
    } catch (error) {
      console.error('Failed to share resource:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card
        variant="premium"
        padding="none"
        className="w-full max-w-2xl max-h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-card-border">
          <div>
            <h2 className="text-xl font-semibold">
              Share {getResourceTypeLabel(resourceType)}
            </h2>
            {resourceName && <p className="text-sm text-foreground-muted mt-1">{resourceName}</p>}
          </div>
          <Button variant="ghost" size="icon-md" onClick={onClose}>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-card-border bg-card/20">
          {[
            { id: 'share', label: 'Share', icon: '👥' },
            { id: 'existing', label: `Access (${shares.length})`, icon: '🔒' },
            { id: 'invite', label: 'Invite', icon: '✉️' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                'hover:text-foreground hover:bg-card/30',
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary bg-card/40'
                  : 'text-foreground-muted'
              )}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'share' && (
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium">Select recipient</h3>
                <ShareRecipients
                  selectedRecipient={selectedRecipient}
                  onRecipientChange={setSelectedRecipient}
                />
              </div>

              {selectedRecipient && (
                <div className="space-y-4">
                  <h3 className="font-medium">Set permissions</h3>
                  <SharePermissions
                    permissions={selectedPermissions}
                    onChange={setSelectedPermissions}
                  />
                </div>
              )}

              {shareError && (
                <div className="p-3 bg-destructive/15 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{shareError}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleShare}
                  disabled={!selectedRecipient || shareLoading}
                >
                  {shareLoading ? (
                    <>
                      <svg className="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24">
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
                      Sharing...
                    </>
                  ) : (
                    'Share'
                  )}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'existing' && (
            <div className="p-6">
              <ShareList
                resourceType={resourceType}
                resourceId={resourceId}
                shares={shares}
                loading={sharesLoading}
                onShareUpdated={fetchShares}
              />
            </div>
          )}

          {activeTab === 'invite' && (
            <div className="p-6">
              <InviteDialog
                resourceType={resourceType}
                resourceId={resourceId}
                embedded={true}
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}