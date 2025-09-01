import OpenAI from 'openai';
import { logger } from '../logger.js';
import { WidgetSuggester } from './widget-suggester.js';
import { LayoutOptimizer } from './layout-optimizer.js';
import { TemplateMatcher } from './template-matcher.js';
// Define our own interfaces for generation that match frontend expectations
export interface GeneratedDashboardWidget {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface GenerationContext {
  userPrompt: string;
  availableTables?: string[];
  availableMetrics?: string[];
  userPreferences?: {
    theme?: string;
    chartTypes?: string[];
    layout?: 'compact' | 'spacious' | 'grid';
  };
}

export interface GeneratedDashboard {
  name: string;
  description: string;
  widgets: GeneratedDashboardWidget[];
  theme: Record<string, unknown>;
  layout: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

export class DashboardGenerator {
  private openai: OpenAI;
  private widgetSuggester: WidgetSuggester;
  private layoutOptimizer: LayoutOptimizer;
  private templateMatcher: TemplateMatcher;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.widgetSuggester = new WidgetSuggester(this.openai);
    this.layoutOptimizer = new LayoutOptimizer();
    this.templateMatcher = new TemplateMatcher();
  }

  async generateDashboard(context: GenerationContext): Promise<GeneratedDashboard> {
    try {
      logger.info('Starting dashboard generation', { prompt: context.userPrompt });

      // Step 1: Analyze user intent and extract requirements
      const intent = await this.analyzeUserIntent(context);
      logger.info('Analyzed user intent', { intent });

      // Step 2: Check for template matches
      const templateMatch = await this.templateMatcher.findBestMatch(intent);
      
      if (templateMatch && templateMatch.confidence > 0.8) {
        logger.info('Found high-confidence template match', { template: templateMatch.template.name });
        return await this.generateFromTemplate(templateMatch.template, context, intent);
      }

      // Step 3: Generate widgets based on intent
      const suggestedWidgets = await this.widgetSuggester.suggestWidgets(intent, context);
      logger.info('Generated widget suggestions', { count: suggestedWidgets.length });

      // Step 4: Optimize layout
      const optimizedLayout = await this.layoutOptimizer.optimizeLayout(
        suggestedWidgets,
        context.userPreferences?.layout || 'grid'
      );

      // Step 5: Generate dashboard metadata
      const metadata = await this.generateDashboardMetadata(intent, context);

      // Step 6: Apply theme
      const theme = this.generateTheme(intent, context.userPreferences?.theme);

      return {
        name: metadata.name,
        description: metadata.description,
        widgets: optimizedLayout.widgets,
        theme,
        layout: optimizedLayout.layout,
        confidence: Math.min(intent.confidence, optimizedLayout.confidence),
        reasoning: this.generateReasoning(intent, suggestedWidgets, optimizedLayout)
      };

    } catch (error) {
      logger.error('Dashboard generation failed', { error: String(error) });
      throw new Error(`Dashboard generation failed: ${String(error)}`);
    }
  }

