import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { logger } from '../logger.js';
import { useBudget, getActorKey } from '../budget.js';
import { DashboardGenerator, type GenerationContext, type GeneratedDashboard } from '../dashboard-gen/dashboard-generator.js';
import { WidgetSuggester } from '../dashboard-gen/widget-suggester.js';
import { TemplateMatcher } from '../dashboard-gen/template-matcher.js';
import { runPostgresQuery, hasPgConfig } from '../postgres.js';
import OpenAI from 'openai';

const dashboardGenRoutes = new Hono();

// Validation schemas
const generateRequestSchema = z.object({
  prompt: z.string().min(10).max(1000),
  availableTables: z.array(z.string()).optional(),
  availableMetrics: z.array(z.string()).optional(),
  userPreferences: z.object({
    theme: z.string().optional(),
    chartTypes: z.array(z.string()).optional(),
    layout: z.enum(['compact', 'spacious', 'grid']).optional()
  }).optional()
});

const suggestWidgetsSchema = z.object({
  domain: z.string(),
  keyMetrics: z.array(z.string()),
  audienceLevel: z.enum(['executive', 'analyst', 'operational']),
  availableTables: z.array(z.string()).optional(),
  visualizationPreferences: z.array(z.string()).optional()
});

const improveDashboardSchema = z.object({
  dashboardId: z.string(),
  feedbackPrompt: z.string().min(5).max(500),
  specificChanges: z.array(z.string()).optional()
});

// Initialize generator instance
let dashboardGenerator: DashboardGenerator;
let widgetSuggester: WidgetSuggester;
let templateMatcher: TemplateMatcher;

try {
  dashboardGenerator = new DashboardGenerator();
  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    widgetSuggester = new WidgetSuggester(openai);
    templateMatcher = new TemplateMatcher();
  }
} catch (error) {
  logger.error('Failed to initialize dashboard generation services', { error: String(error) });
}

// Generate dashboard from natural language prompt
dashboardGenRoutes.post('/generate', 
  zValidator('json', generateRequestSchema),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 5); // Higher budget for AI generation
    if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

    if (!dashboardGenerator) {
      return c.json({ error: 'dashboard_generator_not_available' }, 503);
    }

    const actor = getActorKey(c.req.raw.headers);
    const { prompt, availableTables, availableMetrics, userPreferences } = c.req.valid('json');

    try {
      logger.info('Starting dashboard generation', { actor, prompt: prompt.substring(0, 100) });

      const context: GenerationContext = {
        userPrompt: prompt,
        availableTables,
        availableMetrics,
        userPreferences
      };

      const generatedDashboard = await dashboardGenerator.generateDashboard(context);
      
      // Optionally save to database if Postgres is configured
      let savedDashboard = null;
      if (hasPgConfig()) {
        try {
          const [dashboard] = await runPostgresQuery(
            'INSERT INTO dashboards(name, description, layout, theme, filters, is_public, created_by, metadata) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [
              generatedDashboard.name,
              generatedDashboard.description,
              JSON.stringify(generatedDashboard.layout),
              JSON.stringify(generatedDashboard.theme),
              JSON.stringify([]),
              false,
              actor,
              JSON.stringify({
                generatedBy: 'ai',
                prompt: prompt,
                confidence: generatedDashboard.confidence,
                reasoning: generatedDashboard.reasoning
              })
            ]
          );

          // Save widgets
          for (const widget of generatedDashboard.widgets) {
            await runPostgresQuery(
              'INSERT INTO dashboard_widgets(dashboard_id, widget_type, config, position) VALUES($1, $2, $3, $4)',
              [dashboard.id, widget.type, JSON.stringify(widget.config), JSON.stringify(widget.position)]
            );
          }

          savedDashboard = dashboard;
        } catch (dbError) {
          logger.error('Failed to save generated dashboard', { error: String(dbError) });
          // Continue without saving to database
        }
      }

      return c.json({
        dashboard: generatedDashboard,
        savedDashboard,
        metadata: {
          confidence: generatedDashboard.confidence,
          reasoning: generatedDashboard.reasoning,
          generatedAt: new Date().toISOString()
        }
      }, 201);

    } catch (error) {
      logger.error('Dashboard generation failed', { error: String(error), actor });
      return c.json({ 
        error: 'generation_failed', 
        details: String(error) 
      }, 500);
    }
  }
);

