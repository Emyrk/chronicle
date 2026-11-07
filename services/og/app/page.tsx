import type { CSSProperties } from 'react';
import previewCases from '@/app/lib/og-preview-cases.json';

const styles = {
  shell: {
    minHeight: '100vh',
    background: '#090b10',
    color: '#ece7dc',
    fontFamily: 'Georgia, Cambria, Times New Roman, serif',
  },
  main: { maxWidth: 1440, margin: '0 auto', padding: '64px 28px 96px' },
  eyebrow: {
    margin: 0,
    color: '#c4a96a',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
  },
  title: { maxWidth: 820, margin: '10px 0 14px', fontSize: 'clamp(40px, 7vw, 84px)', fontWeight: 400, lineHeight: 0.98 },
  intro: { maxWidth: 780, margin: 0, color: '#aaa69d', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 17, lineHeight: 1.7 },
  group: { marginTop: 72 },
  groupHeading: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 },
  rule: { height: 1, flex: 1, background: '#302d28' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 26 },
  card: { overflow: 'hidden', border: '1px solid #292721', borderRadius: 5, background: '#101218', boxShadow: '0 24px 70px #0008' },
  image: { display: 'block', width: '100%', height: 'auto', background: '#06070a' },
  copy: { padding: '22px 24px 25px' },
  labelRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 },
  label: { margin: 0, fontSize: 24, fontWeight: 400 },
  template: { color: '#77736b', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 },
  description: { minHeight: 48, margin: '9px 0 17px', color: '#aaa69d', fontFamily: 'ui-sans-serif, system-ui, sans-serif', lineHeight: 1.5 },
  route: {
    display: 'inline-block',
    maxWidth: '100%',
    overflowWrap: 'anywhere' as const,
    border: '1px solid #343027',
    borderRadius: 999,
    padding: '6px 10px',
    color: '#d2b875',
    background: '#17150f',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
  },
  note: { margin: '13px 0 0', color: '#77736b', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 13, lineHeight: 1.5 },
} satisfies Record<string, CSSProperties>;

function previewSearchParams(params: object): URLSearchParams {
  return new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

// This approval gallery is intentionally part of the standalone renderer rather
// than Chronicle's Storybook. It exercises the real next/og endpoint and Satori
// fonts/assets, which a frontend component story would only approximate.
export default function Home() {
  const groups = [...new Set(previewCases.map(item => item.group))];

  return (
    <div style={styles.shell}>
      <main style={styles.main}>
        <p style={styles.eyebrow}>Chronicle · social card review</p>
        <h1 style={styles.title}>Every card, in the renderer that ships it.</h1>
        <p style={styles.intro}>
          Review the complete generated-card set below. Each example names the Chronicle route that selects it. Open any image to inspect the
          full 1200×630 PNG and its exact query parameters.
        </p>

        {groups.map(group => (
          <section key={group} style={styles.group}>
            <div style={styles.groupHeading}>
              <p style={styles.eyebrow}>{group}</p>
              <div style={styles.rule} />
            </div>
            <div style={styles.grid}>
              {previewCases
                .filter(item => item.group === group)
                .map(item => {
                  const src = `/api/og?${previewSearchParams(item.params)}`;
                  return (
                    <article key={item.id} style={styles.card}>
                      <a href={src}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`${item.label} Open Graph card`} width={1200} height={630} style={styles.image} />
                      </a>
                      <div style={styles.copy}>
                        <div style={styles.labelRow}>
                          <h2 style={styles.label}>{item.label}</h2>
                          <span style={styles.template}>{item.params.template}</span>
                        </div>
                        <p style={styles.description}>{item.description}</p>
                        <code style={styles.route}>{item.pageExample}</code>
                        {'note' in item && item.note ? <p style={styles.note}>{item.note}</p> : null}
                      </div>
                    </article>
                  );
                })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
