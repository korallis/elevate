import OpenAI from 'openai';
import { schemaContextProvider, SchemaContextProvider } from './schema-context.js';
import { queryValidator, QueryValidator } from './query-validator.js';
import { queryOptimizer, QueryOptimizer } from './query-optimizer.js';
// import { guardrailsSystem } from './guardrails.js'; // Not used directly
import { logger } from '../logger.js';
import { runPostgresQuery } from '../postgres.js';

interface NL2SQLRequest {
  naturalLanguage: string;
  database: string;
  schema: string;
  userId?: number;
  context?: string;
  temperature?: number;
  maxTokens?: number;
}

interface NL2SQLResult {
  success: boolean;
  sql?: string;
  explanation?: string;
  confidence: number;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
  optimizedSql?: string;
  queryId?: number;
}

// interface ConversationContext { // Not used yet
//   previousQueries: Array<{
//     naturalLanguage: string;
//     sql: string;
//     success: boolean;
//   }>;
//   schemaContext?: string;
// }

const SYSTEM_PROMPT = `You are an expert SQL query generator. Your role is to convert natural language questions into accurate, safe, and efficient SQL queries.

GUIDELINES:
1. Always generate SELECT statements only (no INSERT, UPDATE, DELETE, DROP, etc.)
2. Use fully qualified table names (database.schema.table_name)
3. Include appropriate WHERE clauses to limit results
4. Add LIMIT clauses when not using aggregations
5. Use proper JOINs based on foreign key relationships
6. Be careful with PII columns and respect data privacy
7. Generate efficient queries that minimize data scanning
8. Include helpful comments explaining complex logic
9. Use standard SQL syntax compatible with Snowflake

RESPONSE FORMAT:
Return a JSON object with:
- sql: The generated SQL query
- explanation: Clear explanation of what the query does
- confidence: Number between 0.0 and 1.0 indicating confidence in the result
- assumptions: Array of assumptions made during query generation`;

export class NL2SQLEngine {
  private openai: OpenAI;
  private schemaProvider: SchemaContextProvider;
  private validator: QueryValidator;
  private optimizer: QueryOptimizer;

