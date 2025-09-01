'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Input, Card } from '../ui/design-system';
import { cn } from '@/lib/utils';
import { type ShareType, useRecipients, getShareTypeIcon } from '@/lib/sharing';

interface ShareRecipientsProps {
  selectedRecipient: {
    id: number;
    name: string;
    type: ShareType;
  } | null;
  onRecipientChange: (recipient: {
    id: number;
    name: string;
    type: ShareType;
  } | null) => void;
  className?: string;
}

export function ShareRecipients({
  selectedRecipient,
  onRecipientChange,
  className,
}: ShareRecipientsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ShareType | 'all'>('all');
  
  const { recipients, loading, error, fetchRecipients } = useRecipients();

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  // Filter and search recipients
  const filteredRecipients = useMemo(() => {
    let filtered = recipients;

    // Apply type filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === activeFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.name.toLowerCase().includes(query) ||
        (r.email && r.email.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [recipients, activeFilter, searchQuery]);

  const recipientsByType = useMemo(() => {
    const grouped = filteredRecipients.reduce((acc, recipient) => {
      if (!acc[recipient.type]) {
        acc[recipient.type] = [];
      }
      acc[recipient.type].push(recipient);
      return acc;
    }, {} as Record<ShareType, typeof recipients>);

    // Sort each group by name
    Object.keys(grouped).forEach(type => {
      grouped[type as ShareType].sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [filteredRecipients]);

  const getTypeLabel = (type: ShareType): string => {
    switch (type) {
      case 'user':
        return 'Users';
      case 'department':
        return 'Departments';
      case 'organization':
        return 'Organizations';
      default:
        return type;
    }
  };

  const getTypeCounts = () => {
    const counts = recipients.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {} as Record<ShareType, number>);
    
    return {
      all: recipients.length,
      ...counts,
    };
  };

  const counts = getTypeCounts();

  if (error) {
    return (
      <Card variant="default" padding="md" className={cn('text-center', className)}>
        <p className="text-destructive text-sm">{error}</p>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search */}
      <Input
        type="text"
        placeholder="Search users, departments, or organizations..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full"
      />

      {/* Type Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { id: 'all', label: 'All', icon: '📁' },
          { id: 'user', label: 'Users', icon: getShareTypeIcon('user') },
          { id: 'department', label: 'Departments', icon: getShareTypeIcon('department') },
          { id: 'organization', label: 'Organizations', icon: getShareTypeIcon('organization') },
        ].map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id as ShareType | 'all')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              'border',
              activeFilter === filter.id
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-card/20 border-card-border text-foreground-muted hover:text-foreground hover:bg-card/40'
            )}
          >
            <span>{filter.icon}</span>
            <span>
              {filter.label}
              {counts[filter.id as keyof typeof counts] && (
                <span className="ml-1 text-xs opacity-70">
                  ({counts[filter.id as keyof typeof counts]})
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Recipients List */}
      <Card variant="default" padding="sm" className="max-h-64 overflow-y-auto">
        {loading ? (
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
            <span className="ml-2 text-sm text-foreground-muted">Loading recipients...</span>
          </div>
        ) : filteredRecipients.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-foreground-muted text-sm">
              {searchQuery ? 'No recipients found matching your search.' : 'No recipients available.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(recipientsByType).map(([type, typeRecipients]) => {
              if (typeRecipients.length === 0) return null;
              
              return (
                <div key={type}>
                  <h4 className="text-xs font-semibold text-foreground-muted mb-2 flex items-center gap-2">
                    <span>{getShareTypeIcon(type as ShareType)}</span>
                    {getTypeLabel(type as ShareType)} ({typeRecipients.length})
                  </h4>
                  <div className="space-y-1">
                    {typeRecipients.map((recipient) => (
                      <button
                        key={`${recipient.type}-${recipient.id}`}
                        onClick={() => onRecipientChange(recipient)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                          'hover:bg-card/40 focus:outline-none focus:ring-2 focus:ring-primary/20',
                          selectedRecipient?.id === recipient.id && selectedRecipient?.type === recipient.type
                            ? 'bg-primary/15 border border-primary/30'
                            : 'bg-transparent border border-transparent'
                        )}
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-card border border-card-border flex items-center justify-center text-sm">
                          {getShareTypeIcon(recipient.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{recipient.name}</p>
                          {recipient.email && (
                            <p className="text-xs text-foreground-muted truncate">{recipient.email}</p>
                          )}
                        </div>
                        {selectedRecipient?.id === recipient.id && selectedRecipient?.type === recipient.type && (
                          <svg
                            className="w-5 h-5 text-primary flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Selected Recipient Summary */}
      {selectedRecipient && (
        <Card variant="default" padding="md" className="bg-primary/10 border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">
              {getShareTypeIcon(selectedRecipient.type)}
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">
                Selected: {selectedRecipient.name}
              </p>
              <p className="text-xs text-foreground-muted capitalize">
                {selectedRecipient.type}
              </p>
            </div>
            <button
              onClick={() => onRecipientChange(null)}
              className="text-primary hover:text-primary/80 transition-colors"
              title="Clear selection"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}