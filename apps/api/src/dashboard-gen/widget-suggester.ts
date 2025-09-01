import OpenAI from 'openai';
import { logger } from '../logger.js';
import type { UserIntent, GenerationContext, GeneratedDashboardWidget } from './dashboard-generator.js';

export interface WidgetSuggestion {
  type: string;
  title: string;
  description: string;
  dataSource: {
    type: 'table' | 'metric' | 'calculation';
    source: string;
    fields: string[];
  };
  visualization: {
    type: string;
    config: Record<string, unknown>;
  };
  priority: number;
  reasoning: string;
}

export class WidgetSuggester {
  private openai: OpenAI;

  constructor(openai: OpenAI) {
    this.openai = openai;
  }

  async suggestWidgets(
    intent: UserIntent,
    context: GenerationContext
  ): Promise<GeneratedDashboardWidget[]> {
    try {
      // Get AI suggestions for widgets
      const suggestions = await this.generateWidgetSuggestions(intent, context);
      
      // Convert suggestions to dashboard widgets
      const widgets = suggestions.map((suggestion, index) => this.createWidget(suggestion, index));
      
      // Sort by priority and limit to reasonable number
      return widgets
        .sort((a, b) => (b.config.priority as number) - (a.config.priority as number))
        .slice(0, 8); // Limit to 8 widgets max for initial generation

    } catch (error) {
      logger.error('Widget suggestion failed', { error: String(error) });
      // Fallback to basic widgets
      return this.generateFallbackWidgets(intent);
    }
  }

  async customizeWidget(
    templateWidget: GeneratedDashboardWidget,
    intent: UserIntent,
    context: GenerationContext
  ): Promise<GeneratedDashboardWidget> {
    const customizationPrompt = `
Customize this widget for the specific user context:

Template Widget:
- Type: ${templateWidget.type}
- Title: ${templateWidget.config.title}
- Current Config: ${JSON.stringify(templateWidget.config, null, 2)}

User Context:
- Domain: ${intent.domain}
- Key Metrics: ${intent.keyMetrics.join(', ')}
- Available Tables: ${context.availableTables?.join(', ') || 'None'}
- Original Request: "${intent.originalPrompt}"

Customize the widget title, data source, and configuration to match the user's specific needs.
Keep the same widget type but adapt the content and styling.

Respond with JSON containing: title, dataSource, visualization, description
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a dashboard customization expert. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: customizationPrompt
          }
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        const customization = JSON.parse(response);
        return {
          ...templateWidget,
          config: {
            ...templateWidget.config,
            title: customization.title || templateWidget.config.title,
            dataSource: customization.dataSource || templateWidget.config.dataSource,
            visualization: customization.visualization || templateWidget.config.visualization,
            description: customization.description
          }
        };
      }
    } catch (error) {
      logger.error('Widget customization failed', { error: String(error) });
    }

    return templateWidget; // Return original if customization fails
  }

  private async generateWidgetSuggestions(
    intent: UserIntent,
    context: GenerationContext
  ): Promise<WidgetSuggestion[]> {
    const prompt = `
Generate specific widget suggestions for a ${intent.domain} dashboard:

User Requirements:
- Domain: ${intent.domain}
- Key Metrics: ${intent.keyMetrics.join(', ')}
- Audience Level: ${intent.audienceLevel}
- Time Frame: ${intent.timeFrame}
- Available Tables: ${context.availableTables?.join(', ') || 'None specified'}
- Visualization Preferences: ${intent.visualizationPreferences.join(', ')}

Available Widget Types:
- metric: KPI cards showing single values with trends
- line-chart: Time series data
- bar-chart: Category comparisons
- pie-chart: Proportional data
- table: Detailed data lists
- text: Context and insights
- filter: Interactive controls
- map: Geographic data

For each widget, specify:
1. Widget type (from available types)
2. Descriptive title
3. Data source and fields needed
4. Visualization configuration
5. Priority (1-10, higher = more important)
6. Reasoning for inclusion

Generate 6-10 widget suggestions that would create a comprehensive ${intent.domain} dashboard.
Focus on the most important metrics first.

Respond with JSON array of widget objects.
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert data visualization consultant. Generate practical, business-focused widget suggestions. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' }
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('Failed to generate widget suggestions');
    }

    try {
      const parsed = JSON.parse(response);
      return parsed.widgets || parsed || [];
    } catch (parseError) {
      logger.error('Failed to parse widget suggestions', { response, parseError });
      throw new Error('Failed to parse widget suggestions');
    }
  }

  private createWidget(suggestion: WidgetSuggestion, index: number): GeneratedDashboardWidget {
    // Determine widget size based on type and importance
    const sizeMap: Record<string, { w: number; h: number }> = {
      'metric': { w: 3, h: 2 },
      'line-chart': { w: 6, h: 4 },
      'bar-chart': { w: 6, h: 4 },
      'pie-chart': { w: 4, h: 4 },
      'table': { w: 8, h: 6 },
      'text': { w: 4, h: 3 },
      'filter': { w: 3, h: 2 },
      'map': { w: 6, h: 6 }
    };

    const defaultSize = sizeMap[suggestion.type] || { w: 4, h: 4 };
    
    // Calculate position based on index and size
    const position = this.calculatePosition(index, defaultSize);

    return {
      id: `ai-widget-${Date.now()}-${index}`,
      type: suggestion.type,
      config: {
        id: `ai-widget-${Date.now()}-${index}`,
        title: suggestion.title,
        description: suggestion.description,
        dataSource: suggestion.dataSource,
        visualization: suggestion.visualization,
        priority: suggestion.priority,
        reasoning: suggestion.reasoning
      },
      position: {
        ...position,
        ...defaultSize
      }
    };
  }

  private calculatePosition(index: number, size: { w: number; h: number }) {
    // Simple grid layout calculation
    const gridWidth = 12; // Standard 12-column grid
    const currentRow = Math.floor(index / (gridWidth / size.w));
    const currentCol = (index * size.w) % gridWidth;

    return {
      x: currentCol,
      y: currentRow * size.h
    };
  }

  private generateFallbackWidgets(intent: UserIntent): GeneratedDashboardWidget[] {
    const fallbackWidgets: GeneratedDashboardWidget[] = [];

    // Always include key metric widgets
    intent.keyMetrics.slice(0, 3).forEach((metric, index) => {
      fallbackWidgets.push({
        id: `fallback-metric-${index}`,
        type: 'metric',
        config: {
          id: `fallback-metric-${index}`,
          title: metric,
          dataSource: { type: 'mock' },
          visualization: { type: 'metric' }
        },
        position: { x: index * 3, y: 0, w: 3, h: 2 }
      });
    });

    // Add a trend chart
    fallbackWidgets.push({
      id: 'fallback-trend',
      type: 'line-chart',
      config: {
        id: 'fallback-trend',
        title: `${intent.domain} Trends Over Time`,
        dataSource: { type: 'mock' },
        visualization: { type: 'line' }
      },
      position: { x: 0, y: 2, w: 8, h: 4 }
    });

    // Add a summary table
    fallbackWidgets.push({
      id: 'fallback-table',
      type: 'table',
      config: {
        id: 'fallback-table',
        title: `${intent.domain} Summary`,
        dataSource: { type: 'mock' },
        visualization: { type: 'table' }
      },
      position: { x: 8, y: 2, w: 4, h: 4 }
    });

    return fallbackWidgets;
  }
}