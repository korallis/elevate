'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '../ui/design-system';
import { cn } from '@/lib/utils';
import {
  type ResourceType,
  type InvitationRole,
  useInviteUser,
  useRecipients,
  getResourceTypeLabel,
} from '@/lib/sharing';

interface InviteDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
  resourceType?: ResourceType;
  resourceId?: string;
  resourceName?: string;
  embedded?: boolean;
  className?: string;
}

export function InviteDialog({
  isOpen = true,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  embedded = false,
  className,
}: InviteDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitationRole>('viewer');
  const [orgId, setOrgId] = useState<number | undefined>();
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const { inviteUser, loading, error } = useInviteUser();
  const { recipients, fetchRecipients } = useRecipients();

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  const organizations = recipients.filter(r => r.type === 'organization');
  const departments = recipients.filter(r => r.type === 'department');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      await inviteUser({
        email: email.trim(),
        role,
        orgId,
        departmentId,
        resourceType,
        resourceId,
        message: message.trim() || undefined,
      });

      setSuccess(true);
      setEmail('');
      setMessage('');
      
      // Auto-close after success if not embedded
      if (!embedded) {
        setTimeout(() => {
          onClose?.();
          setSuccess(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to send invitation:', error);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setSuccess(false);
    onClose?.();
  };

  const roleOptions: { value: InvitationRole; label: string; description: string; icon: string }[] = [
    {
      value: 'viewer',
      label: 'Viewer',
      description: 'Can view resources and basic information',
      icon: '👁️',
    },
    {
      value: 'editor',
      label: 'Editor',
      description: 'Can view and edit resources',
      icon: '✏️',
    },
    {
      value: 'admin',
      label: 'Admin',
      description: 'Full access including management and sharing',
      icon: '⚡',
    },
  ];

  const content = (
    <div className={cn('space-y-6', !embedded && 'p-6')}>
      {!embedded && (
        <div>
          <h2 className="text-xl font-semibold">Invite New User</h2>
          {resourceType && resourceName && (
            <p className="text-sm text-foreground-muted mt-1">
              Invite someone to access {getResourceTypeLabel(resourceType)}: {resourceName}
            </p>
          )}
        </div>
      )}

      {success ? (
        <Card variant="default" padding="md" className="bg-success/10 border-success/20">
          <div className="flex items-center gap-3">
            <svg
              className="w-6 h-6 text-success"
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
            <div>
              <h3 className="font-medium text-success">Invitation sent!</h3>
              <p className="text-sm text-success/80 mt-1">
                The user will receive an email with instructions to join.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              Email Address *
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              disabled={loading}
              className="w-full"
            />
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Role *
            </label>
            <div className="grid gap-2">
              {roleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  disabled={loading}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                    'hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20',
                    role === option.value
                      ? 'bg-primary/10 border-primary/40'
                      : 'bg-card/20 border-card-border',
                    loading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="text-lg mt-0.5">{option.icon}</span>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{option.label}</h4>
                    <p className="text-sm text-foreground-muted">{option.description}</p>
                  </div>
                  {role === option.value && (
                    <svg
                      className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
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

          {/* Organization Selection */}
          {organizations.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="organization" className="block text-sm font-medium text-foreground">
                Organization (Optional)
              </label>
              <select
                id="organization"
                value={orgId || ''}
                onChange={(e) => setOrgId(e.target.value ? Number(e.target.value) : undefined)}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background/50 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
              >
                <option value="">Select an organization...</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Department Selection */}
          {departments.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="department" className="block text-sm font-medium text-foreground">
                Department (Optional)
              </label>
              <select
                id="department"
                value={departmentId || ''}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : undefined)}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background/50 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
              >
                <option value="">Select a department...</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Message */}
          <div className="space-y-2">
            <label htmlFor="message" className="block text-sm font-medium text-foreground">
              Personal Message (Optional)
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal message to the invitation..."
              rows={3}
              maxLength={500}
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background/50 backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 resize-none"
            />
            <p className="text-xs text-foreground-muted">
              {message.length}/500 characters
            </p>
          </div>

          {error && (
            <Card variant="default" padding="sm" className="bg-destructive/10 border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </Card>
          )}

          <div className="flex justify-end gap-3 pt-4">
            {!embedded && (
              <Button variant="ghost" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!email.trim() || loading}>
              {loading ? (
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
                  Sending Invitation...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Invitation
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card
        variant="premium"
        padding="none"
        className={cn('w-full max-w-lg max-h-[90vh] overflow-y-auto', className)}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-card-border">
          <h2 className="text-xl font-semibold">Invite New User</h2>
          <Button variant="ghost" size="icon-md" onClick={handleClose} disabled={loading}>
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

        {content}
      </Card>
    </div>
  );
}