// Suggest widgets based on user requirements
dashboardGenRoutes.post('/suggest-widgets',
  zValidator('json', suggestWidgetsSchema),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 3);
    if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

    if (!widgetSuggester) {
      return c.json({ error: 'widget_suggester_not_available' }, 503);
    }

    const { domain, keyMetrics, audienceLevel, availableTables, visualizationPreferences } = c.req.valid('json');

    try {
      const intent = {
        domain,
        keyMetrics,
        audienceLevel,
        visualizationPreferences: visualizationPreferences || [],
        timeFrame: 'monthly', // Default
        dataRelationships: [],
        confidence: 0.8,
        originalPrompt: `Generate widgets for ${domain} domain with metrics: ${keyMetrics.join(', ')}`
      };

      const context: GenerationContext = {
        userPrompt: intent.originalPrompt,
        availableTables,
        availableMetrics: keyMetrics
      };

      const widgets = await widgetSuggester.suggestWidgets(intent, context);

      return c.json({
        widgets,
        suggestions: widgets.length,
        domain,
        confidence: 0.8
      });

    } catch (error) {
      logger.error('Widget suggestion failed', { error: String(error) });
      return c.json({ 
        error: 'suggestion_failed', 
        details: String(error) 
      }, 500);
    }
  }
);

// Get available templates
dashboardGenRoutes.get('/templates', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!templateMatcher) {
    return c.json({ error: 'template_matcher_not_available' }, 503);
  }

  try {
    const templates = templateMatcher.getAvailableTemplates();
    
    return c.json({
      templates: templates.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        domain: template.domain,
        widgetCount: template.widgets.length,
        preview: template.widgets.slice(0, 3).map(w => ({
          type: w.type,
          title: w.config.title
        }))
      }))
    });

  } catch (error) {
    logger.error('Failed to get templates', { error: String(error) });
    return c.json({ error: 'templates_unavailable' }, 500);
  }
});

// Get specific template details
dashboardGenRoutes.get('/templates/:id', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!templateMatcher) {
    return c.json({ error: 'template_matcher_not_available' }, 503);
  }

  const { id } = c.req.param();

  try {
    const templates = templateMatcher.getAvailableTemplates();
    const template = templates.find(t => t.id === id);

    if (!template) {
      return c.json({ error: 'template_not_found' }, 404);
    }

    return c.json(template);

  } catch (error) {
    logger.error('Failed to get template', { error: String(error), templateId: id });
    return c.json({ error: 'template_unavailable' }, 500);
  }
});

// Create dashboard from template
dashboardGenRoutes.post('/templates/:id/create', async (c) => {
  const budget = useBudget(c.req.raw.headers, 3);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!templateMatcher || !hasPgConfig()) {
    return c.json({ error: 'service_not_available' }, 503);
  }

  const { id } = c.req.param();
  const actor = getActorKey(c.req.raw.headers);
  const body = await c.req.json();
  const { name, customizations } = body;

  try {
    const templates = templateMatcher.getAvailableTemplates();
    const template = templates.find(t => t.id === id);

    if (!template) {
      return c.json({ error: 'template_not_found' }, 404);
    }

    // Create dashboard from template
    const [dashboard] = await runPostgresQuery(
      'INSERT INTO dashboards(name, description, layout, theme, filters, is_public, created_by, metadata) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [
        name || template.name,
        template.description,
        JSON.stringify(template.layout),
        JSON.stringify(template.theme),
        JSON.stringify([]),
        false,
        actor,
        JSON.stringify({
          generatedBy: 'template',
          templateId: template.id,
          customizations: customizations || {}
        })
      ]
    );

    // Add widgets
    for (const widget of template.widgets) {
      await runPostgresQuery(
        'INSERT INTO dashboard_widgets(dashboard_id, widget_type, config, position) VALUES($1, $2, $3, $4)',
        [dashboard.id, widget.type, JSON.stringify(widget.config), JSON.stringify(widget.position)]
      );
    }

    return c.json({
      dashboard,
      template: {
        id: template.id,
        name: template.name
      },
      widgetCount: template.widgets.length
    }, 201);

  } catch (error) {
    logger.error('Failed to create dashboard from template', { error: String(error), templateId: id });
    return c.json({ 
      error: 'template_creation_failed', 
      details: String(error) 
    }, 500);
  }
});

