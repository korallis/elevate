'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const THEMES = [
  { id: 'theme-default', label: 'Default' },
  { id: 'theme-ocean', label: 'Ocean' },
  { id: 'theme-forest', label: 'Forest' },
  { id: 'theme-sunset', label: 'Sunset' },
];

export function ThemeToggle() {
  const [current, setCurrent] = useState<string>('theme-default');

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'theme-default';
    setCurrent(saved);
    const html = document.documentElement;
    html.classList.remove(...THEMES.map(t => t.id));
    html.classList.add(saved);
  }, []);

  const setTheme = (id: string) => {
    setCurrent(id);
    localStorage.setItem('theme', id);
    const html = document.documentElement;
    html.classList.remove(...THEMES.map(t => t.id));
    html.classList.add(id);
  };

  return (
    <div className="flex gap-2 items-center">
      {THEMES.map((t) => (
        <Button
          key={t.id}
          variant={current === t.id ? 'default' : 'outline'}
          onClick={() => setTheme(t.id)}
          aria-pressed={current === t.id}
        >
          {t.label}
        </Button>
      ))}
    </div>
  );
}

