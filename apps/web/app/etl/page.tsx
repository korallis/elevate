'use client';
import { useEffect, useRef, useState } from 'react';
import { API_BASE, api } from '@/lib/api';

type EventMsg = { ts?: string; type: string; [k: string]: any };

export default function EtlPage() {
  const [events, setEvents] = useState<EventMsg[]>([]);
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(new URL('/etl/stream', API_BASE).toString());
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [data, ...prev].slice(0, 200));
      } catch {}
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  async function runNow() {
    if (!database || !schema) return alert('Set database and schema');
    try {
      const res = await api.runEtlNow(database, schema);
      alert(`Run started: ${res.runId}`);
    } catch (e: any) {
      alert(`Failed: ${e?.message || String(e)}`);
    }
  }

  return (
    <section className="py-6">
      <h1 className="text-2xl font-semibold">ETL Runs</h1>
      <p className="text-[color:var(--muted)]">
        Trigger discovery refresh and stream status in real time.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <input
          placeholder="Database"
          className="flex h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
        />
        <input
          placeholder="Schema"
          className="flex h-10 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-sm"
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
        />
        <button
          onClick={runNow}
          className="inline-flex items-center rounded-md bg-[var(--primary)] px-4 py-2 text-[var(--primary-fg)] hover:opacity-90"
        >
          Run now
        </button>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Events</h2>
        <ul className="mt-2 space-y-1">
          {events.map((ev, i) => (
            <li key={i} className="text-sm">
              <code>{ev.ts || ''}</code> – <strong>{ev.type}</strong> {JSON.stringify(ev)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