// Improve existing dashboard with AI
dashboardGenRoutes.post('/improve',
  zValidator('json', improveDashboardSchema),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 4);
    if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

    if (!dashboardGenerator || !hasPgConfig()) {
      return c.json({ error: 'service_not_available' }, 503);
    }

    const actor = getActorKey(c.req.raw.headers);
    const { dashboardId, feedbackPrompt, specificChanges } = c.req.valid('json');

    try {
      // Get existing dashboard
      const [existingDashboard] = await runPostgresQuery(
        'SELECT * FROM dashboards WHERE id = $1 AND created_by = $2',
        [dashboardId, actor]
      );

      if (!existingDashboard) {
        return c.json({ error: 'dashboard_not_found' }, 404);
      }

      // Get existing widgets
      const widgets = await runPostgresQuery(
        'SELECT * FROM dashboard_widgets WHERE dashboard_id = $1',
        [dashboardId]
      );

      // Generate improvement suggestions
      const improvementContext: GenerationContext = {
        userPrompt: `Improve this dashboard: ${feedbackPrompt}. Current dashboard has ${widgets.length} widgets.`,
        userPreferences: {
          layout: 'grid' // Default for improvements
        }
      };

      const improvedDashboard = await dashboardGenerator.generateDashboard(improvementContext);

      // Create new version of dashboard
      const [newDashboard] = await runPostgresQuery(
        'INSERT INTO dashboards(name, description, layout, theme, filters, is_public, created_by, metadata) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [
          `${existingDashboard.name} (Improved)`,
          improvedDashboard.description,
          JSON.stringify(improvedDashboard.layout),
          JSON.stringify(improvedDashboard.theme),
          existingDashboard.filters,
          existingDashboard.is_public,
          actor,
          JSON.stringify({
            generatedBy: 'ai_improvement',
            originalDashboardId: dashboardId,
            improvementPrompt: feedbackPrompt,
            confidence: improvedDashboard.confidence,
            reasoning: improvedDashboard.reasoning
          })
        ]
      );

      // Add improved widgets
      for (const widget of improvedDashboard.widgets) {
        await runPostgresQuery(
          'INSERT INTO dashboard_widgets(dashboard_id, widget_type, config, position) VALUES($1, $2, $3, $4)',
          [newDashboard.id, widget.type, JSON.stringify(widget.config), JSON.stringify(widget.position)]
        );
      }

      return c.json({
        originalDashboard: existingDashboard,
        improvedDashboard: newDashboard,
        improvements: {
          confidence: improvedDashboard.confidence,
          reasoning: improvedDashboard.reasoning,
          widgetChanges: improvedDashboard.widgets.length - widgets.length
        }
      }, 201);

    } catch (error) {
      logger.error('Dashboard improvement failed', { error: String(error), dashboardId });
      return c.json({ 
        error: 'improvement_failed', 
        details: String(error) 
      }, 500);
    }
  }
);

// Get generation history for a user
dashboardGenRoutes.get('/history', async (c) => {
  const budget = useBudget(c.req.raw.headers, 1);
  if (!budget.ok) return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);

  if (!hasPgConfig()) {
    return c.json({ error: 'database_not_configured' }, 500);
  }

  const actor = getActorKey(c.req.raw.headers);
  const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0'));

  try {
    const dashboards = await runPostgresQuery(
      `SELECT id, name, description, created_at, metadata 
       FROM dashboards 
       WHERE created_by = $1 AND metadata->>'generatedBy' IS NOT NULL
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [actor, limit, offset]
    );

    return c.json({
      dashboards: dashboards.map(d => ({
        ...d,
        metadata: JSON.parse(d.metadata || '{}')
      })),
      limit,
      offset,
      total: dashboards.length
    });

  } catch (error) {
    logger.error('Failed to get generation history', { error: String(error), actor });
    return c.json({ error: 'history_unavailable' }, 500);
  }
});

export default dashboardGenRoutes;