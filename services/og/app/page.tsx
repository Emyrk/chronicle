import { OG_THEMES } from '@/app/lib/og-themes';

// A plain index of the templates with a live example of each. Set
// OG_API_ONLY=true to turn this page off (see proxy.ts).
export default function Home() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px', lineHeight: 1.5 }}>
      <h1 style={{ margin: 0 }}>OG image service</h1>
      <p>
        <code>GET /api/og?title=…&amp;template=…</code> returns a 1200×630 PNG. See <code>services/og/README.md</code> for
        every parameter.
      </p>
      {OG_THEMES.map(theme => {
        const src = `/api/og?${new URLSearchParams({ title: 'Hello from Chronicle', site: 'Chronicle', template: theme.key })}`;
        return (
          <section key={theme.key} style={{ marginTop: 40 }}>
            <h2 style={{ marginBottom: 4 }}>
              {theme.label} <code style={{ fontSize: 16 }}>{theme.key}</code>
            </h2>
            <p style={{ marginTop: 0 }}>{theme.description}</p>
            <a href={src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`${theme.label} example`} width={1200} height={630} style={{ width: '100%', height: 'auto' }} />
            </a>
          </section>
        );
      })}
    </main>
  );
}
