import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SME Analytics',
    short_name: 'SME',
    description:
      'Elegant, ultra‑modern analytics for ambitious teams. Snowflake‑first with governance built‑in.',
    theme_color: '#0A0A10',
    background_color: '#0A0A10',
    display: 'standalone',
    icons: [
      { src: '/icon', sizes: '256x256', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
