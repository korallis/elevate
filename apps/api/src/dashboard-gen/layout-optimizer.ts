import { logger } from '../logger.js';
import type { GeneratedDashboardWidget } from './dashboard-generator.js';

export interface LayoutResult {
  widgets: GeneratedDashboardWidget[];
  layout: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

export type LayoutStyle = 'compact' | 'spacious' | 'grid' | 'priority-based';

export class LayoutOptimizer {
  
  async optimizeLayout(
    widgets: GeneratedDashboardWidget[],
    style: LayoutStyle = 'grid'
  ): Promise<LayoutResult> {
    try {
      logger.info('Optimizing layout', { widgetCount: widgets.length, style });

      const optimizedWidgets = this.applyLayoutAlgorithm(widgets, style);
      const layoutConfig = this.generateLayoutConfig(optimizedWidgets, style);
      
      return {
        widgets: optimizedWidgets,
        layout: layoutConfig,
        confidence: this.calculateLayoutConfidence(optimizedWidgets, style),
        reasoning: this.generateLayoutReasoning(optimizedWidgets, style)
      };
    } catch (error) {
      logger.error('Layout optimization failed', { error: String(error) });
      return {
        widgets,
        layout: {},
        confidence: 0.5,
        reasoning: 'Basic layout applied due to optimization error'
      };
    }
  }

  private applyLayoutAlgorithm(
    widgets: GeneratedDashboardWidget[],
    style: LayoutStyle
  ): GeneratedDashboardWidget[] {
    switch (style) {
      case 'priority-based':
        return this.priorityBasedLayout(widgets);
      case 'compact':
        return this.compactLayout(widgets);
      case 'spacious':
        return this.spaciousLayout(widgets);
      case 'grid':
      default:
        return this.gridLayout(widgets);
    }
  }

  private priorityBasedLayout(widgets: DashboardWidget[]): DashboardWidget[] {
    // Sort by priority (higher first)
    const sortedWidgets = [...widgets].sort((a, b) => {
      const aPriority = (a.config.priority as number) || 5;
      const bPriority = (b.config.priority as number) || 5;
      return bPriority - aPriority;
    });

    const gridWidth = 12;
    let currentY = 0;
    let currentX = 0;

    return sortedWidgets.map((widget) => {
      const { w, h } = widget.position;
      
      // Check if widget fits in current row
      if (currentX + w > gridWidth) {
        currentY += this.getMaxHeightInRow(sortedWidgets, currentY);
        currentX = 0;
      }

      const optimizedWidget = {
        ...widget,
        position: {
          ...widget.position,
          x: currentX,
          y: currentY
        }
      };

      currentX += w;
      return optimizedWidget;
    });
  }

  private compactLayout(widgets: DashboardWidget[]): DashboardWidget[] {
    // Minimize gaps and pack widgets tightly
    const gridWidth = 12;
    const positions: Array<{ x: number; y: number; w: number; h: number }> = [];
    
    return widgets.map((widget) => {
      const { w, h } = widget.position;
      const position = this.findBestCompactPosition(positions, w, h, gridWidth);
      
      positions.push(position);
      
      return {
        ...widget,
        position
      };
    });
  }

  private spaciousLayout(widgets: DashboardWidget[]): DashboardWidget[] {
    // Add extra spacing between widgets
    const gridWidth = 12;
    let currentY = 0;
    let currentX = 0;
    const spacing = 1; // Extra space between widgets

    return widgets.map((widget) => {
      const { w, h } = widget.position;
      
      // Check if widget fits in current row with spacing
      if (currentX + w + spacing > gridWidth) {
        currentY += this.getMaxHeightInRow(widgets, currentY) + spacing;
        currentX = 0;
      }

      const optimizedWidget = {
        ...widget,
        position: {
          ...widget.position,
          x: currentX,
          y: currentY
        }
      };

      currentX += w + spacing;
      return optimizedWidget;
    });
  }

  private gridLayout(widgets: DashboardWidget[]): DashboardWidget[] {
    // Standard grid layout with consistent spacing
    const gridWidth = 12;
    const positions = this.calculateGridPositions(widgets, gridWidth);
    
    return widgets.map((widget, index) => ({
      ...widget,
      position: {
        ...widget.position,
        x: positions[index].x,
        y: positions[index].y
      }
    }));
  }

  private calculateGridPositions(
    widgets: DashboardWidget[],
    gridWidth: number
  ): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];
    let currentY = 0;
    let currentRowWidgets: DashboardWidget[] = [];

    for (const widget of widgets) {
      const { w, h } = widget.position;
      
      // Check if widget fits in current row
      const currentRowWidth = currentRowWidgets.reduce((sum, w) => sum + w.position.w, 0);
      
      if (currentRowWidth + w > gridWidth && currentRowWidgets.length > 0) {
        // Move to next row
        currentY += Math.max(...currentRowWidgets.map(w => w.position.h));
        currentRowWidgets = [];
      }

      const x = currentRowWidgets.reduce((sum, w) => sum + w.position.w, 0);
      positions.push({ x, y: currentY });
      currentRowWidgets.push(widget);
    }