  private async analyzeUserIntent(context: GenerationContext): Promise<UserIntent> {
    const prompt = `
Analyze the following dashboard request and extract structured information:

User Request: "${context.userPrompt}"

Available Data Context:
- Tables: ${context.availableTables?.join(', ') || 'None specified'}
- Metrics: ${context.availableMetrics?.join(', ') || 'None specified'}

Please analyze this request and provide:
1. Primary business domain (e.g., sales, marketing, finance, operations)
2. Key metrics they want to track
3. Visualization preferences
4. Time frame considerations
5. Audience level (executive, analyst, operational)
6. Data relationships they care about

Respond in JSON format with confidence scores (0-1) for each analysis.
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert business intelligence analyst who helps design effective dashboards. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('Failed to analyze user intent');
    }

    try {
      const parsed = JSON.parse(response) as UserIntent;
      return {
        ...parsed,
        originalPrompt: context.userPrompt,
        confidence: parsed.confidence || 0.7
      };
    } catch (parseError) {
      logger.error('Failed to parse intent analysis', { response, parseError });
      throw new Error('Failed to parse intent analysis');
    }
  }

  private async generateFromTemplate(
    template: DashboardTemplate,
    context: GenerationContext,
    intent: UserIntent
  ): Promise<GeneratedDashboard> {
    // Customize template based on user context
    const customizedWidgets = await Promise.all(
      template.widgets.map(async (widget) => {
        const customized = await this.widgetSuggester.customizeWidget(widget, intent, context);
        return customized;
      })
    );

    return {
      name: `${intent.domain} Dashboard - ${template.name}`,
      description: `Auto-generated ${intent.domain} dashboard based on ${template.name} template`,
      widgets: customizedWidgets,
      theme: template.theme || this.generateTheme(intent, context.userPreferences?.theme),
      layout: template.layout || {},
      confidence: 0.9,
      reasoning: `High-confidence match with ${template.name} template (${template.description})`
    };
  }

  private async generateDashboardMetadata(
    intent: UserIntent,
    context: GenerationContext
  ): Promise<{ name: string; description: string }> {
    const prompt = `
Based on this dashboard analysis, generate a concise name and description:

Domain: ${intent.domain}
Key Metrics: ${intent.keyMetrics.join(', ')}
Audience: ${intent.audienceLevel}
Original Request: "${context.userPrompt}"

Generate:
1. A professional dashboard name (2-4 words)
2. A brief description (1-2 sentences)

Respond in JSON format.
`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'Generate professional dashboard metadata. Always respond with valid JSON containing "name" and "description" fields.'
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
      return {
        name: `${intent.domain} Dashboard`,
        description: 'Auto-generated analytics dashboard'
      };
    }

    try {
      return JSON.parse(response);
    } catch {
      return {
        name: `${intent.domain} Dashboard`,
        description: 'Auto-generated analytics dashboard'
      };
    }
  }

  private generateTheme(intent: UserIntent, preferredTheme?: string): Record<string, unknown> {
    // Default Elev8 theme with domain-specific adjustments
    const baseTheme = {
      mode: 'dark',
      primary: 'hsl(252, 60%, 65%)',
      accent: 'hsl(163, 50%, 45%)',
      background: 'hsl(240, 10%, 3.9%)',
      surface: 'hsl(240, 10%, 12%)',
      text: 'hsl(0, 0%, 95%)',
      border: 'hsl(240, 10%, 20%)',
      preset: 'elev8'
    };

    // Domain-specific color adjustments
    const domainColors: Record<string, Partial<typeof baseTheme>> = {
      finance: {
        primary: 'hsl(142, 76%, 36%)', // Green for financial success
        accent: 'hsl(38, 92%, 50%)' // Gold accent
      },
      sales: {
        primary: 'hsl(217, 91%, 60%)', // Blue for trust
        accent: 'hsl(152, 69%, 31%)' // Success green
      },
      marketing: {
        primary: 'hsl(271, 81%, 56%)', // Purple for creativity
        accent: 'hsl(347, 77%, 50%)' // Bright accent
      },
      operations: {
        primary: 'hsl(25, 95%, 53%)', // Orange for action
        accent: 'hsl(199, 89%, 48%)' // Blue accent
      }
    };

    const domainTheme = domainColors[intent.domain] || {};
    
    return {
      ...baseTheme,
      ...domainTheme
    };
  }

  private generateReasoning(
    intent: UserIntent,
    widgets: DashboardWidget[],
    layout: { confidence: number }
  ): string {
    return `Generated dashboard based on ${intent.domain} domain analysis with ${intent.confidence * 100}% confidence. ` +
           `Included ${widgets.length} widgets focusing on ${intent.keyMetrics.join(', ')}. ` +
           `Layout optimized for ${intent.audienceLevel} audience with ${layout.confidence * 100}% confidence.`;
  }
}

// Supporting interfaces
export interface UserIntent {
  domain: string;
  keyMetrics: string[];
  visualizationPreferences: string[];
  timeFrame: string;
  audienceLevel: 'executive' | 'analyst' | 'operational';
  dataRelationships: string[];
  confidence: number;
  originalPrompt: string;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  domain: string;
  widgets: DashboardWidget[];
  theme?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}