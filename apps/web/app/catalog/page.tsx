'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Db = { NAME: string };
type Schema = { SCHEMA_NAME: string };

export default function CatalogPage() {
  const [dbs, setDbs] = useState<Db[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [tables, setTables] = useState<{ TABLE_NAME: string; TABLE_TYPE: string }[]>([]);
  const [columns, setColumns] = useState<
    { COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }[]
  >([]);

  const [database, setDatabase] = useState<string>('');
  const [schema, setSchema] = useState<string>('');
  const [table, setTable] = useState<string>('');
  const [q, setQ] = useState<string>('');
  const [search, setSearch] = useState<
    {
      table_name: string;
      table_type: string;
      table_owner: string;
      column_name?: string;
      data_type?: string;
    }[]
  >([]);

  const selectedTables = useMemo(() => tables.map((t) => t.TABLE_NAME), [tables]);

  useEffect(() => {
    api.listDatabases().then(setDbs).catch(console.error);
  }, []);

  useEffect(() => {
    if (!database) return;
    api.listSchemas(database).then(setSchemas).catch(console.error);
  }, [database]);

  useEffect(() => {
    if (!database || !schema) return;
    api.listTables(database, schema).then(setTables).catch(console.error);
  }, [database, schema]);

  useEffect(() => {
    if (!database || !schema || !table) return;
    api.listColumns(database, schema, table).then(setColumns).catch(console.error);
  }, [database, schema, table]);

  useEffect(() => {
    if (!database || !schema || q.trim().length < 2) {
      setSearch([]);
      return;
    }
    api.searchCatalog(database, schema, q.trim()).then(setSearch).catch(console.error);
  }, [q, database, schema]);

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Data Catalog</h1>
      <p className="text-[color:var(--muted)]">
        Select a database, schema, and table to inspect columns.
      </p>

      <div className="flex gap-3 mt-3 flex-wrap">
        <select
          value={database}
          onChange={(e) => {
            setDatabase(e.target.value);
            setSchema('');
            setTable('');
            setTables([]);
            setColumns([]);
            setQ('');
            setSearch([]);
          }}
          className="h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Select database</option>
          {dbs.map((d) => (
            <option key={d.NAME} value={d.NAME}>
              {d.NAME}
            </option>
          ))}
        </select>
        <select
          value={schema}
          onChange={(e) => {
            setSchema(e.target.value);
            setTable('');
            setColumns([]);
            setQ('');
            setSearch([]);
          }}
          disabled={!database}
          className="h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Select schema</option>
          {schemas.map((s) => (
            <option key={s.SCHEMA_NAME} value={s.SCHEMA_NAME}>
              {s.SCHEMA_NAME}
            </option>
          ))}
        </select>
        <select
          value={table}
          onChange={(e) => setTable(e.target.value)}
          disabled={!schema}
          className="h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Select table/view</option>
          {selectedTables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search tables/columns (min 2 chars)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={!schema}
          className="flex-1 min-w-60 h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {q && search.length > 0 && (
        <div className="mt-4 glass rounded-xl p-3">
          <h3 className="font-semibold">
            Search results for "{q}" ({search.length})
          </h3>
          <table className="w-full mt-2 text-sm">
            <thead>
              <tr>
                <th align="left" className="text-left text-[color:var(--muted)]">
                  Table
                </th>
                <th align="left" className="text-left text-[color:var(--muted)]">
                  Owner
                </th>
                <th align="left" className="text-left text-[color:var(--muted)]">
                  Column
                </th>
                <th align="left" className="text-left text-[color:var(--muted)]">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {search.map((r, i) => (
                <tr
                  key={`${r.table_name}-${r.column_name}-${i}`}
                  className="border-t border-[color:var(--card-border)]"
                >
                  <td className="py-1.5">{r.table_name}</td>
                  <td className="py-1.5">{r.table_owner}</td>
                  <td className="py-1.5">{r.column_name || '-'}</td>
                  <td className="py-1.5">{r.data_type || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {table && (
        <div className="mt-6 glass rounded-xl p-3">
          <h2 className="font-semibold">{table}</h2>
          <table className="w-full mt-2 text-sm">
            <thead>
              <tr>
                <th align="left" className="text-left text-[color:var(--muted)]">
                  Column
                </th>
                <th align="left" className="text-left text-[color:var(--muted)]">
                  Type
                </th>
                <th align="left" className="text-left text-[color:var(--muted)]">
                  Nullable
                </th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.COLUMN_NAME} className="border-t border-[color:var(--card-border)]">
                  <td className="py-1.5">{c.COLUMN_NAME}</td>
                  <td className="py-1.5">{c.DATA_TYPE}</td>
                  <td className="py-1.5">{c.IS_NULLABLE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