  constructor(
    apiKey?: string,
    schemaProvider?: SchemaContextProvider,
    validator?: QueryValidator,
    optimizer?: QueryOptimizer,
  ) {
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey parameter.',
      );
    }

    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    this.schemaProvider = schemaProvider || schemaContextProvider;
    this.validator = validator || queryValidator;
    this.optimizer = optimizer || queryOptimizer;
  }

  /**
   * Converts natural language to SQL
   */
  async convertToSQL(request: NL2SQLRequest): Promise<NL2SQLResult> {
    logger.info(
      {
        naturalLanguage: request.naturalLanguage.substring(0, 100),
        database: request.database,
        schema: request.schema,
      },
      'Converting natural language to SQL',
    );

    try {
      // 1. Get schema context
      const schemaContext = await this.schemaProvider.getSchemaContext(
        request.database,
        request.schema,
      );
      const llmContext = this.schemaProvider.generateLLMContext(schemaContext);

      // 2. Generate SQL using OpenAI
      const generationResult = await this.generateSQL({
        ...request,
        schemaContext: llmContext,
      });

      if (!generationResult.success || !generationResult.sql) {
        return {
          success: false,
          confidence: 0,
          errors: generationResult.errors || ['Failed to generate SQL'],
          suggestions: ['Try rephrasing your question', 'Be more specific about the data you need'],
        };
      }

      // 3. Validate the generated SQL
      const validationResult = await this.validator.validateQuery(
        generationResult.sql,
        request.database,
        request.schema,
        request.userId,
      );

      if (!validationResult.isValid) {
        // Try to fix common issues and regenerate
        const fixedResult = await this.attemptQueryFix(
          generationResult.sql,
          validationResult.errors,
          request,
        );

        if (fixedResult.success && fixedResult.sql) {
          generationResult.sql = fixedResult.sql;
          generationResult.explanation = fixedResult.explanation || generationResult.explanation;
        } else {
          return {
            success: false,
            confidence: generationResult.confidence * 0.5, // Reduce confidence due to validation failure
            errors: validationResult.errors.map((e) => e.message),
            warnings: validationResult.warnings.map((w) => w.message),
            suggestions: validationResult.errors
              .filter((e) => e.suggestion)
              .map((e) => e.suggestion!),
          };
        }
      }

      // 4. Optimize the query
      let optimizedSql = generationResult.sql;
      try {
        const optimizationResult = await this.optimizer.optimizeQuery(
          generationResult.sql,
          request.database,
          request.schema,
          {
            addLimits: true,
            optimizeJoins: true,
            suggestIndexes: false, // Don't include index suggestions in the main result
          },
        );

        if (optimizationResult.optimizedSql !== generationResult.sql) {
          optimizedSql = optimizationResult.optimizedSql;
        }
      } catch (optimizationError) {
        logger.warn(
          { error: optimizationError },
          'Query optimization failed, using original query',
        );
      }

      // 5. Store the query for audit and learning
      const queryId = await this.storeQuery({
        naturalLanguage: request.naturalLanguage,
        sql: generationResult.sql,
        optimizedSql,
        database: request.database,
        schema: request.schema,
        userId: request.userId,
        confidence: generationResult.confidence,
        validated: validationResult.isValid,
      });

      return {
        success: true,
        sql: generationResult.sql,
        optimizedSql: optimizedSql !== generationResult.sql ? optimizedSql : undefined,
        explanation: generationResult.explanation,
        confidence: generationResult.confidence,
        warnings: validationResult.warnings.map((w) => w.message),
        suggestions: this.generateSuggestions(request, generationResult),
        queryId,
      };
    } catch (error) {
      logger.error({ error, request }, 'Error in NL2SQL conversion');

      return {
        success: false,
        confidence: 0,
        errors: ['Internal error occurred during query generation'],
        suggestions: ['Please try again with a simpler question'],
      };
    }
  }

  /**
   * Generates SQL using OpenAI API
   */
  private async generateSQL(request: NL2SQLRequest & { schemaContext: string }): Promise<{
    success: boolean;
    sql?: string;
    explanation?: string;
    confidence: number;
    errors?: string[];
  }> {
    try {
      const prompt = this.buildPrompt(request);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4', // Using GPT-4 for better SQL generation quality
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: request.temperature || 0.1, // Low temperature for more consistent SQL generation
        max_tokens: request.maxTokens || 2000,
        response_format: { type: 'json_object' },
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return {
          success: false,
          confidence: 0,
          errors: ['No response from OpenAI'],
        };
      }

      // Parse the JSON response
      let parsedResponse: {
        sql: string;
        explanation: string;
        confidence: number;
        assumptions?: string[];
      };

      try {
        parsedResponse = JSON.parse(response);
      } catch (parseError) {
        logger.error({ error: parseError, response }, 'Failed to parse OpenAI response as JSON');
        return {
          success: false,
          confidence: 0,
          errors: ['Invalid response format from AI model'],
        };
      }

      // Validate the response structure
      if (!parsedResponse.sql) {
        return {
          success: false,
          confidence: 0,
          errors: ['No SQL query in response'],
        };
      }

      return {
        success: true,
        sql: parsedResponse.sql.trim(),
        explanation: parsedResponse.explanation,
        confidence: Math.min(Math.max(parsedResponse.confidence || 0.7, 0), 1), // Clamp between 0 and 1
      };
    } catch (error) {
      logger.error({ error, request: request.naturalLanguage }, 'OpenAI API error');

      if (error instanceof Error) {
        if (error.message.includes('rate limit')) {
          return {
            success: false,
            confidence: 0,
            errors: ['Rate limit exceeded. Please try again in a moment.'],
          };
        } else if (error.message.includes('quota')) {
          return {
            success: false,
            confidence: 0,
            errors: ['API quota exceeded. Please contact your administrator.'],
          };
        }
      }

      return {
        success: false,
        confidence: 0,
        errors: ['Failed to generate SQL query'],
      };
    }
  }

  /**
   * Builds the prompt for OpenAI
   */
  private buildPrompt(request: NL2SQLRequest & { schemaContext: string }): string {
    let prompt = `Generate a SQL query for the following request:

NATURAL LANGUAGE QUERY:
${request.naturalLanguage}

DATABASE SCHEMA CONTEXT:
${request.schemaContext}

TARGET DATABASE: ${request.database}
TARGET SCHEMA: ${request.schema}

`;

    if (request.context) {
      prompt += `ADDITIONAL CONTEXT:
${request.context}

`;
    }

    prompt += `REQUIREMENTS:
- Generate ONLY a SELECT query
- Use fully qualified table names (${request.database}.${request.schema}.TABLE_NAME)
- Include appropriate WHERE clauses to filter results
- Add LIMIT clause unless using aggregations
- Use proper JOINs based on the foreign key relationships shown above
- Be mindful of PII columns and data privacy
- Generate efficient queries that minimize data scanning
- Use standard SQL syntax

Please respond with a JSON object containing:
- sql: The complete SQL query
- explanation: Clear explanation of what the query does and how it addresses the request
- confidence: Your confidence in the query (0.0 to 1.0)
- assumptions: Array of any assumptions you made (optional)`;

    return prompt;
  }

  /**
   * Attempts to fix a query based on validation errors
   */
  private async attemptQueryFix(
    originalSql: string,
    errors: Array<{ message: string; suggestion?: string }>,
    _request: NL2SQLRequest,
  ): Promise<{ success: boolean; sql?: string; explanation?: string }> {
    try {
      const errorMessages = errors.map((e) => e.message).join('; ');
      const suggestions = errors
        .filter((e) => e.suggestion)
        .map((e) => e.suggestion!)
        .join('; ');

      const fixPrompt = `The following SQL query has validation errors. Please fix them:

ORIGINAL QUERY:
${originalSql}

VALIDATION ERRORS:
${errorMessages}

SUGGESTIONS FOR FIXES:
${suggestions}

Please provide a corrected version that addresses all the validation errors while maintaining the original intent.

Respond with JSON containing:
- sql: The corrected SQL query
- explanation: What was fixed and why`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: fixPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return { success: false };
      }

      const parsedResponse = JSON.parse(response);

      return {
        success: !!parsedResponse.sql,
        sql: parsedResponse.sql?.trim(),
        explanation: parsedResponse.explanation,
      };
    } catch (error) {
      logger.error({ error, originalSql }, 'Failed to fix query');
      return { success: false };
    }
  }

  /**
   * Generates helpful suggestions for the user
   */
  private generateSuggestions(request: NL2SQLRequest, result: { confidence: number }): string[] {
    const suggestions: string[] = [];

    // Suggest more specific queries if confidence is low
    if (result.confidence < 0.7) {
      suggestions.push('Try being more specific about which columns or time periods you need');
      suggestions.push("Provide more context about the business problem you're trying to solve");
    }

    // Suggest related queries based on the schema
    if (
      request.naturalLanguage.toLowerCase().includes('total') ||
      request.naturalLanguage.toLowerCase().includes('count')
    ) {
      suggestions.push('You might also want to see breakdowns by time period or category');
    }

    if (
      request.naturalLanguage.toLowerCase().includes('recent') ||
      request.naturalLanguage.toLowerCase().includes('latest')
    ) {
      suggestions.push('Consider specifying an exact date range for more precise results');
    }

    return suggestions;
  }

  /**
   * Stores the query in the database for audit and learning purposes
   */
  private async storeQuery(data: {
    naturalLanguage: string;
    sql: string;
    optimizedSql?: string;
    database: string;
    schema: string;
    userId?: number;
    confidence: number;
    validated: boolean;
  }): Promise<number> {
    try {
      const result = await runPostgresQuery<{ id: number }>(
        `INSERT INTO nl_queries (natural_language, generated_sql, validated, database_name, schema_name, user_id, confidence_score, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [
          data.naturalLanguage,
          data.optimizedSql || data.sql,
          data.validated,
          data.database,
          data.schema,
          data.userId || null,
          data.confidence,
        ],
      );

      return result[0]?.id || 0;
    } catch (error) {
      logger.error({ error, data }, 'Failed to store query');
      return 0;
    }
  }

  /**
   * Gets query history for a user
   */
  async getQueryHistory(
    userId: number,
    limit: number = 50,
  ): Promise<
    Array<{
      id: number;
      naturalLanguage: string;
      sql: string;
      confidence: number;
      createdAt: string;
      executed: boolean;
      executionSuccess?: boolean;
    }>
  > {
    try {
      return await runPostgresQuery(
        `SELECT id, natural_language, generated_sql as sql, confidence_score as confidence, 
                created_at as "createdAt", executed, execution_success as "executionSuccess"
         FROM nl_queries 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, limit],
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get query history');
      return [];
    }
  }

  /**
   * Records feedback on a query
   */
  async recordFeedback(
    queryId: number,
    rating: number,
    comment?: string,
    userId?: number,
  ): Promise<boolean> {
    try {
      await runPostgresQuery(
        `UPDATE nl_queries 
         SET feedback_rating = $1, feedback_comment = $2, updated_at = NOW()
         WHERE id = $3 AND (user_id = $4 OR $4 IS NULL)`,
        [rating, comment || null, queryId, userId || null],
      );

      logger.info({ queryId, rating, userId }, 'Query feedback recorded');
      return true;
    } catch (error) {
      logger.error({ error, queryId, rating, userId }, 'Failed to record feedback');
      return false;
    }
  }

  /**
   * Explains a SQL query in natural language
   */
  async explainQuery(sql: string): Promise<{ explanation: string; confidence: number }> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at explaining SQL queries in simple, clear language. Break down complex queries into understandable steps.',
          },
          {
            role: 'user',
            content: `Explain this SQL query in clear, non-technical language:\n\n${sql}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const explanation = completion.choices[0]?.message?.content || 'Unable to explain query';

      return {
        explanation,
        confidence: 0.8,
      };
    } catch (error) {
      logger.error({ error, sql }, 'Failed to explain query');
      return {
        explanation: 'Unable to explain this query at the moment',
        confidence: 0,
      };
    }
  }

  /**
   * Suggests query improvements based on common patterns
   */
  async suggestImprovements(sql: string, database: string, schema: string): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      // Use the optimizer to get suggestions
      const optimizationResult = await this.optimizer.optimizeQuery(sql, database, schema, {
        suggestIndexes: true,
      });

      // Convert optimization suggestions to user-friendly language
      for (const optimization of optimizationResult.optimizations) {
        if (optimization.type === 'limit_addition') {
          suggestions.push('Consider adding a LIMIT clause to prevent retrieving too much data');
        } else if (optimization.type === 'column_pruning') {
          suggestions.push('Specify exact columns instead of SELECT * for better performance');
        } else if (optimization.type === 'join_optimization') {
          suggestions.push('Review JOIN conditions for optimal performance');
        }
      }
    } catch (error) {
      logger.error({ error, sql }, 'Failed to suggest improvements');
    }

    return suggestions;
  }
}

// Create and export a default instance
let defaultEngine: NL2SQLEngine | null = null;

export function getNL2SQLEngine(): NL2SQLEngine {
  if (!defaultEngine) {
    defaultEngine = new NL2SQLEngine();
  }
  return defaultEngine;
}

export { NL2SQLEngine };
