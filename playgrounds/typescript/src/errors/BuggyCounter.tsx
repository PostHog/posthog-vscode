import { useState } from 'react';

export function BuggyCounter() {
  const [count, setCount] = useState(0);

  if (count >= 3) {
    throw new Error('BuggyCounter crashed: count exceeded safe limit');
  }

  return (
    <div>
      <p>Count: <strong>{count}</strong> (crashes at 3)</p>
      <button
        onClick={() => setCount(c => c + 1)}
        style={btnStyle}
      >
        Increment
      </button>
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
