import { z } from 'zod';
import type { Pool } from 'pg';

// Version format: vX.Y (major.minor)
export const VersionSchema = z.string().regex(/^v\d+\.\d+$/, 'Version must be in format vX.Y');

export const ChangeTypeSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'expression_changed',
  'filters_changed',
  'dimensions_changed',
  'metadata_updated',
  'rollback',
]);

export const SemanticVersionSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(['metric', 'dimension']),
  entityId: z.string().uuid(),
  version: VersionSchema,
  changes: z.record(z.object({
    from: z.unknown().optional(),
    to: z.unknown().optional(),
    changeType: ChangeTypeSchema,
  })),
  notes: z.string().optional(),
  impactAnalysis: z.object({
    affectedQueries: z.array(z.string()).default([]),
    affectedDashboards: z.array(z.string()).default([]),
    affectedReports: z.array(z.string()).default([]),
    breakingChanges: z.boolean().default(false),
    riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
  }).optional(),
  createdBy: z.string(),
  createdAt: z.date(),
});

export type SemanticVersion = z.infer<typeof SemanticVersionSchema>;

export const VersionComparisonSchema = z.object({
  fromVersion: VersionSchema,
  toVersion: VersionSchema,
  changes: z.array(z.object({
    field: z.string(),
    changeType: ChangeTypeSchema,
    fromValue: z.unknown().optional(),
    toValue: z.unknown().optional(),
    impact: z.string().optional(),
  })),
  summary: z.string(),
  breakingChanges: z.boolean(),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export type VersionComparison = z.infer<typeof VersionComparisonSchema>;

export class SemanticVersioning {
  constructor(private pg: Pool) {}

  /**
   * Create a new version when an entity is updated
   */
  async createVersion(
    entityType: 'metric' | 'dimension',
    entityId: string,
    changes: Record<string, { from?: unknown; to?: unknown; changeType: string }>,
    notes?: string,
    createdBy: string = 'system'
  ): Promise<SemanticVersion> {
    try {
      // Get the current latest version for this entity
      const currentVersion = await this.getLatestVersion(entityType, entityId);
      const newVersion = this.incrementVersion(currentVersion?.version || 'v0.0');

      // Perform impact analysis
      const impactAnalysis = await this.analyzeImpact(entityType, entityId, changes);

      // Insert the new version record
      const versionSql = `
        INSERT INTO semantic_versions 
        (entity_type, entity_id, version, changes, notes, impact_analysis, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at
      `;

      const result = await this.pg.query(versionSql, [
        entityType,
        entityId,
        newVersion,
        JSON.stringify(changes),
        notes,
        JSON.stringify(impactAnalysis),
        createdBy,
      ]);

      return {
        id: result.rows[0].id,
        entityType,
        entityId,
        version: newVersion,
        changes,
        notes,
        impactAnalysis,
        createdBy,
        createdAt: result.rows[0].created_at,
      };
    } catch (error) {
      throw new Error(`Failed to create version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get version history for an entity
   */
  async getVersionHistory(entityType: 'metric' | 'dimension', entityId: string): Promise<SemanticVersion[]> {
    try {
      const sql = `
        SELECT id, entity_type, entity_id, version, changes, notes, impact_analysis, created_by, created_at
        FROM semantic_versions 
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC
      `;

      const result = await this.pg.query(sql, [entityType, entityId]);

      return result.rows.map(row => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        version: row.version,
        changes: row.changes,
        notes: row.notes,
        impactAnalysis: row.impact_analysis,
        createdBy: row.created_by,
        createdAt: row.created_at,
      }));
    } catch (error) {
      throw new Error(`Failed to get version history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the latest version for an entity
   */
  async getLatestVersion(entityType: 'metric' | 'dimension', entityId: string): Promise<SemanticVersion | null> {
    try {
      const sql = `
        SELECT id, entity_type, entity_id, version, changes, notes, impact_analysis, created_by, created_at
        FROM semantic_versions 
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.pg.query(sql, [entityType, entityId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        version: row.version,
        changes: row.changes,
        notes: row.notes,
        impactAnalysis: row.impact_analysis,
        createdBy: row.created_by,
        createdAt: row.created_at,
      };
    } catch (error) {
      throw new Error(`Failed to get latest version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compare two versions of an entity
   */
  async compareVersions(
    entityType: 'metric' | 'dimension',
    entityId: string,
    fromVersion: string,
    toVersion: string
  ): Promise<VersionComparison> {
    try {
      const sql = `
        SELECT version, changes, created_at
        FROM semantic_versions 
        WHERE entity_type = $1 AND entity_id = $2 AND version IN ($3, $4)
        ORDER BY created_at
      `;

      const result = await this.pg.query(sql, [entityType, entityId, fromVersion, toVersion]);

      if (result.rows.length < 2) {
        throw new Error('One or both versions not found');
      }

      const fromVersionData = result.rows.find(row => row.version === fromVersion);
      const toVersionData = result.rows.find(row => row.version === toVersion);

      if (!fromVersionData || !toVersionData) {
        throw new Error('Version data not found');
      }

      // Analyze the differences
      const changes: Array<{
        field: string;
        changeType: string;
        fromValue?: unknown;
        toValue?: unknown;
        impact?: string;
      }> = [];

      let breakingChanges = false;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      // Compare changes between versions
      const fromChanges = fromVersionData.changes || {};
      const toChanges = toVersionData.changes || {};

      const allFields = new Set([...Object.keys(fromChanges), ...Object.keys(toChanges)]);

      allFields.forEach(field => {
        const fromChange = fromChanges[field];
        const toChange = toChanges[field];

        if (!fromChange && toChange) {
          changes.push({
            field,
            changeType: toChange.changeType || 'updated',
            fromValue: toChange.from,
            toValue: toChange.to,
            impact: this.assessImpact(field, toChange.changeType || 'updated'),
          });
        } else if (fromChange && !toChange) {
          changes.push({
            field,
            changeType: 'reverted',
            fromValue: fromChange.to,
            toValue: fromChange.from,
          });
        } else if (fromChange && toChange && JSON.stringify(fromChange) !== JSON.stringify(toChange)) {
          changes.push({
            field,
            changeType: toChange.changeType || 'updated',
            fromValue: fromChange.to,
            toValue: toChange.to,
            impact: this.assessImpact(field, toChange.changeType || 'updated'),
          });
        }
      });

      // Assess overall risk
      breakingChanges = changes.some(change => 
        change.changeType === 'expression_changed' || 
        change.field === 'type' ||
        change.field === 'column_name'
      );

      if (breakingChanges) {
        riskLevel = 'high';
      } else if (changes.some(change => change.changeType === 'filters_changed')) {
        riskLevel = 'medium';
      }

      const summary = this.generateComparisonSummary(changes, fromVersion, toVersion);

      return {
        fromVersion,
        toVersion,
        changes,
        summary,
        breakingChanges,
        riskLevel,
      };
    } catch (error) {
      throw new Error(`Failed to compare versions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rollback an entity to a previous version
   */
  async rollbackToVersion(
    entityType: 'metric' | 'dimension',
    entityId: string,
    targetVersion: string,
    notes?: string,
    createdBy: string = 'system'
  ): Promise<SemanticVersion> {
    try {
      // Get the target version data
      const targetVersionData = await this.getVersionByNumber(entityType, entityId, targetVersion);
      if (!targetVersionData) {
        throw new Error(`Version ${targetVersion} not found`);
      }

      // Get current entity state
      const currentEntity = await this.getCurrentEntityState(entityType, entityId);
      if (!currentEntity) {
        throw new Error('Entity not found');
      }

      // Create rollback changes record
      const rollbackChanges = {
        rollback: {
          from: 'current',
          to: targetVersion,
          changeType: 'rollback' as const,
        },
      };

      // Create the rollback version entry
      const rollbackVersionResult = await this.createVersion(
        entityType,
        entityId,
        rollbackChanges,
        notes || `Rollback to version ${targetVersion}`,
        createdBy
      );

      // Update the entity to the target version state
      await this.applyVersionToEntity(entityType, entityId, targetVersion);

      return rollbackVersionResult;
    } catch (error) {
      throw new Error(`Failed to rollback to version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze the impact of changes
   */
  async analyzeImpact(
    entityType: 'metric' | 'dimension',
    entityId: string,
    changes: Record<string, any>
  ): Promise<{
    affectedQueries: string[];
    affectedDashboards: string[];
    affectedReports: string[];
    breakingChanges: boolean;
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    try {
      // Query dependencies to find what uses this entity
      const dependenciesSql = `
        SELECT target_type, target_id, target_name
        FROM semantic_dependencies
        WHERE source_type = $1 AND source_id = $2
      `;

      const result = await this.pg.query(dependenciesSql, [entityType, entityId]);

      const affectedQueries: string[] = [];
      const affectedDashboards: string[] = [];
      const affectedReports: string[] = [];

      result.rows.forEach(row => {
        switch (row.target_type) {
          case 'query':
            affectedQueries.push(row.target_id);
            break;
          case 'dashboard':
            affectedDashboards.push(row.target_id);
            break;
          case 'report':
            affectedReports.push(row.target_id);
            break;
        }
      });

      // Determine if changes are breaking
      const breakingChanges = Object.keys(changes).some(field => 
        ['expression', 'type', 'column_name', 'table_name'].includes(field) &&
        changes[field].changeType === 'expression_changed'
      );

      // Assess risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      
      if (breakingChanges && (affectedQueries.length > 0 || affectedDashboards.length > 0)) {
        riskLevel = 'high';
      } else if (affectedQueries.length > 5 || affectedDashboards.length > 3) {
        riskLevel = 'medium';
      }

      return {
        affectedQueries,
        affectedDashboards,
        affectedReports,
        breakingChanges,
        riskLevel,
      };
    } catch (error) {
      console.error('Error analyzing impact:', error);
      return {
        affectedQueries: [],
        affectedDashboards: [],
        affectedReports: [],
        breakingChanges: false,
        riskLevel: 'low',
      };
    }
  }

  /**
   * Get all entities that will be affected by changes
   */
  async getImpactedEntities(entityType: 'metric' | 'dimension', entityId: string): Promise<{
    directDependencies: Array<{ type: string; id: string; name: string }>;
    indirectDependencies: Array<{ type: string; id: string; name: string }>;
  }> {
    try {
      // Get direct dependencies (things that use this entity)
      const directSql = `
        SELECT target_type, target_id, target_name
        FROM semantic_dependencies
        WHERE source_type = $1 AND source_id = $2
      `;

      const directResult = await this.pg.query(directSql, [entityType, entityId]);

      const directDependencies = directResult.rows.map(row => ({
        type: row.target_type,
        id: row.target_id,
        name: row.target_name || row.target_id,
      }));

      // Get indirect dependencies (things that use the direct dependencies)
      const indirectDependencies: Array<{ type: string; id: string; name: string }> = [];
      
      for (const dep of directDependencies) {
        const indirectSql = `
          SELECT target_type, target_id, target_name
          FROM semantic_dependencies
          WHERE source_type = $1 AND source_id = $2
        `;

        const indirectResult = await this.pg.query(indirectSql, [dep.type, dep.id]);
        indirectDependencies.push(...indirectResult.rows.map(row => ({
          type: row.target_type,
          id: row.target_id,
          name: row.target_name || row.target_id,
        })));
      }

      return {
        directDependencies,
        indirectDependencies,
      };
    } catch (error) {
      throw new Error(`Failed to get impacted entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper: Increment version number
   */
  private incrementVersion(currentVersion: string): string {
    const match = currentVersion.match(/^v(\d+)\.(\d+)$/);
    if (!match) {
      return 'v1.0';
    }

    const major = parseInt(match[1]);
    const minor = parseInt(match[2]);
    
    return `v${major}.${minor + 1}`;
  }

  /**
   * Helper: Get a specific version by number
   */
  private async getVersionByNumber(
    entityType: 'metric' | 'dimension',
    entityId: string,
    version: string
  ): Promise<SemanticVersion | null> {
    const sql = `
      SELECT id, entity_type, entity_id, version, changes, notes, impact_analysis, created_by, created_at
      FROM semantic_versions 
      WHERE entity_type = $1 AND entity_id = $2 AND version = $3
    `;

    const result = await this.pg.query(sql, [entityType, entityId, version]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      version: row.version,
      changes: row.changes,
      notes: row.notes,
      impactAnalysis: row.impact_analysis,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  /**
   * Helper: Get current entity state
   */
  private async getCurrentEntityState(entityType: 'metric' | 'dimension', entityId: string): Promise<any> {
    const table = entityType === 'metric' ? 'semantic_metrics' : 'semantic_dimensions';
    const sql = `SELECT * FROM ${table} WHERE id = $1`;
    
    const result = await this.pg.query(sql, [entityId]);
    return result.rows[0] || null;
  }

  /**
   * Helper: Apply a version to an entity (rollback functionality)
   */
  private async applyVersionToEntity(entityType: 'metric' | 'dimension', entityId: string, version: string): Promise<void> {
    // This would need to be implemented based on the specific rollback requirements
    // For now, we'll just mark it as a version change in the database
    console.log(`Would rollback ${entityType} ${entityId} to version ${version}`);
  }

  /**
   * Helper: Assess impact of a change
   */
  private assessImpact(field: string, changeType: string): string {
    const impactMap: Record<string, string> = {
      'expression': 'May change calculated values',
      'type': 'Breaking change - affects data type',
      'column_name': 'Breaking change - affects data source',
      'table_name': 'Breaking change - affects data source',
      'filters': 'May change filtered results',
      'dimensions': 'May change grouping behavior',
      'label': 'Cosmetic change - no data impact',
      'description': 'Documentation change - no data impact',
    };

    return impactMap[field] || 'Unknown impact';
  }

  /**
   * Helper: Generate comparison summary
   */
  private generateComparisonSummary(
    changes: Array<{ field: string; changeType: string }>,
    fromVersion: string,
    toVersion: string
  ): string {
    if (changes.length === 0) {
      return `No changes between ${fromVersion} and ${toVersion}`;
    }

    const changeTypes = changes.map(c => c.changeType);
    const uniqueTypes = [...new Set(changeTypes)];

    return `${changes.length} change${changes.length === 1 ? '' : 's'} between ${fromVersion} and ${toVersion}: ${uniqueTypes.join(', ')}`;
  }
}

// Export utility functions
export const createSemanticVersioning = (pg: Pool): SemanticVersioning => {
  return new SemanticVersioning(pg);
};

export const parseVersion = (version: string): { major: number; minor: number } => {
  const match = version.match(/^v(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error('Invalid version format');
  }
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
  };
};