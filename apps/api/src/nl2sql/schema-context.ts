import { runPostgresQuery } from '../postgres.js';
import { logger } from '../logger.js';

interface TableInfo {
  TABLE_NAME: string;
  TABLE_TYPE: string;
  TABLE_OWNER?: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  piiColumns: PIIInfo[];
}

interface ColumnInfo {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  ordinal_position: number;
}

interface ForeignKeyInfo {
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
  CONSTRAINT_NAME: string;
}

interface PIIInfo {
  column_name: string;
  tag: string;
  masking?: string;
}

interface SchemaContext {
  database: string;
  schema: string;
  tables: TableInfo[];
  relationships: string[];
  summary: string;
}

export class SchemaContextProvider {
  /**
   * Gets comprehensive schema context for a specific database and schema
   */
  async getSchemaContext(database: string, schema: string): Promise<SchemaContext> {
    logger.info({ database, schema }, 'Fetching schema context for NL2SQL');

    try {
      // Fetch all tables and views
      const tables = await runPostgresQuery<{
        table_name: string;
        table_type: string;
        table_owner?: string;
      }>(
        'SELECT table_name, table_type, table_owner FROM catalog_tables WHERE database_name = $1 AND schema_name = $2 ORDER BY table_name',
        [database, schema],
      );

      // Fetch all columns
      const columns = await runPostgresQuery<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
        ordinal_position: number;
      }>(
        'SELECT table_name, column_name, data_type, is_nullable, ordinal_position FROM catalog_columns WHERE database_name = $1 AND schema_name = $2 ORDER BY table_name, ordinal_position',
        [database, schema],
      );

      // Fetch foreign keys
      const foreignKeys = await runPostgresQuery<ForeignKeyInfo>(
        'SELECT table_name, column_name, referenced_table_name, referenced_column_name, constraint_name FROM catalog_foreign_keys WHERE database_name = $1 AND schema_name = $2',
        [database, schema],
      );

      // Fetch PII information
      const piiInfo = await runPostgresQuery<{
        table_name: string;
        column_name: string;
        tag: string;
        masking?: string;
      }>(
        'SELECT table_name, column_name, tag, masking FROM catalog_pii WHERE database_name = $1 AND schema_name = $2',
        [database, schema],
      );

      // Group data by table
      const tableInfoMap = new Map<string, TableInfo>();

      // Initialize tables
      for (const table of tables) {
        tableInfoMap.set(table.table_name, {
          TABLE_NAME: table.table_name,
          TABLE_TYPE: table.table_type,
          TABLE_OWNER: table.table_owner,
          columns: [],
          foreignKeys: [],
          piiColumns: [],
        });
      }

      // Add columns to tables
      for (const column of columns) {
        const tableInfo = tableInfoMap.get(column.table_name);
        if (tableInfo) {
          tableInfo.columns.push({
            COLUMN_NAME: column.column_name,
            DATA_TYPE: column.data_type,
            IS_NULLABLE: column.is_nullable,
            ordinal_position: column.ordinal_position,
          });
        }
      }

      // Add foreign keys to tables
      for (const fk of foreignKeys) {
        const tableInfo = tableInfoMap.get(fk.table_name);
        if (tableInfo) {
          tableInfo.foreignKeys.push(fk);
        }
      }

      // Add PII information to tables
      for (const pii of piiInfo) {
        const tableInfo = tableInfoMap.get(pii.table_name);
        if (tableInfo) {
          tableInfo.piiColumns.push({
            column_name: pii.column_name,
            tag: pii.tag,
            masking: pii.masking,
          });
        }
      }

      const tableInfos = Array.from(tableInfoMap.values());
      const relationships = this.extractRelationships(tableInfos);
      const summary = this.generateSchemaSummary(tableInfos, relationships);

      return {
        database,
        schema,
        tables: tableInfos,
        relationships,
        summary,
      };
    } catch (error) {
      logger.error({ error, database, schema }, 'Error fetching schema context');
      throw error;
    }
  }

  /**
   * Gets a focused schema context for specific tables only
   */
  async getFocusedSchemaContext(
    database: string,
    schema: string,
    tableNames: string[],
  ): Promise<SchemaContext> {
    const fullContext = await this.getSchemaContext(database, schema);

    const relevantTables = fullContext.tables.filter((table) =>
      tableNames.includes(table.TABLE_NAME),
    );

    // Include related tables based on foreign keys
    const relatedTableNames = new Set(tableNames);
    for (const table of relevantTables) {
      for (const fk of table.foreignKeys) {
        relatedTableNames.add(fk.REFERENCED_TABLE_NAME);
      }
    }

    const extendedTables = fullContext.tables.filter((table) =>
      relatedTableNames.has(table.TABLE_NAME),
    );

    const relationships = this.extractRelationships(extendedTables);
    const summary = this.generateSchemaSummary(extendedTables, relationships);

    return {
      database,
      schema,
      tables: extendedTables,
      relationships,
      summary,
    };
  }

  /**
   * Generates a natural language schema context for LLM prompts
   */
  generateLLMContext(context: SchemaContext): string {
    let llmContext = `Database Schema Context for ${context.database}.${context.schema}:\n\n`;

    llmContext += `Schema Summary:\n${context.summary}\n\n`;

    llmContext += `Available Tables and Columns:\n`;

    for (const table of context.tables) {
      llmContext += `\n${table.TABLE_NAME} (${table.TABLE_TYPE}):\n`;

      // Add columns with data types
      for (const column of table.columns) {
        const nullable = column.IS_NULLABLE === 'YES' ? ' (nullable)' : ' (not null)';
        llmContext += `  - ${column.COLUMN_NAME}: ${column.DATA_TYPE}${nullable}\n`;
      }

      // Add PII information
      if (table.piiColumns.length > 0) {
        llmContext += `  PII Columns:\n`;
        for (const pii of table.piiColumns) {
          llmContext += `    - ${pii.column_name}: ${pii.tag}${pii.masking ? ` (${pii.masking})` : ''}\n`;
        }
      }

      // Add foreign keys
      if (table.foreignKeys.length > 0) {
        llmContext += `  Foreign Keys:\n`;
        for (const fk of table.foreignKeys) {
          llmContext += `    - ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}\n`;
        }
      }
    }

    if (context.relationships.length > 0) {
      llmContext += `\nTable Relationships:\n`;
      for (const relationship of context.relationships) {
        llmContext += `- ${relationship}\n`;
      }
    }

    llmContext += `\nImportant Notes:\n`;
    llmContext += `- Always use fully qualified table names: ${context.database}.${context.schema}.TABLE_NAME\n`;
    llmContext += `- Be careful with PII columns - they may require special handling\n`;
    llmContext += `- Use appropriate JOINs based on the foreign key relationships shown above\n`;
    llmContext += `- Always include reasonable LIMIT clauses to prevent excessive data retrieval\n`;

    return llmContext;
  }

  /**
   * Extracts relationship descriptions from table information
   */
  private extractRelationships(tables: TableInfo[]): string[] {
    const relationships: string[] = [];

    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        relationships.push(
          `${table.TABLE_NAME}.${fk.COLUMN_NAME} references ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`,
        );
      }
    }

    return relationships;
  }

  /**
   * Generates a high-level summary of the schema
   */
  private generateSchemaSummary(tables: TableInfo[], relationships: string[]): string {
    const tableCount = tables.length;
    const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
    const relationshipCount = relationships.length;
    const piiColumnCount = tables.reduce((sum, table) => sum + table.piiColumns.length, 0);

    let summary = `This schema contains ${tableCount} table(s) with ${columnCount} total columns`;

    if (relationshipCount > 0) {
      summary += ` and ${relationshipCount} foreign key relationship(s)`;
    }

    if (piiColumnCount > 0) {
      summary += `. ${piiColumnCount} column(s) contain PII data and require special handling`;
    }

    summary += '.';

    // Add table type breakdown
    const tableTypes = tables.reduce(
      (acc, table) => {
        acc[table.TABLE_TYPE] = (acc[table.TABLE_TYPE] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    if (Object.keys(tableTypes).length > 1) {
      const typeDescriptions = Object.entries(tableTypes)
        .map(([type, count]) => `${count} ${type.toLowerCase()}(s)`)
        .join(', ');
      summary += ` The schema includes ${typeDescriptions}.`;
    }

    return summary;
  }

  /**
   * Suggests relevant tables based on natural language query keywords
   */
  async suggestRelevantTables(database: string, schema: string, query: string): Promise<string[]> {
    const context = await this.getSchemaContext(database, schema);
    const queryLower = query.toLowerCase();
    const relevantTables: string[] = [];

    for (const table of context.tables) {
      const tableLower = table.TABLE_NAME.toLowerCase();

      // Direct table name match
      if (queryLower.includes(tableLower)) {
        relevantTables.push(table.TABLE_NAME);
        continue;
      }

      // Column name matches
      for (const column of table.columns) {
        const columnLower = column.COLUMN_NAME.toLowerCase();
        if (queryLower.includes(columnLower)) {
          relevantTables.push(table.TABLE_NAME);
          break;
        }
      }
    }

    // If no direct matches, use simple heuristics
    if (relevantTables.length === 0) {
      // Look for common business terms
      const businessTerms = [
        'customer',
        'order',
        'product',
        'sale',
        'user',
        'account',
        'transaction',
      ];

      for (const term of businessTerms) {
        if (queryLower.includes(term)) {
          for (const table of context.tables) {
            if (table.TABLE_NAME.toLowerCase().includes(term)) {
              relevantTables.push(table.TABLE_NAME);
            }
          }
        }
      }
    }

    // Remove duplicates and return
    return [...new Set(relevantTables)];
  }
}

export const schemaContextProvider = new SchemaContextProvider();
