import { Button } from '@/components/ui/button';

export default function ExamplesPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Examples</h1>
      <p className="text-[hsl(var(--muted-foreground))]">Component palette using current theme tokens.</p>
      <div className="flex gap-3 flex-wrap">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      <div className="rounded-lg border border-[hsl(var(--border))] p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
        Card background using card tokens.
      </div>
    </main>
  );
}

