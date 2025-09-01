'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/design-system';
import { useDashboard } from '@/lib/dashboard/useDashboard';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit,
  Copy,
  Trash2,
  Share,
  Calendar,
  User,
  Eye
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardsPage() {
  const { 
    dashboards, 
    isLoadingList,
    error,
    createDashboard,
    duplicateDashboard,
    deleteDashboard
  } = useDashboard();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'updated' | 'created'>('updated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredDashboards = dashboards
    .filter(dashboard => 
      dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dashboard.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'updated':
          comparison = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
          break;
        case 'created':
          comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  const handleCreateDashboard = async () => {
    try {
      const newDashboard = await createDashboard({
        name: 'New Dashboard',
        description: '',
        layout: {},
        theme: {
          mode: 'dark',
          primary: 'hsl(252, 60%, 65%)',
          accent: 'hsl(163, 50%, 45%)',
          background: 'hsl(240, 10%, 3.9%)',
          surface: 'hsl(240, 10%, 12%)',
          text: 'hsl(0, 0%, 95%)',
          border: 'hsl(240, 10%, 20%)'
        },
        filters: [],
        isPublic: false,
        createdBy: 'current-user' // In real app, get from auth context
      });
      
      // Redirect to the new dashboard builder
      window.location.href = `/dashboards/${newDashboard.id}/edit`;
    } catch (error) {
      console.error('Failed to create dashboard:', error);
    }
  };

  const handleDuplicate = async (id: string, name: string) => {
    try {
      await duplicateDashboard(id, `${name} (Copy)`);
    } catch (error) {
      console.error('Failed to duplicate dashboard:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this dashboard?')) {
      try {
        await deleteDashboard(id);
      } catch (error) {
        console.error('Failed to delete dashboard:', error);
      }
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <div className="text-red-400 mb-4">⚠️</div>
            <h2 className="text-xl font-semibold mb-2">Error Loading Dashboards</h2>
            <p className="text-foreground-muted mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboards</h1>
            <p className="text-foreground-muted">
              Create and manage your analytics dashboards
            </p>
          </div>
          
          <Button
            variant="primary"
            size="md"
            onClick={handleCreateDashboard}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Dashboard
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder="Search dashboards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-card border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'updated' | 'created')}
            className="px-3 py-2 bg-card border border-card-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="updated">Last Updated</option>
            <option value="created">Date Created</option>
            <option value="name">Name</option>
          </select>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>

        {/* Dashboard Grid */}
        {isLoadingList ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-card-border rounded w-3/4 mb-4"></div>
                <div className="h-3 bg-card-border rounded w-1/2 mb-6"></div>
                <div className="h-24 bg-card-border rounded mb-4"></div>
                <div className="flex justify-between items-center">
                  <div className="h-3 bg-card-border rounded w-1/4"></div>
                  <div className="h-8 bg-card-border rounded w-16"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredDashboards.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-card/30 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Eye className="w-8 h-8 text-foreground-muted" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {dashboards.length === 0 ? 'No dashboards yet' : 'No dashboards found'}
            </h3>
            <p className="text-foreground-muted mb-6 max-w-md mx-auto">
              {dashboards.length === 0 
                ? 'Get started by creating your first dashboard to visualize your data.'
                : 'Try adjusting your search terms or filters.'
              }
            </p>
            {dashboards.length === 0 && (
              <Button
                variant="primary"
                onClick={handleCreateDashboard}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Dashboard
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDashboards.map((dashboard) => (
              <div
                key={dashboard.id}
                className="bg-card/50 border border-card-border rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 group"
              >
                {/* Card Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                      {dashboard.name}
                    </h3>
                    
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {dashboard.description && (
                    <p className="text-sm text-foreground-muted line-clamp-2 mb-4">
                      {dashboard.description}
                    </p>
                  )}
                </div>

                {/* Preview/Thumbnail */}
                <div className="px-6 pb-4">
                  <div className="h-24 bg-gradient-to-br from-primary/5 to-accent/5 border border-card-border/50 rounded-lg flex items-center justify-center">
                    <div className="text-xs text-foreground-muted">Dashboard Preview</div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-6 py-4 border-t border-card-border bg-background/20">
                  <div className="flex items-center justify-between text-xs text-foreground-muted mb-3">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(dashboard.updatedAt || dashboard.createdAt || '').toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {dashboard.createdBy}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Link
                      href={`/dashboards/${dashboard.id}/view`}
                      className="flex-1"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </Link>
                    
                    <Link
                      href={`/dashboards/${dashboard.id}/edit`}
                      className="flex-1"
                    >
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    </Link>
                    
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDuplicate(dashboard.id!, dashboard.name)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(dashboard.id!)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results Summary */}
        {!isLoadingList && filteredDashboards.length > 0 && (
          <div className="mt-8 text-center text-sm text-foreground-muted">
            Showing {filteredDashboards.length} of {dashboards.length} dashboards
          </div>
        )}
      </div>
    </div>
  );
}