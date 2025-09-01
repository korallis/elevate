import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getNL2SQLEngine } from '../nl2sql/nl2sql-engine.js';
import { queryValidator } from '../nl2sql/query-validator.js';
import { queryOptimizer } from '../nl2sql/query-optimizer.js';
import { schemaContextProvider } from '../nl2sql/schema-context.js';
import { guardrailsSystem } from '../nl2sql/guardrails.js';
import { useBudget, getActorKey } from '../budget.js';
import { logger, logError } from '../logger.js';
import { runPostgresQuery } from '../postgres.js';
import { discovery } from '../snowflake.js';

const app = new Hono();

// Validation schemas
const convertSchema = z.object({
  naturalLanguage: z.string().min(1).max(1000),
  database: z.string().min(1),
  schema: z.string().min(1),
  context: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(100).max(4000).optional()
});

const validateSchema = z.object({
  sql: z.string().min(1),
  database: z.string().min(1),
  schema: z.string().min(1)
});

const executeSchema = z.object({
  queryId: z.number().int().positive(),
  limit: z.number().int().min(1).max(10000).optional()
});

const feedbackSchema = z.object({
  queryId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional()
});

const allowlistSchema = z.object({
  database: z.string().min(1),
  schema: z.string().optional(),
  table: z.string().optional(),
  column: z.string().optional(),
  allowed: z.boolean(),
  reason: z.string().optional()
});

const denylistSchema = z.object({
  pattern: z.string().min(1),
  patternType: z.enum(['regex', 'sql_keyword', 'table_name', 'column_name']),
  reason: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical'])
});

// Helper function to get user ID from request headers
function getUserId(headers: Headers): number | undefined {
  const actorKey = getActorKey(headers);
  // Extract user ID from actor key - this would depend on your auth implementation
  // For now, return undefined if no user ID can be extracted
  return undefined;
}

/**
 * POST /nl2sql/convert - Convert natural language to SQL
 */
app.post('/convert', 
  zValidator('json', convertSchema),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 10); // Higher cost for AI operations
    if (!budget.ok) {
      return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
    }

    try {
      const { naturalLanguage, database, schema, context, temperature, maxTokens } = c.req.valid('json');
      const userId = getUserId(c.req.raw.headers);

      const engine = getNL2SQLEngine();
      const result = await engine.convertToSQL({
        naturalLanguage,
        database,
        schema,
        userId,
        context,
        temperature,
        maxTokens
      });

      if (!result.success) {
        return c.json({
          success: false,
          errors: result.errors,
          suggestions: result.suggestions
        }, 400);
      }

      return c.json({
        success: true,
        sql: result.sql,
        optimizedSql: result.optimizedSql,
        explanation: result.explanation,
        confidence: result.confidence,
        warnings: result.warnings,
        suggestions: result.suggestions,
        queryId: result.queryId
      });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_convert_error' });
      return c.json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to convert natural language to SQL'
      }, 500);
    }
  }
);

/**
 * POST /nl2sql/validate - Validate generated SQL
 */
app.post('/validate',
  zValidator('json', validateSchema),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 3);
    if (!budget.ok) {
      return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
    }

    try {
      const { sql, database, schema } = c.req.valid('json');
      const userId = getUserId(c.req.raw.headers);

      const result = await queryValidator.validateQuery(sql, database, schema, userId);

      return c.json({
        isValid: result.isValid,
        errors: result.errors,
        warnings: result.warnings,
        sanitizedSql: result.sanitizedSql,
        estimatedCost: result.estimatedCost
      });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_validate_error' });
      return c.json({
        error: 'Internal server error',
        message: 'Failed to validate SQL query'
      }, 500);
    }
  }
);

/**
 * POST /nl2sql/execute - Execute validated query
 */
