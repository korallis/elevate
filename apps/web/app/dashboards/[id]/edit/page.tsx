'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardBuilder } from '@/components/dashboard/DashboardBuilder';
import { useDashboard } from '@/lib/dashboard/useDashboard';
import { Button } from '@/components/ui/design-system';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import Link from 'next/link';

export default function EditDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const dashboardId = params?.id as string;

  const {
    dashboard,
    isLoading,
    error,
    updateDashboard,
    loadDashboard
  } = useDashboard({ dashboardId });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (dashboardId) {
      loadDashboard(dashboardId);
    }
  }, [dashboardId, loadDashboard]);

  const handleSave = async (dashboardData: any) => {
    if (!dashboard?.id) return;

    setIsSaving(true);
    try {
      await updateDashboard(dashboard.id, dashboardData);
    } catch (error) {
      console.error('Failed to save dashboard:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (dashboardData: any, format: 'pdf' | 'png') => {
    // Implementation for dashboard export
    console.log('Exporting dashboard as', format, dashboardData);
    // In a real implementation, this would call an API to generate the export
    alert(`Exporting dashboard as ${format.toUpperCase()}... (Not implemented in demo)`);
  };

  const handleShare = async (dashboardData: any) => {
    // Implementation for dashboard sharing
    console.log('Sharing dashboard', dashboardData);
    // In a real implementation, this would generate a shareable link
    alert('Dashboard sharing... (Not implemented in demo)');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <div className="text-foreground-muted">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-400 mb-4">⚠️</div>
          <h2 className="text-xl font-semibold mb-2">Error Loading Dashboard</h2>
          <p className="text-foreground-muted mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="ghost"
              onClick={() => router.back()}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="text-foreground-muted mb-4">Dashboard not found</div>
          <Link href="/dashboards">
            <Button variant="primary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboards
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const dashboardData = {
    id: dashboard.id,
    name: dashboard.name,
    description: dashboard.description,
    widgets: [], // Would be loaded from dashboard_widgets table
    filters: dashboard.filters as any[],
    theme: dashboard.theme as any,
    layout: dashboard.layout
  };

  return (
    <div className="h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/90 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/dashboards">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-semibold">Editing: {dashboard.name}</h1>
            <div className="text-sm text-foreground-muted">
              {isSaving ? 'Saving...' : 'Auto-saves your changes'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/dashboards/${dashboard.id}/view`}>
            <Button variant="ghost" size="sm">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </Link>
          
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSave(dashboardData)}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Dashboard Builder */}
      <div className="flex-1 overflow-hidden">
        <DashboardBuilder
          initialDashboard={dashboardData}
          onSave={handleSave}
          onExport={handleExport}
          onShare={handleShare}
          isReadOnly={false}
        />
      </div>
    </div>
  );
}