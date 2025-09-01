'use client';

import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Search, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/design-system';
import { WidgetConfigData } from '../dashboard/WidgetConfig';
import { WidgetContainer } from './WidgetContainer';

export interface TableWidgetProps {
  config: WidgetConfigData;
  onConfigClick: () => void;
  onDeleteClick: () => void;
  isReadOnly?: boolean;
}

interface TableData {
  columns: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    sortable?: boolean;
  }>;
  rows: Record<string, any>[];
}

// Mock data generator
const generateMockTableData = (): TableData => {
  const columns = [
    { key: 'name', label: 'Name', type: 'string' as const, sortable: true },
    { key: 'revenue', label: 'Revenue', type: 'number' as const, sortable: true },
    { key: 'growth', label: 'Growth %', type: 'number' as const, sortable: true },
    { key: 'category', label: 'Category', type: 'string' as const, sortable: true },
    { key: 'lastUpdated', label: 'Last Updated', type: 'date' as const, sortable: true }
  ];

  const categories = ['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing'];
  const names = ['Acme Corp', 'TechFlow Inc', 'DataMax Ltd', 'InnovateCo', 'NextGen Systems'];

  const rows = Array.from({ length: 25 }, (_, i) => ({
    name: names[i % names.length] + ` ${i + 1}`,
    revenue: Math.floor(Math.random() * 1000000) + 100000,
    growth: (Math.random() * 40 - 10).toFixed(1),
    category: categories[Math.floor(Math.random() * categories.length)],
    lastUpdated: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  }));

  return { columns, rows };
};

export function TableWidget({ 
  config, 
  onConfigClick, 
  onDeleteClick, 
  isReadOnly 
}: TableWidgetProps) {
  const [data, setData] = useState<TableData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (config.dataSource?.type === 'mock') {
          // Simulate loading delay
          await new Promise(resolve => setTimeout(resolve, 300));
          setData(generateMockTableData());
        } else if (config.dataSource?.type === 'api' && config.dataSource.endpoint) {
          const response = await fetch(config.dataSource.endpoint);
          if (!response.ok) throw new Error('Failed to fetch data');
          const result = await response.json();
          setData(result);
        } else if (config.dataSource?.type === 'snowflake' && config.dataSource.query) {
          // In a real implementation, this would call your API to execute the Snowflake query
          const response = await fetch('/api/query/snowflake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: config.dataSource.query,
              database: config.dataSource.database,
              schema: config.dataSource.schema
            })
          });
          
          if (!response.ok) throw new Error('Failed to execute query');
          const result = await response.json();
          setData(result.data || generateMockTableData());
        } else {
          setData(generateMockTableData());
        }
      } catch (err) {
        console.error('Error loading table data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        // Fallback to mock data on error
        setData(generateMockTableData());
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [config.dataSource]);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const formatCellValue = (value: any, type: string) => {
    if (value === null || value === undefined) return '-';
    
    switch (type) {
      case 'number':
        return typeof value === 'number' ? 
          new Intl.NumberFormat().format(value) : 
          value;
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'boolean':
        return value ? '✓' : '✗';
      default:
        return String(value);
    }
  };

  const getFilteredAndSortedRows = () => {
    if (!data) return [];
    
    let filtered = data.rows;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(row =>
        Object.values(row).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        
        if (aVal === bVal) return 0;
        
        const comparison = aVal < bVal ? -1 : 1;
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  };

  const filteredRows = getFilteredAndSortedRows();
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const headerActions = (
    <div className="flex items-center gap-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-foreground-muted" />
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-7 pr-3 py-1 text-xs bg-background border border-card-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50 w-32"
        />
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="opacity-60 hover:opacity-100"
      >
        <Download className="w-3 h-3" />
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <WidgetContainer
        title={config.title || 'Data Table'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        headerActions={headerActions}
        className="h-full"
      >
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </WidgetContainer>
    );
  }

  if (error) {
    return (
      <WidgetContainer
        title={config.title || 'Data Table'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        headerActions={headerActions}
        className="h-full"
      >
        <div className="flex items-center justify-center h-32 text-center p-4">
          <div>
            <div className="text-red-400 mb-2">⚠️</div>
            <div className="text-sm text-foreground-muted">{error}</div>
          </div>
        </div>
      </WidgetContainer>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <WidgetContainer
        title={config.title || 'Data Table'}
        onConfigClick={onConfigClick}
        onDeleteClick={onDeleteClick}
        isReadOnly={isReadOnly}
        headerActions={headerActions}
        className="h-full"
      >
        <div className="flex items-center justify-center h-32 text-center p-4">
          <div>
            <div className="text-foreground-muted mb-2">📊</div>
            <div className="text-sm text-foreground-muted">No data available</div>
          </div>
        </div>
      </WidgetContainer>
    );
  }

  return (
    <WidgetContainer
      title={config.title || 'Data Table'}
      onConfigClick={onConfigClick}
      onDeleteClick={onDeleteClick}
      isReadOnly={isReadOnly}
      headerActions={headerActions}
      className="h-full"
    >
      <div className="flex flex-col h-full">
        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background/90 backdrop-blur-sm border-b border-card-border">
              <tr>
                {data.columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-left font-medium ${
                      column.sortable ? 'cursor-pointer hover:bg-card/50' : ''
                    }`}
                    onClick={() => column.sortable && handleSort(column.key)}
                  >
                    <div className="flex items-center gap-2">
                      {column.label}
                      {column.sortable && (
                        <div className="flex flex-col">
                          <ChevronUp 
                            className={`w-3 h-3 -mb-1 ${
                              sortColumn === column.key && sortDirection === 'asc' 
                                ? 'text-primary' 
                                : 'text-foreground-muted/50'
                            }`}
                          />
                          <ChevronDown 
                            className={`w-3 h-3 ${
                              sortColumn === column.key && sortDirection === 'desc' 
                                ? 'text-primary' 
                                : 'text-foreground-muted/50'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, rowIndex) => (
                <tr 
                  key={rowIndex} 
                  className="hover:bg-card/30 border-b border-card-border/50 last:border-b-0"
                >
                  {data.columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      <span className={
                        column.type === 'number' && parseFloat(row[column.key]) < 0 
                          ? 'text-red-400' 
                          : column.type === 'number' && parseFloat(row[column.key]) > 0
                          ? 'text-green-400'
                          : ''
                      }>
                        {formatCellValue(row[column.key], column.type)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-card-border bg-background/50">
            <div className="text-sm text-foreground-muted">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} results
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </WidgetContainer>
  );
}