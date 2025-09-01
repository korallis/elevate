'use client';

import React, { useState } from 'react';
import { Button, Card, Container, Section, Badge } from '@/components/ui/design-system';
import { ShareButton, ShareDialog, InviteDialog } from '@/components/sharing';
import { type ResourceType } from '@/lib/sharing';

const demoResources = [
  {
    id: 'dashboard-1',
    type: 'dashboard' as ResourceType,
    name: 'Sales Analytics Dashboard',
    description: 'Comprehensive sales performance metrics and trends',
    icon: '📊',
  },
  {
    id: 'query-1',
    type: 'query' as ResourceType,
    name: 'Monthly Revenue Query',
    description: 'SQL query to calculate monthly recurring revenue',
    icon: '🔍',
  },
  {
    id: 'report-1',
    type: 'report' as ResourceType,
    name: 'Q4 Performance Report',
    description: 'Quarterly business performance analysis',
    icon: '📋',
  },
  {
    id: 'dataset-1',
    type: 'dataset' as ResourceType,
    name: 'Customer Behavior Dataset',
    description: 'Anonymized customer interaction data',
    icon: '🗂️',
  },
  {
    id: 'table-1',
    type: 'table' as ResourceType,
    name: 'users_activity',
    description: 'Database table containing user activity logs',
    icon: '🗄️',
  },
];

export default function SharingDemoPage() {
  const [selectedResource, setSelectedResource] = useState<typeof demoResources[0] | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const handleOpenShareDialog = (resource: typeof demoResources[0]) => {
    setSelectedResource(resource);
    setIsShareDialogOpen(true);
  };

  const handleCloseShareDialog = () => {
    setIsShareDialogOpen(false);
    setSelectedResource(null);
  };

  const handleOpenInviteDialog = () => {
    setIsInviteDialogOpen(true);
  };

  const handleCloseInviteDialog = () => {
    setIsInviteDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Container size="lg">
        <Section spacing="lg">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">
              🤝 Sharing System Demo
            </h1>
            <p className="text-xl text-foreground-muted max-w-2xl mx-auto">
              Explore the comprehensive sharing system for organizations, departments, and users.
              Share dashboards, queries, reports, datasets, and tables with granular permissions.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            <Button
              variant="primary"
              onClick={handleOpenInviteDialog}
              className="gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Invite New User
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.location.href = '/design-system-demo'}
              className="gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
              </svg>
              Design System
            </Button>
          </div>

          {/* Features Overview */}
          <Card variant="premium" padding="lg" className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-center">
              ✨ Sharing Features
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: '👥',
                  title: 'Multi-Level Sharing',
                  description: 'Share with users, departments, or entire organizations',
                },
                {
                  icon: '🔐',
                  title: 'Granular Permissions',
                  description: 'View, Edit, and Admin access levels for precise control',
                },
                {
                  icon: '✉️',
                  title: 'Invite System',
                  description: 'Send invitations to new users with custom messages',
                },
                {
                  icon: '📊',
                  title: 'Access Management',
                  description: 'View and manage all shares with real-time updates',
                },
              ].map((feature, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl mb-3">{feature.icon}</div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-foreground-muted">{feature.description}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Demo Resources */}
          <div>
            <h2 className="text-2xl font-semibold mb-6">
              📁 Demo Resources
            </h2>
            <p className="text-foreground-muted mb-8">
              Click the share button on any resource to test the sharing functionality.
              Each resource type supports different sharing scenarios.
            </p>

            <div className="grid gap-6">
              {demoResources.map((resource) => (
                <Card
                  key={resource.id}
                  variant="default"
                  padding="md"
                  className="hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="text-3xl flex-shrink-0">
                        {resource.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{resource.name}</h3>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {resource.type}
                          </Badge>
                        </div>
                        <p className="text-foreground-muted mb-4">{resource.description}</p>
                        <div className="flex items-center gap-2 text-sm text-foreground-muted">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                            Created by Admin
                          </span>
                          <span>•</span>
                          <span>2 days ago</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {/* Different button variants for demonstration */}
                      {resource.id === 'dashboard-1' && (
                        <ShareButton
                          resourceType={resource.type}
                          resourceId={resource.id}
                          resourceName={resource.name}
                          variant="default"
                        />
                      )}
                      {resource.id === 'query-1' && (
                        <ShareButton
                          resourceType={resource.type}
                          resourceId={resource.id}
                          resourceName={resource.name}
                          variant="compact"
                        />
                      )}
                      {resource.id === 'report-1' && (
                        <ShareButton
                          resourceType={resource.type}
                          resourceId={resource.id}
                          resourceName={resource.name}
                          variant="icon"
                        />
                      )}
                      {(resource.id === 'dataset-1' || resource.id === 'table-1') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenShareDialog(resource)}
                          className="gap-2"
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
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Technical Details */}
          <Card variant="minimal" padding="lg" className="mt-12">
            <h2 className="text-xl font-semibold mb-4">🛠️ Technical Implementation</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold mb-3">Database Schema</h3>
                <ul className="space-y-2 text-sm text-foreground-muted">
                  <li>• <code className="text-primary">resource_shares</code> - Main sharing relationships</li>
                  <li>• <code className="text-primary">share_invitations</code> - User invitation system</li>
                  <li>• <code className="text-primary">audit_logs</code> - Comprehensive activity tracking</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-3">API Endpoints</h3>
                <ul className="space-y-2 text-sm text-foreground-muted">
                  <li>• <code className="text-primary">POST /sharing/share</code> - Create shares</li>
                  <li>• <code className="text-primary">GET /sharing/:type/:id</code> - List shares</li>
                  <li>• <code className="text-primary">PUT /sharing/:id</code> - Update permissions</li>
                  <li>• <code className="text-primary">POST /sharing/invite</code> - Send invitations</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Footer */}
          <div className="text-center mt-12 pt-8 border-t border-card-border">
            <p className="text-foreground-muted">
              Built with Next.js 15, React 19, TypeScript, and Glassmorphic Design System
            </p>
          </div>
        </Section>
      </Container>

      {/* Dialogs */}
      {selectedResource && (
        <ShareDialog
          isOpen={isShareDialogOpen}
          onClose={handleCloseShareDialog}
          resourceType={selectedResource.type}
          resourceId={selectedResource.id}
          resourceName={selectedResource.name}
        />
      )}

      <InviteDialog
        isOpen={isInviteDialogOpen}
        onClose={handleCloseInviteDialog}
      />
    </div>
  );
}