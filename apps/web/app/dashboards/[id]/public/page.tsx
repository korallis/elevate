'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DashboardBuilder } from '@/components/dashboard/DashboardBuilder';
import { Button } from '@/components/ui/design-system';
import { 
  Download, 
  Share, 
  Maximize, 
  Minimize, 
  ExternalLink,
  Eye 
} from 'lucide-react';

interface PublicDashboard {
  id: string;
  name: string;
  description?: string;
  widgets: any[];
  filters: any[];
  theme: any;
  layout: any;
  isPublic: boolean;
  createdBy: string;
}

export default function PublicDashboardPage() {
  const params = useParams();
  const dashboardId = params?.id as string;

  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const loadPublicDashboard = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // In a real implementation, this would call your API to get public dashboard data
        // For demo purposes, we'll simulate a response
        await new Promise(resolve => setTimeout(resolve, 1000));

        const mockDashboard: PublicDashboard = {
          id: dashboardId,
          name: 'Sales Performance Dashboard',
          description: 'Real-time sales metrics and analytics',
          widgets: [],
          filters: [],
          theme: {
            mode: 'dark',
            primary: 'hsl(252, 60%, 65%)',
            accent: 'hsl(163, 50%, 45%)',
            background: 'hsl(240, 10%, 3.9%)',
            surface: 'hsl(240, 10%, 12%)',
            text: 'hsl(0, 0%, 95%)',
            border: 'hsl(240, 10%, 20%)'
          },
          layout: {},
          isPublic: true,
          createdBy: 'Demo User'
        };

        setDashboard(mockDashboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    if (dashboardId) {
      loadPublicDashboard();
    }
  }, [dashboardId]);

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
    console.log('Exporting public dashboard as', format, dashboardData);
    alert(`Exporting dashboard as ${format.toUpperCase()}... (Not implemented in demo)`);
  };

  const handleShare = async (dashboardData: any) => {
    const shareUrl = window.location.href;
    
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
          <div className="text-foreground-muted">Loading public dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-400 mb-4">⚠️</div>
          <h2 className="text-xl font-semibold mb-2">Dashboard Unavailable</h2>
          <p className="text-foreground-muted mb-4">
            {error === 'Failed to load dashboard' 
              ? 'This dashboard is not publicly accessible or does not exist.'
              : error
            }
          </p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <Eye className="w-16 h-16 text-foreground-muted mx-auto mb-4" />
          <div className="text-foreground-muted mb-4">Dashboard not found</div>
        </div>
      </div>
    );
  }

  if (!dashboard.isPublic) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-yellow-400 mb-4">🔒</div>
          <h2 className="text-xl font-semibold mb-2">Private Dashboard</h2>
          <p className="text-foreground-muted mb-4">
            This dashboard is private and cannot be accessed without proper permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'} overflow-hidden bg-background`}>
      {/* Header */}
      {!isFullscreen && (
        <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/90 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-xs text-foreground-muted uppercase tracking-wide">Public</span>
            </div>
            <div>
              <h1 className="font-semibold">{dashboard.name}</h1>
              {dashboard.description && (
                <div className="text-sm text-foreground-muted">
                  {dashboard.description}
                </div>
              )}
              <div className="text-xs text-foreground-muted mt-1">
                Created by {dashboard.createdBy}
              </div>
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
              onClick={() => handleExport(dashboard, 'pdf')}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleShare(dashboard)}
            >
              <Share className="w-4 h-4 mr-2" />
              Share
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => window.open('/', '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Create Your Own
            </Button>
          </div>
        </div>
      )}

      {/* Fullscreen Controls */}
      {isFullscreen && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExport(dashboard, 'pdf')}
            className="bg-background/80 backdrop-blur-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleShare(dashboard)}
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

      {/* Public Dashboard Badge */}
      {isFullscreen && (
        <div className="absolute top-4 left-4 z-10">
          <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-2 rounded-lg">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-sm font-medium">Public Dashboard</span>
          </div>
        </div>
      )}

      {/* Dashboard Viewer */}
      <div className="flex-1 overflow-hidden">
        <DashboardBuilder
          initialDashboard={dashboard}
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

      {/* Attribution Footer */}
      {!isFullscreen && (
        <div className="border-t border-card-border bg-background/50 px-4 py-2">
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>Public dashboard view - Data updates in real-time</span>
            <span>Powered by Elev8 Analytics</span>
          </div>
        </div>
      )}
    </div>
  );
}