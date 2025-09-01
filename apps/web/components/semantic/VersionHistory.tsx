'use client';

import React, { useState } from 'react';
import { Button } from 'ui/Button';
import { Card } from 'ui/Card';

interface SemanticVersion {
  id: string;
  entityType: 'metric' | 'dimension';
  entityId: string;
  version: string;
  changes: Record<string, {
    from?: any;
    to?: any;
    changeType: string;
  }>;
  notes?: string;
  impactAnalysis?: {
    affectedQueries: string[];
    affectedDashboards: string[];
    affectedReports: string[];
    breakingChanges: boolean;
    riskLevel: 'low' | 'medium' | 'high';
  };
  createdBy: string;
  createdAt: string;
}

interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: Array<{
    field: string;
    changeType: string;
    fromValue?: any;
    toValue?: any;
    impact?: string;
  }>;
  summary: string;
  breakingChanges: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

interface VersionHistoryProps {
  entityType: 'metric' | 'dimension';
  entityId: string;
  entityName: string;
  versions: SemanticVersion[];
  onCompareVersions: (fromVersion: string, toVersion: string) => Promise<VersionComparison>;
  onRollback: (targetVersion: string, notes?: string) => Promise<void>;
  currentVersion: string;
}

export function VersionHistory({
  entityType,
  entityId,
  entityName,
  versions,
  onCompareVersions,
  onRollback,
  currentVersion,
}: VersionHistoryProps) {
  const [selectedVersions, setSelectedVersions] = useState<[string, string] | null>(null);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState<string | null>(null);
  const [rollbackNotes, setRollbackNotes] = useState('');
  const [loadingRollback, setLoadingRollback] = useState(false);

  const handleVersionSelect = (version: string) => {
    if (!selectedVersions) {
      setSelectedVersions([version, version]);
    } else if (selectedVersions[0] === version) {
      setSelectedVersions(null);
    } else if (selectedVersions[1] === version) {
      setSelectedVersions([selectedVersions[0], selectedVersions[0]]);
    } else {
      // Sort versions chronologically
      const v1Index = versions.findIndex(v => v.version === selectedVersions[0]);
      const v2Index = versions.findIndex(v => v.version === version);
      const [fromVersion, toVersion] = v1Index > v2Index ? [version, selectedVersions[0]] : [selectedVersions[0], version];
      setSelectedVersions([fromVersion, toVersion]);
    }
  };

  const handleCompare = async () => {
    if (!selectedVersions || selectedVersions[0] === selectedVersions[1]) return;
    
    setLoadingComparison(true);
    try {
      const result = await onCompareVersions(selectedVersions[0], selectedVersions[1]);
      setComparison(result);
    } catch (error) {
      console.error('Error comparing versions:', error);
    } finally {
      setLoadingComparison(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackVersion) return;
    
    setLoadingRollback(true);
    try {
      await onRollback(rollbackVersion, rollbackNotes);
      setRollbackVersion(null);
      setRollbackNotes('');
    } catch (error) {
      console.error('Error rolling back:', error);
    } finally {
      setLoadingRollback(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">null</span>;
    }
    if (typeof value === 'object') {
      return <code className="text-xs bg-gray-100 px-1 rounded">{JSON.stringify(value)}</code>;
    }
    return String(value);
  };

  const getRiskColor = (riskLevel: 'low' | 'medium' | 'high') => {
    switch (riskLevel) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'created': return 'bg-blue-100 text-blue-800';
      case 'expression_changed': return 'bg-orange-100 text-orange-800';
      case 'rollback': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Version History</h2>
          <p className="text-gray-600">
            {entityType === 'metric' ? 'Metric' : 'Dimension'}: {entityName}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {selectedVersions && selectedVersions[0] !== selectedVersions[1] && (
            <Button onClick={handleCompare} disabled={loadingComparison}>
              {loadingComparison ? 'Comparing...' : 'Compare Selected'}
            </Button>
          )}
          {selectedVersions && (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedVersions(null);
                setComparison(null);
              }}
            >
              Clear Selection
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Version List */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Versions ({versions.length})</h3>
          
          <div className="space-y-3">
            {versions.map((version, index) => (
              <Card
                key={version.id}
                className={`p-4 cursor-pointer transition-all ${
                  selectedVersions?.includes(version.version)
                    ? 'ring-2 ring-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50'
                } ${version.version === currentVersion ? 'border-green-500' : ''}`}
                onClick={() => handleVersionSelect(version.version)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold">{version.version}</span>
                    {version.version === currentVersion && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        Current
                      </span>
                    )}
                    {version.impactAnalysis?.breakingChanges && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                        Breaking
                      </span>
                    )}
                    {version.impactAnalysis?.riskLevel && (
                      <span className={`px-2 py-1 text-xs rounded ${getRiskColor(version.impactAnalysis.riskLevel)}`}>
                        {version.impactAnalysis.riskLevel} risk
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDateTime(version.createdAt)}
                  </div>
                </div>

                <div className="text-sm text-gray-600 mb-2">
                  by {version.createdBy}
                </div>

                {version.notes && (
                  <div className="text-sm text-gray-700 mb-3">
                    {version.notes}
                  </div>
                )}

                {/* Changes Summary */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {Object.entries(version.changes).map(([field, change]) => (
                    <span
                      key={field}
                      className={`px-2 py-1 text-xs rounded ${getChangeTypeColor(change.changeType)}`}
                    >
                      {change.changeType === 'created' ? 'Created' : `${field} ${change.changeType}`}
                    </span>
                  ))}
                </div>

                {/* Impact Analysis */}
                {version.impactAnalysis && (
                  <div className="text-xs text-gray-500">
                    Impact: {version.impactAnalysis.affectedQueries.length} queries, {' '}
                    {version.impactAnalysis.affectedDashboards.length} dashboards
                  </div>
                )}

                {/* Rollback Option */}
                {version.version !== currentVersion && (
                  <div className="mt-3 flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRollbackVersion(version.version);
                      }}
                    >
                      Rollback to this version
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>

        {/* Comparison Panel */}
        <div className="space-y-4">
          {comparison && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                Version Comparison: {comparison.fromVersion} → {comparison.toVersion}
              </h3>

              <div className="space-y-4">
                {/* Summary */}
                <div>
                  <h4 className="font-medium mb-2">Summary</h4>
                  <p className="text-sm text-gray-700">{comparison.summary}</p>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className={`px-2 py-1 text-xs rounded ${getRiskColor(comparison.riskLevel)}`}>
                      {comparison.riskLevel} risk
                    </span>
                    {comparison.breakingChanges && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                        Breaking Changes
                      </span>
                    )}
                  </div>
                </div>

                {/* Detailed Changes */}
                <div>
                  <h4 className="font-medium mb-2">Changes</h4>
                  <div className="space-y-3">
                    {comparison.changes.map((change, index) => (
                      <div key={index} className="border-l-4 border-blue-200 pl-4">
                        <div className="font-medium text-sm">
                          {change.field}
                          <span className={`ml-2 px-2 py-1 text-xs rounded ${getChangeTypeColor(change.changeType)}`}>
                            {change.changeType}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1 space-y-1">
                          <div>
                            <span className="font-medium">From:</span> {formatValue(change.fromValue)}
                          </div>
                          <div>
                            <span className="font-medium">To:</span> {formatValue(change.toValue)}
                          </div>
                          {change.impact && (
                            <div className="text-orange-600">
                              <span className="font-medium">Impact:</span> {change.impact}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {selectedVersions && selectedVersions[0] === selectedVersions[1] && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                Version Details: {selectedVersions[0]}
              </h3>
              {(() => {
                const version = versions.find(v => v.version === selectedVersions[0]);
                if (!version) return null;

                return (
                  <div className="space-y-4">
                    <div>
                      <span className="font-medium">Created:</span> {formatDateTime(version.createdAt)}
                    </div>
                    <div>
                      <span className="font-medium">Created by:</span> {version.createdBy}
                    </div>
                    {version.notes && (
                      <div>
                        <span className="font-medium">Notes:</span>
                        <p className="text-gray-700 mt-1">{version.notes}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Changes:</span>
                      <div className="mt-2 space-y-2">
                        {Object.entries(version.changes).map(([field, change]) => (
                          <div key={field} className="text-sm">
                            <span className="font-medium">{field}:</span>
                            <div className="ml-4 text-xs text-gray-600">
                              <div>From: {formatValue(change.from)}</div>
                              <div>To: {formatValue(change.to)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Card>
          )}

          {!selectedVersions && !comparison && (
            <Card className="p-6 text-center">
              <p className="text-gray-500">
                Select versions to compare or view details
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Rollback Modal */}
      {rollbackVersion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                Rollback to {rollbackVersion}
              </h3>
              <p className="text-gray-600 mb-4">
                This will revert the {entityType} to version {rollbackVersion}. 
                This action creates a new version and cannot be undone.
              </p>
              <div className="mb-4">
                <label htmlFor="rollback-notes" className="block text-sm font-medium mb-2">
                  Rollback Notes (optional)
                </label>
                <textarea
                  id="rollback-notes"
                  value={rollbackNotes}
                  onChange={(e) => setRollbackNotes(e.target.value)}
                  placeholder="Reason for rollback..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={handleRollback}
                  disabled={loadingRollback}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {loadingRollback ? 'Rolling back...' : 'Confirm Rollback'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRollbackVersion(null);
                    setRollbackNotes('');
                  }}
                  disabled={loadingRollback}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}