'use client';

import React from 'react';
import { Button, Badge } from '../ui/design-system';
import { cn } from '@/lib/utils';
import { type Permission, getPermissionLabel } from '@/lib/sharing';

interface SharePermissionsProps {
  permissions: Permission[];
  onChange: (permissions: Permission[]) => void;
  disabled?: boolean;
  className?: string;
}

const permissionConfig: Record<Permission, {
  label: string;
  description: string;
  icon: string;
  color: 'default' | 'warning' | 'destructive';
}> = {
  view: {
    label: 'View',
    description: 'Can view and read the resource',
    icon: '👁️',
    color: 'default',
  },
  edit: {
    label: 'Edit',
    description: 'Can view and modify the resource',
    icon: '✏️',
    color: 'warning',
  },
  admin: {
    label: 'Admin',
    description: 'Full control including sharing and deletion',
    icon: '⚡',
    color: 'destructive',
  },
};

export function SharePermissions({
  permissions,
  onChange,
  disabled = false,
  className,
}: SharePermissionsProps) {
  const isSelected = (permission: Permission) => permissions.includes(permission);

  const togglePermission = (permission: Permission) => {
    if (disabled) return;

    if (permission === 'view') {
      // View permission is always required
      if (permissions.length === 1 && permissions[0] === 'view') {
        return; // Don't allow removing view if it's the only permission
      }
    }

    if (isSelected(permission)) {
      // Remove permission
      const newPermissions = permissions.filter(p => p !== permission);
      // Ensure view is always included if there are other permissions
      if (newPermissions.length > 0 && !newPermissions.includes('view')) {
        newPermissions.unshift('view');
      }
      onChange(newPermissions.length > 0 ? newPermissions : ['view']);
    } else {
      // Add permission
      const newPermissions = [...permissions];
      
      // Auto-add view if not present
      if (!newPermissions.includes('view')) {
        newPermissions.unshift('view');
      }
      
      // Add the new permission
      if (!newPermissions.includes(permission)) {
        newPermissions.push(permission);
      }
      
      onChange(newPermissions);
    }
  };

  const getPermissionHierarchy = (): Permission[] => {
    // Return permissions in order of hierarchy
    if (permissions.includes('admin')) return ['view', 'edit', 'admin'];
    if (permissions.includes('edit')) return ['view', 'edit'];
    return ['view'];
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Permission Level Selector */}
      <div className="grid grid-cols-1 gap-3">
        {(Object.keys(permissionConfig) as Permission[]).map((permission) => {
          const config = permissionConfig[permission];
          const selected = isSelected(permission);
          const hierarchy = getPermissionHierarchy();
          const implicitlyGranted = hierarchy.includes(permission) && !selected;

          return (
            <button
              key={permission}
              onClick={() => togglePermission(permission)}
              disabled={disabled}
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl border transition-all text-left',
                'hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20',
                selected
                  ? 'bg-primary/10 border-primary/40'
                  : implicitlyGranted
                  ? 'bg-card/50 border-card-border/50'
                  : 'bg-card/20 border-card-border',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span className="text-lg mt-0.5">{config.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-foreground">{config.label}</h4>
                  {selected && (
                    <Badge variant={config.color} className="text-xs">
                      Selected
                    </Badge>
                  )}
                  {implicitlyGranted && (
                    <Badge variant="secondary" className="text-xs">
                      Included
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground-muted mt-1">{config.description}</p>
              </div>
              <div className="flex items-center">
                {selected && (
                  <svg
                    className="w-5 h-5 text-primary"
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
              </div>
            </button>
          );
        })}
      </div>

      {/* Permission Summary */}
      <div className="bg-card/30 border border-card-border rounded-lg p-4">
        <h4 className="font-medium text-foreground mb-2">Permission Summary</h4>
        <div className="flex flex-wrap gap-2">
          {getPermissionHierarchy().map((permission) => (
            <Badge
              key={permission}
              variant={permissionConfig[permission].color}
              className="text-xs"
            >
              {permissionConfig[permission].icon} {permissionConfig[permission].label}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-foreground-muted mt-2">
          This recipient will have {getPermissionHierarchy().join(', ').toLowerCase()} access to the resource.
        </p>
      </div>

      {/* Quick Permission Sets */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Quick Selection</h4>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(['view'])}
            disabled={disabled}
          >
            View Only
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(['view', 'edit'])}
            disabled={disabled}
          >
            Can Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(['view', 'edit', 'admin'])}
            disabled={disabled}
          >
            Full Access
          </Button>
        </div>
      </div>
    </div>
  );
}