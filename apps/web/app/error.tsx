'use client';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html>
      <body>
        <h1>Something went wrong</h1>
        <pre>{error.message}</pre>
      </body>
    </html>
  );
}
