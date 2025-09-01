'use client';

import { Responsive, WidthProvider } from 'react-grid-layout';
import { ReactNode } from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

export interface GridLayoutProps {
  children: ReactNode;
  layouts?: any;
  onLayoutChange?: (layout: any[], layouts: any) => void;
  isDraggable?: boolean;
  isResizable?: boolean;
  compactType?: 'vertical' | 'horizontal' | null;
  preventCollision?: boolean;
  margin?: [number, number];
  containerPadding?: [number, number];
  rowHeight?: number;
  className?: string;
}

export function GridLayout({
  children,
  layouts,
  onLayoutChange,
  isDraggable = true,
  isResizable = true,
  compactType = 'vertical',
  preventCollision = false,
  margin = [16, 16],
  containerPadding = [16, 16],
  rowHeight = 60,
  className = '',
}: GridLayoutProps) {
  return (
    <ResponsiveGridLayout
      className={`dashboard-grid ${className}`}
      layouts={layouts}
      onLayoutChange={onLayoutChange}
      isDraggable={isDraggable}
      isResizable={isResizable}
      compactType={compactType}
      preventCollision={preventCollision}
      margin={margin}
      containerPadding={containerPadding}
      rowHeight={rowHeight}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
      // Custom handle for drag
      draggableHandle=".drag-handle"
      // Resize handle
      resizeHandles={['se', 'e', 's']}
    >
      {children}
    </ResponsiveGridLayout>
  );
}