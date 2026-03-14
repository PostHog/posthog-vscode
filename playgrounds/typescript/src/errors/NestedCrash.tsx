import { useState } from 'react';

function processPayment(amount: number) {
  return validateAmount(amount);
}

function validateAmount(amount: number) {
  return checkFraudRules(amount);
}

function checkFraudRules(amount: number) {
  return applyRateLimit(amount);
}

function applyRateLimit(_amount: number) {
  throw new Error('RateLimitExceeded: Payment processing rate limit hit — retry after 30s');
}

export function NestedCrash() {
  const [triggered, setTriggered] = useState(false);

  const handleClick = () => {
    setTriggered(true);
    // Deep call stack: processPayment → validateAmount → checkFraudRules → applyRateLimit
    processPayment(99.99);
  };

  return (
    <div>
      <p>Throws from a deeply nested function chain, producing a long stack trace.</p>
      <button onClick={handleClick} style={btnStyle}>
        Process Payment
      </button>
      {triggered && (
        <p style={{ color: '#c00', marginTop: 8, fontSize: 13 }}>
          Error thrown from nested calls — check PostHog error tracking.
        </p>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#F54E00',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  marginTop: 8,
};
