'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardBuilder } from '@/components/dashboard/DashboardBuilder';
import { useDashboard } from '@/lib/dashboard/useDashboard';
import { Button } from '@/components/ui/design-system';
import { ArrowLeft, Edit, Share, Download, Maximize, Minimize } from 'lucide-react';
import Link from 'next/link';

export default function ViewDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const dashboardId = params?.id as string;

  const {
    dashboard,
    isLoading,
    error,
    loadDashboard
  } = useDashboard({ dashboardId });

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (dashboardId) {
      loadDashboard(dashboardId);
    }
  }, [dashboardId, loadDashboard]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
      if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(!isFullscreen);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isFullscreen]);

  const handleExport = async (dashboardData: any, format: 'pdf' | 'png') => {
    console.log('Exporting dashboard as', format, dashboardData);
    alert(`Exporting dashboard as ${format.toUpperCase()}... (Not implemented in demo)`);
  };

  const handleShare = async (dashboardData: any) => {
    console.log('Sharing dashboard', dashboardData);
    
    // Generate shareable URL
    const shareUrl = `${window.location.origin}/dashboards/${dashboard?.id}/public`;
    
    // Copy to clipboard
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Dashboard URL copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy URL:', err);
        alert(`Share URL: ${shareUrl}`);
      }
    } else {
      alert(`Share URL: ${shareUrl}`);
    }
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
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'} overflow-hidden bg-background`}>
      {/* Header */}
      {!isFullscreen && (
        <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/90 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <Link href="/dashboards">
              <Button variant="ghost" size="icon-sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="font-semibold">{dashboard.name}</h1>
              {dashboard.description && (
                <div className="text-sm text-foreground-muted">
                  {dashboard.description}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsFullscreen(true)}
              title="Fullscreen (F)"
            >
              <Maximize className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleExport(dashboardData, 'pdf')}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleShare(dashboardData)}
            >
              <Share className="w-4 h-4 mr-2" />
              Share
            </Button>
            
            <Link href={`/dashboards/${dashboard.id}/edit`}>
              <Button variant="primary" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Fullscreen Controls */}
      {isFullscreen && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExport(dashboardData, 'pdf')}
            className="bg-background/80 backdrop-blur-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleShare(dashboardData)}
            className="bg-background/80 backdrop-blur-sm"
          >
            <Share className="w-4 h-4 mr-2" />
            Share
          </Button>
          
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsFullscreen(false)}
            className="bg-background/80 backdrop-blur-sm"
            title="Exit Fullscreen (Esc)"
          >
            <Minimize className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Dashboard Viewer */}
      <div className="flex-1 overflow-hidden">
        <DashboardBuilder
          initialDashboard={dashboardData}
          onExport={handleExport}
          onShare={handleShare}
          isReadOnly={true}
        />
      </div>

      {/* Fullscreen Instructions */}
      {isFullscreen && (
        <div className="absolute bottom-4 left-4 text-sm text-foreground-muted bg-background/80 backdrop-blur-sm px-3 py-2 rounded-lg">
          Press <kbd className="bg-card-border px-1 rounded">Esc</kbd> to exit fullscreen
        </div>
      )}
    </div>
  );
}