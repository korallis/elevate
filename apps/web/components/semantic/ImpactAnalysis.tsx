'use client';

import React, { useState, useEffect } from 'react';
import { Button } from 'ui/Button';
import { Card } from 'ui/Card';

interface ImpactedEntity {
  type: string;
  id: string;
  name: string;
}

interface ImpactAnalysisData {
  directDependencies: ImpactedEntity[];
  indirectDependencies: ImpactedEntity[];
}

interface ImpactAnalysisProps {
  entityType: 'metric' | 'dimension';
  entityId: string;
  entityName: string;
  onAnalyzeImpact: (entityType: 'metric' | 'dimension', entityId: string) => Promise<ImpactAnalysisData>;
}

export function ImpactAnalysis({
  entityType,
  entityId,
  entityName,
  onAnalyzeImpact,
}: ImpactAnalysisProps) {
  const [impactData, setImpactData] = useState<ImpactAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['direct']));

  useEffect(() => {
    loadImpactAnalysis();
  }, [entityType, entityId]);

  const loadImpactAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await onAnalyzeImpact(entityType, entityId);
      setImpactData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze impact');
      setImpactData(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const getEntityTypeIcon = (type: string) => {
    switch (type) {
      case 'query': return '📊';
      case 'dashboard': return '📈';
      case 'report': return '📋';
      case 'metric': return '🔢';
      case 'dimension': return '📏';
      default: return '📄';
    }
  };

  const getEntityTypeColor = (type: string) => {
    switch (type) {
      case 'query': return 'bg-blue-100 text-blue-800';
      case 'dashboard': return 'bg-green-100 text-green-800';
      case 'report': return 'bg-purple-100 text-purple-800';
      case 'metric': return 'bg-orange-100 text-orange-800';
      case 'dimension': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const groupEntitiesByType = (entities: ImpactedEntity[]) => {
    const groups: Record<string, ImpactedEntity[]> = {};
    entities.forEach(entity => {
      if (!groups[entity.type]) {
        groups[entity.type] = [];
      }
      groups[entity.type].push(entity);
    });
    return groups;
  };

  const EntityCard = ({ entity }: { entity: ImpactedEntity }) => (
    <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
      <span className="text-xl">{getEntityTypeIcon(entity.type)}</span>
      <div className="flex-1">
        <div className="font-medium">{entity.name}</div>
        <div className="text-sm text-gray-500">ID: {entity.id}</div>
      </div>
      <span className={`px-2 py-1 text-xs rounded ${getEntityTypeColor(entity.type)}`}>
        {entity.type}
      </span>
    </div>
  );

  const EntityGroup = ({ 
    title, 
    entities, 
    sectionKey 
  }: { 
    title: string; 
    entities: ImpactedEntity[]; 
    sectionKey: string;
  }) => {
    const isExpanded = expandedSections.has(sectionKey);
    const groupedEntities = groupEntitiesByType(entities);

    return (
      <Card className="p-4">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection(sectionKey)}
        >
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <span>{title}</span>
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
              {entities.length}
            </span>
          </h3>
          <Button variant="outline" size="sm">
            {isExpanded ? '▼' : '▶'}
          </Button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {Object.keys(groupedEntities).length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                No {title.toLowerCase()} found
              </div>
            ) : (
              Object.entries(groupedEntities).map(([type, typeEntities]) => (
                <div key={type}>
                  <h4 className="font-medium mb-2 flex items-center space-x-2">
                    <span className="text-lg">{getEntityTypeIcon(type)}</span>
                    <span className="capitalize">{type}s</span>
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                      {typeEntities.length}
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {typeEntities.map((entity) => (
                      <EntityCard key={`${entity.type}-${entity.id}`} entity={entity} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
    );
  };

  const totalImpacted = impactData 
    ? impactData.directDependencies.length + impactData.indirectDependencies.length 
    : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Impact Analysis</h2>
          <p className="text-gray-600">
            {entityType === 'metric' ? 'Metric' : 'Dimension'}: {entityName}
          </p>
        </div>
        <Button onClick={loadImpactAnalysis} disabled={loading}>
          {loading ? 'Analyzing...' : 'Refresh Analysis'}
        </Button>
      </div>

      {/* Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Impact Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{totalImpacted}</div>
            <div className="text-sm text-gray-600">Total Impacted</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">
              {impactData?.directDependencies.length || 0}
            </div>
            <div className="text-sm text-gray-600">Direct Dependencies</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">
              {impactData?.indirectDependencies.length || 0}
            </div>
            <div className="text-sm text-gray-600">Indirect Dependencies</div>
          </div>
        </div>

        {impactData && (
          <div className="mt-6">
            <h4 className="font-medium mb-2">Impact by Type</h4>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const allEntities = [...impactData.directDependencies, ...impactData.indirectDependencies];
                const typeCounts: Record<string, number> = {};
                allEntities.forEach(entity => {
                  typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1;
                });

                return Object.entries(typeCounts).map(([type, count]) => (
                  <span
                    key={type}
                    className={`px-3 py-1 text-sm rounded-full ${getEntityTypeColor(type)}`}
                  >
                    {getEntityTypeIcon(type)} {count} {type}{count !== 1 ? 's' : ''}
                  </span>
                ));
              })()}
            </div>
          </div>
        )}
      </Card>

      {/* Error State */}
      {error && (
        <Card className="p-6 border-red-200 bg-red-50">
          <h3 className="font-semibold text-red-800 mb-2">Analysis Error</h3>
          <p className="text-red-700">{error}</p>
          <Button 
            onClick={loadImpactAnalysis} 
            className="mt-3 bg-red-600 hover:bg-red-700"
            size="sm"
          >
            Retry Analysis
          </Button>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <Card className="p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Analyzing impact...</p>
          </div>
        </Card>
      )}

      {/* Impact Data */}
      {impactData && !loading && (
        <div className="space-y-6">
          {/* Direct Dependencies */}
          <EntityGroup
            title="Direct Dependencies"
            entities={impactData.directDependencies}
            sectionKey="direct"
          />

          {/* Indirect Dependencies */}
          <EntityGroup
            title="Indirect Dependencies"
            entities={impactData.indirectDependencies}
            sectionKey="indirect"
          />

          {/* Impact Guidance */}
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-3">
              Impact Analysis Guidance
            </h3>
            <div className="text-blue-700 space-y-2 text-sm">
              <p>
                <strong>Direct Dependencies:</strong> Items that directly reference this {entityType}. 
                Changes will immediately affect these items.
              </p>
              <p>
                <strong>Indirect Dependencies:</strong> Items that depend on the direct dependencies. 
                Changes may have cascading effects on these items.
              </p>
              <div className="mt-4 p-3 bg-blue-100 rounded">
                <p className="font-medium">Recommendation:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Test all direct dependencies after making changes</li>
                  <li>Consider the impact on indirect dependencies</li>
                  <li>Communicate changes to stakeholders of affected items</li>
                  <li>Use version control to track changes and enable rollbacks</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Export/Actions */}
          <Card className="p-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">Export Impact Analysis</span>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const data = {
                      entityType,
                      entityId,
                      entityName,
                      analysisDate: new Date().toISOString(),
                      totalImpacted,
                      directDependencies: impactData.directDependencies,
                      indirectDependencies: impactData.indirectDependencies,
                    };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `impact-analysis-${entityName}-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(`
                        <html>
                          <head><title>Impact Analysis - ${entityName}</title></head>
                          <body>
                            <h1>Impact Analysis: ${entityName}</h1>
                            <h2>Summary</h2>
                            <p>Total Impacted: ${totalImpacted}</p>
                            <p>Direct Dependencies: ${impactData.directDependencies.length}</p>
                            <p>Indirect Dependencies: ${impactData.indirectDependencies.length}</p>
                            <h2>Direct Dependencies</h2>
                            ${impactData.directDependencies.map(e => `<p>${e.type}: ${e.name} (${e.id})</p>`).join('')}
                            <h2>Indirect Dependencies</h2>
                            ${impactData.indirectDependencies.map(e => `<p>${e.type}: ${e.name} (${e.id})</p>`).join('')}
                          </body>
                        </html>
                      `);
                      printWindow.print();
                    }
                  }}
                >
                  Print Report
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {impactData && totalImpacted === 0 && !loading && (
        <Card className="p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-lg font-semibold mb-2">No Dependencies Found</h3>
          <p className="text-gray-600">
            This {entityType} is not currently being used by any queries, dashboards, or reports. 
            You can safely modify or delete it without impacting other systems.
          </p>
        </Card>
      )}
    </div>
  );
}