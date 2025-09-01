import { z } from 'zod';

export const DimensionSchema = z.object({
  name: z.string(),
  table: z.string(),
  column: z.string(),
  label: z.string().optional(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

export const MetricSchema = z.object({
  name: z.string(),
  type: z.enum(['count', 'sum', 'avg']),
  table: z.string(),
  column: z.string().optional(),
  label: z.string().optional(),
});
export type Metric = z.infer<typeof MetricSchema>;

export const FilterSchema = z.object({
  table: z.string(),
  column: z.string(),
  op: z.enum(['=', '!=', '>', '>=', '<', '<=', 'in', 'not in', 'like']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ]),
});
export type Filter = z.infer<typeof FilterSchema>;

export const MetricQuerySchema = z.object({
  metric: MetricSchema,
  dimensions: z.array(DimensionSchema).default([]),
  filters: z.array(FilterSchema).optional(),
  limit: z.number().int().positive().max(10000).default(100),
});
export type MetricQuery = z.infer<typeof MetricQuerySchema>;

export function emitSql(q: MetricQuery): string {
  const metric = q.metric;
  const dims = q.dimensions;
  const table = metric.table;
  const dimSelect = dims.map(
    (d) => `${quoteId(d.table)}.${quoteId(d.column)} as ${quoteId(d.name)}`,
  );
  const dimGroup = dims.map((d) => `${quoteId(d.table)}.${quoteId(d.column)}`);
  const metricExpr = metricExpression(metric);
  const where = (q.filters || []).map((f) => filterToSql(f)).filter(Boolean);
  const sql = [
    'select',
    [...dimSelect, `${metricExpr} as ${quoteId(metric.name)}`].join(', '),
    'from',
    `${quoteId(table)}`,
    where.length ? `where ${where.join(' and ')}` : '',
    dimGroup.length ? `group by ${dimGroup.join(', ')}` : '',
    `limit ${q.limit}`,
  ]
    .filter(Boolean)
    .join(' ');
  return sql;
}

function quoteId(id: string) {
  return '"' + id.replace(/"/g, '""') + '"';
}

function metricExpression(m: Metric): string {
  const col = m.column ? `${quoteId(m.table)}.${quoteId(m.column)}` : '*';
  switch (m.type) {
    case 'count':
      return `count(${col})`;
    case 'sum':
      return `sum(${col})`;
    case 'avg':
      return `avg(${col})`;
  }
}

function filterToSql(f: Filter): string {
  const col = `${quoteId(f.table)}.${quoteId(f.column)}`;
  const op = f.op.toLowerCase();
  if (op === 'in' || op === 'not in') {
    const arr = Array.isArray(f.value) ? f.value : [f.value];
    const vals = arr.map(lit).join(', ');
    return `${col} ${op} (${vals})`;
  }
  if (op === 'like') return `${col} like ${lit(f.value)}`;
  return `${col} ${op} ${lit(f.value)}`;
}

function lit(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

export const Schemas = {
  DimensionSchema,
  MetricSchema,
  FilterSchema,
  MetricQuerySchema,
  emitSql,
};

// Export connector types
export * from './src/connectors';

// Export transformation types
export * from './src/transformations';
