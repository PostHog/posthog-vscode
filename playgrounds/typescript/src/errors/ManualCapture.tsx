import { useState } from 'react';
import posthog from '../posthog';

export function ManualCapture() {
  const [sent, setSent] = useState(false);

  const handleClick = () => {
    // Manually capture an exception event — useful when you catch errors
    // but still want them tracked in PostHog
    try {
      JSON.parse('{ invalid json !!!');
    } catch (err) {
      const error = err as Error;
      posthog.capture('$exception', {
        $exception_message: error.message,
        $exception_type: 'SyntaxError',
        $exception_source: 'ManualCapture.handleClick',
        $exception_stack_trace_raw: error.stack,
      });
      setSent(true);
    }
  };

  return (
    <div>
      <p>
        Catches a <code>JSON.parse</code> error and manually sends it to PostHog
        via <code>posthog.capture('$exception', ...)</code>.
      </p>
      <button onClick={handleClick} style={btnStyle}>
        Parse Bad JSON
      </button>
      {sent && (
        <p style={{ color: '#4CBB17', marginTop: 8, fontSize: 13 }}>
          Exception captured and sent to PostHog.
        </p>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#1D4AFF',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  marginTop: 8,
};