app.post('/execute',
  zValidator('json', executeSchema),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 5);
    if (!budget.ok) {
      return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
    }

    try {
      const { queryId, limit } = c.req.valid('json');
      const userId = getUserId(c.req.raw.headers);

      // Get the query from database
      const queryRows = await runPostgresQuery<{
        id: number;
        generated_sql: string;
        validated: boolean;
        database_name: string;
        schema_name: string;
        user_id: number | null;
      }>(
        'SELECT id, generated_sql, validated, database_name, schema_name, user_id FROM nl_queries WHERE id = $1',
        [queryId]
      );

      if (queryRows.length === 0) {
        return c.json({ error: 'Query not found' }, 404);
      }

      const query = queryRows[0];

      // Check if user owns this query or has permission
      if (userId && query.user_id && query.user_id !== userId) {
        return c.json({ error: 'Unauthorized' }, 403);
      }

      if (!query.validated) {
        return c.json({ 
          error: 'Query not validated', 
          message: 'Query must be validated before execution' 
        }, 400);
      }

      // Add limit if specified and not already present
      let executionSql = query.generated_sql;
      if (limit && !executionSql.toUpperCase().includes('LIMIT')) {
        executionSql = executionSql.replace(/;?\s*$/, ` LIMIT ${limit}`);
      }

      // Execute the query
      const startTime = Date.now();
      let executionSuccess = false;
      let executionError: string | null = null;
      let results: any[] = [];

      try {
        // TODO: Implement actual query execution using Snowflake connection
        // For now, return mock results
        results = [
          { message: 'Query execution not yet implemented', sql: executionSql }
        ];
        executionSuccess = true;
      } catch (execError) {
        executionSuccess = false;
        executionError = execError instanceof Error ? execError.message : String(execError);
        logger.error({ error: execError, sql: executionSql }, 'Query execution failed');
      }

      const executionTime = Date.now() - startTime;

      // Update query execution status
      await runPostgresQuery(
        `UPDATE nl_queries 
         SET executed = true, execution_success = $1, execution_error = $2, 
             execution_time_ms = $3, row_count = $4, updated_at = NOW()
         WHERE id = $5`,
        [
          executionSuccess, 
          executionError, 
          executionTime, 
          results.length,
          queryId
        ]
      );

      if (!executionSuccess) {
        return c.json({
          success: false,
          error: 'Query execution failed',
          message: executionError,
          executionTime
        }, 400);
      }

      return c.json({
        success: true,
        results,
        rowCount: results.length,
        executionTime,
        sql: executionSql
      });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_execute_error' });
      return c.json({
        error: 'Internal server error',
        message: 'Failed to execute query'
      }, 500);
    }
  }
);

/**
 * GET /nl2sql/history - Get query history
 */
app.get('/history', async (c) => {
  try {
    const userId = getUserId(c.req.raw.headers);
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam), 100) : 50;

    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const engine = getNL2SQLEngine();
    const history = await engine.getQueryHistory(userId, limit);

    return c.json({ history });

  } catch (error) {
    logError(logger, error, { event: 'nl2sql_history_error' });
    return c.json({
      error: 'Internal server error',
      message: 'Failed to get query history'
    }, 500);
  }
});

/**
 * POST /nl2sql/feedback - Provide feedback on results
 */
app.post('/feedback',
  zValidator('json', feedbackSchema),
  async (c) => {
    try {
      const { queryId, rating, comment } = c.req.valid('json');
      const userId = getUserId(c.req.raw.headers);

      const engine = getNL2SQLEngine();
      const success = await engine.recordFeedback(queryId, rating, comment, userId);

      if (!success) {
        return c.json({ 
          error: 'Failed to record feedback',
          message: 'Query not found or access denied'
        }, 400);
      }

      return c.json({ success: true, message: 'Feedback recorded successfully' });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_feedback_error' });
      return c.json({
        error: 'Internal server error',
        message: 'Failed to record feedback'
      }, 500);
    }
  }
);

/**
 * GET /nl2sql/suggestions - Get query suggestions
 */
app.get('/suggestions', async (c) => {
  try {
    const database = c.req.query('database');
    const schema = c.req.query('schema');
    const query = c.req.query('q');

    if (!database || !schema || !query) {
      return c.json({ 
        error: 'Missing required parameters',
        message: 'database, schema, and q parameters are required'
      }, 400);
    }

    // Get relevant tables based on query keywords
    const relevantTables = await schemaContextProvider.suggestRelevantTables(
      database,
      schema,
      query
    );

    // Generate some example queries based on common patterns
    const suggestions: string[] = [];
    
    if (query.toLowerCase().includes('count') || query.toLowerCase().includes('total')) {
      suggestions.push('Show me the total count of records in each table');
      suggestions.push('What is the count of records created in the last 30 days?');
    }

    if (query.toLowerCase().includes('recent') || query.toLowerCase().includes('latest')) {
      suggestions.push('Show me the 10 most recent records');
      suggestions.push('What are the latest changes made today?');
    }

    if (query.toLowerCase().includes('top') || query.toLowerCase().includes('best')) {
      suggestions.push('Show me the top 10 records by value');
      suggestions.push('What are the best performing items this month?');
    }

    return c.json({
      relevantTables,
      suggestions: suggestions.length > 0 ? suggestions : [
        'Show me all records from the main table',
        'Count the total number of records',
        'Show me the most recent entries'
      ]
    });

  } catch (error) {
    logError(logger, error, { event: 'nl2sql_suggestions_error' });
    return c.json({
      error: 'Internal server error',
      message: 'Failed to get suggestions'
    }, 500);
  }
});

