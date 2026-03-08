import { useState } from 'react';

interface User {
  name: string;
  address: {
    city: string;
    zip: string;
  };
}

export function TypeErrorDemo() {
  const [triggered, setTriggered] = useState(false);

  const handleClick = () => {
    setTriggered(true);

    // Simulate getting a null response from an API
    const user: User | null = null;

    // This will throw: Cannot read properties of null (reading 'address')
    console.log(`User lives in ${user!.address.city}`);
  };

  return (
    <div>
      <p>Accesses a property on <code>null</code>, causing a TypeError.</p>
      <button onClick={handleClick} style={btnStyle}>
        Access Null Property
      </button>
      {triggered && (
        <p style={{ color: '#c00', marginTop: 8, fontSize: 13 }}>
          TypeError thrown — check PostHog error tracking.
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