    return positions;
  }

  private findBestCompactPosition(
    existingPositions: Array<{ x: number; y: number; w: number; h: number }>,
    w: number,
    h: number,
    gridWidth: number
  ): { x: number; y: number; w: number; h: number } {
    
    // Try to find the lowest available position
    for (let y = 0; y < 20; y++) { // Reasonable limit
      for (let x = 0; x <= gridWidth - w; x++) {
        const position = { x, y, w, h };
        
        if (!this.positionOverlaps(position, existingPositions)) {
          return position;
        }
      }
    }

    // Fallback if no position found
    return { x: 0, y: existingPositions.length * 2, w, h };
  }

  private positionOverlaps(
    position: { x: number; y: number; w: number; h: number },
    existingPositions: Array<{ x: number; y: number; w: number; h: number }>
  ): boolean {
    return existingPositions.some(existing => {
      return !(
        position.x >= existing.x + existing.w || // To the right
        position.x + position.w <= existing.x || // To the left
        position.y >= existing.y + existing.h || // Below
        position.y + position.h <= existing.y    // Above
      );
    });
  }

  private getMaxHeightInRow(widgets: DashboardWidget[], y: number): number {
    const rowWidgets = widgets.filter(w => w.position.y === y);
    return rowWidgets.length > 0 
      ? Math.max(...rowWidgets.map(w => w.position.h))
      : 4; // Default height
  }

  private generateLayoutConfig(
    widgets: DashboardWidget[],
    style: LayoutStyle
  ): Record<string, unknown> {
    return {
      style,
      gridWidth: 12,
      rowHeight: 100,
      margin: [10, 10],
      containerPadding: [10, 10],
      breakpoints: {
        lg: 1200,
        md: 996,
        sm: 768,
        xs: 480,
        xxs: 0
      },
      cols: {
        lg: 12,
        md: 10,
        sm: 6,
        xs: 4,
        xxs: 2
      },
      layouts: {
        lg: widgets.map(w => ({
          i: w.id,
          x: w.position.x,
          y: w.position.y,
          w: w.position.w,
          h: w.position.h
        }))
      }
    };
  }

  private calculateLayoutConfidence(
    widgets: DashboardWidget[],
    style: LayoutStyle
  ): number {
    // Calculate confidence based on layout quality metrics
    let confidence = 0.8; // Base confidence

    // Check for overlaps (reduce confidence if any)
    const hasOverlaps = this.checkForOverlaps(widgets);
    if (hasOverlaps) {
      confidence -= 0.3;
    }

    // Check widget density (optimal is neither too sparse nor too dense)
    const density = this.calculateDensity(widgets);
    if (density < 0.3 || density > 0.8) {
      confidence -= 0.1;
    }

    // Check priority order adherence for priority-based layouts
    if (style === 'priority-based') {
      const priorityOrder = this.checkPriorityOrder(widgets);
      confidence += priorityOrder * 0.2;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private checkForOverlaps(widgets: DashboardWidget[]): boolean {
    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        const w1 = widgets[i].position;
        const w2 = widgets[j].position;
        
        if (this.positionOverlaps(w1, [w2])) {
          return true;
        }
      }
    }
    return false;
  }

  private calculateDensity(widgets: DashboardWidget[]): number {
    if (widgets.length === 0) return 0;
    
    const totalArea = widgets.reduce((sum, w) => sum + (w.position.w * w.position.h), 0);
    const maxY = Math.max(...widgets.map(w => w.position.y + w.position.h));
    const canvasArea = 12 * maxY; // 12-column grid
    
    return totalArea / canvasArea;
  }

  private checkPriorityOrder(widgets: DashboardWidget[]): number {
    let correctOrder = 0;
    const total = widgets.length - 1;
    
    for (let i = 0; i < total; i++) {
      const current = (widgets[i].config.priority as number) || 5;
      const next = (widgets[i + 1].config.priority as number) || 5;
      
      if (current >= next) {
        correctOrder++;
      }
    }
    
    return total > 0 ? correctOrder / total : 1;
  }

  private generateLayoutReasoning(
    widgets: DashboardWidget[],
    style: LayoutStyle
  ): string {
    const hasOverlaps = this.checkForOverlaps(widgets);
    const density = this.calculateDensity(widgets);
    
    let reasoning = `Applied ${style} layout algorithm to ${widgets.length} widgets. `;
    
    if (hasOverlaps) {
      reasoning += 'Warning: Some widget overlaps detected. ';
    } else {
      reasoning += 'No overlaps detected. ';
    }
    
    reasoning += `Widget density: ${(density * 100).toFixed(1)}%. `;
    
    if (style === 'priority-based') {
      const priorityOrder = this.checkPriorityOrder(widgets);
      reasoning += `Priority order adherence: ${(priorityOrder * 100).toFixed(1)}%.`;
    }
    
    return reasoning;
  }
}