/**
 * POST /nl2sql/explain - Explain SQL query
 */
app.post('/explain',
  zValidator('json', z.object({ sql: z.string().min(1) })),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 3);
    if (!budget.ok) {
      return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
    }

    try {
      const { sql } = c.req.valid('json');
      
      const engine = getNL2SQLEngine();
      const result = await engine.explainQuery(sql);

      return c.json({
        explanation: result.explanation,
        confidence: result.confidence
      });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_explain_error' });
      return c.json({
        error: 'Internal server error',
        message: 'Failed to explain query'
      }, 500);
    }
  }
);

/**
 * POST /nl2sql/optimize - Get optimization suggestions
 */
app.post('/optimize',
  zValidator('json', validateSchema),
  async (c) => {
    const budget = useBudget(c.req.raw.headers, 2);
    if (!budget.ok) {
      return c.json({ error: 'rate_limited', remaining: budget.remaining }, 429);
    }

    try {
      const { sql, database, schema } = c.req.valid('json');

      const result = await queryOptimizer.optimizeQuery(sql, database, schema, {
        addLimits: true,
        pruneColumns: true,
        optimizeJoins: true,
        suggestIndexes: true
      });

      return c.json({
        originalSql: result.originalSql,
        optimizedSql: result.optimizedSql,
        optimizations: result.optimizations,
        estimatedImprovement: result.estimatedImprovementPercent
      });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_optimize_error' });
      return c.json({
        error: 'Internal server error',
        message: 'Failed to optimize query'
      }, 500);
    }
  }
);

// Admin routes for managing guardrails

/**
 * POST /nl2sql/admin/allowlist - Add allowlist rule
 */
app.post('/admin/allowlist',
  zValidator('json', allowlistSchema),
  async (c) => {
    // Add authentication/authorization check for admin users here
    
    try {
      const { database, schema, table, column, allowed, reason } = c.req.valid('json');
      const userId = getUserId(c.req.raw.headers);

      await guardrailsSystem.addAllowlistRule(
        database,
        schema,
        table,
        column,
        allowed,
        reason,
        userId
      );

      return c.json({ success: true, message: 'Allowlist rule added successfully' });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_admin_allowlist_error' });
      return c.json({
        error: 'Internal server error',
        message: 'Failed to add allowlist rule'
      }, 500);
    }
  }
);

/**
 * POST /nl2sql/admin/denylist - Add denylist rule
 */
app.post('/admin/denylist',
  zValidator('json', denylistSchema),
  async (c) => {
    // Add authentication/authorization check for admin users here
    
    try {
      const { pattern, patternType, reason, severity } = c.req.valid('json');
      const userId = getUserId(c.req.raw.headers);

      await guardrailsSystem.addDenylistRule(
        pattern,
        patternType,
        reason,
        severity,
        userId
      );

      return c.json({ success: true, message: 'Denylist rule added successfully' });

    } catch (error) {
      logError(logger, error, { event: 'nl2sql_admin_denylist_error' });
      return c.json({
        error: 'Internal server error',
        message: 'Failed to add denylist rule'
      }, 500);
    }
  }
);

/**
 * GET /nl2sql/admin/stats - Get NL2SQL usage statistics
 */
app.get('/admin/stats', async (c) => {
  // Add authentication/authorization check for admin users here
  
  try {
    const stats = await runPostgresQuery(`
      SELECT 
        COUNT(*) as total_queries,
        COUNT(CASE WHEN executed = true THEN 1 END) as executed_queries,
        COUNT(CASE WHEN execution_success = true THEN 1 END) as successful_queries,
        AVG(confidence_score) as avg_confidence,
        AVG(execution_time_ms) as avg_execution_time,
        COUNT(CASE WHEN feedback_rating IS NOT NULL THEN 1 END) as queries_with_feedback,
        AVG(feedback_rating) as avg_rating
      FROM nl_queries 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

    const recentQueries = await runPostgresQuery(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as query_count
      FROM nl_queries 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    return c.json({
      summary: stats[0] || {},
      dailyStats: recentQueries
    });

  } catch (error) {
    logError(logger, error, { event: 'nl2sql_admin_stats_error' });
    return c.json({
      error: 'Internal server error',
      message: 'Failed to get statistics'
    }, 500);
  }
});

export default app;