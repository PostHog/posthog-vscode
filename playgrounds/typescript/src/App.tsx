import { useState } from 'react';
import posthog from './posthog';
import { BuggyCounter } from './errors/BuggyCounter';
import { AsyncFailure } from './errors/AsyncFailure';
import { TypeErrorDemo } from './errors/TypeErrorDemo';
import { NestedCrash } from './errors/NestedCrash';
import { ManualCapture } from './errors/ManualCapture';
import { ErrorBoundary } from './errors/ErrorBoundary';

export default function App() {
  const [activeDemo, setActiveDemo] = useState<string | null>(null);

  posthog.capture('annotation created')

  const demos: Record<string, { label: string; description: string; component: React.ReactNode }> = {
    buggyCounter: {
      label: 'Render Crash',
      description: 'Throws during React render after 3 clicks',
      component: <BuggyCounter />,
    },
    asyncFailure: {
      label: 'Async Rejection',
      description: 'Triggers an unhandled promise rejection',
      component: <AsyncFailure />,
    },
    typeError: {
      label: 'TypeError',
      description: 'Accesses property on null at runtime',
      component: <TypeErrorDemo />,
    },
    nestedCrash: {
      label: 'Deep Stack Trace',
      description: 'Error thrown from deeply nested function calls',
      component: <NestedCrash />,
    },
    manualCapture: {
      label: 'Manual Capture',
      description: 'Uses posthog.capture to send a custom exception event',
      component: <ManualCapture />,
    },
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>PostHog Playground</h1>
        <p style={styles.subtitle}>
          Click a scenario below to trigger exceptions that PostHog will capture.
        </p>
        <div style={styles.flagInfo}>
          <code>onboarding-reverse-proxy: {String(flag)}</code>
          <code>onboarding-v2-demo: {String(enabled)}</code>
        </div>
      </header>

      <div style={styles.grid}>
        {Object.entries(demos).map(([key, demo]) => (
          <button
            key={key}
            onClick={() => setActiveDemo(key)}
            style={{
              ...styles.card,
              ...(activeDemo === key ? styles.cardActive : {}),
            }}
          >
            <span style={styles.cardLabel}>{demo.label}</span>
            <span style={styles.cardDesc}>{demo.description}</span>
          </button>
        ))}
      </div>

      <div style={styles.demoArea}>
        {activeDemo ? (
          <ErrorBoundary
            key={activeDemo}
            onError={(error) => {
              posthog.capture('$exception', {
                $exception_message: error.message,
                $exception_type: error.name,
                $exception_source: 'ErrorBoundary',
              });
            }}
          >
            {demos[activeDemo].component}
          </ErrorBoundary>
        ) : (
          <p style={styles.placeholder}>Select a scenario above to get started.</p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '40px 24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1d1f27',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  flagInfo: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 32,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '16px',
    background: '#f8f8f8',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  cardActive: {
    borderColor: '#1D4AFF',
    background: '#f0f4ff',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: '#666',
  },
  demoArea: {
    padding: 24,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    minHeight: 120,
  },
  placeholder: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
};


