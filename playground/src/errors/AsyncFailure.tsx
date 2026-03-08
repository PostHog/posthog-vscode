import { useState } from 'react';

async function fetchUserProfile(userId: string): Promise<{ name: string }> {
  // Simulate an API call that fails
  await new Promise(resolve => setTimeout(resolve, 500));
  throw new Error(`NetworkError: Failed to fetch profile for user "${userId}" — 503 Service Unavailable`);
}

export function AsyncFailure() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('loading');
    try {
      await fetchUserProfile('user_12345');
    } catch (err) {
      setStatus('error');
      // Re-throw so it becomes an unhandled rejection (PostHog captures these)
      throw err;
    }
  };

  return (
    <div>
      <p>Simulates a failed API call with an unhandled promise rejection.</p>
      <button onClick={handleClick} style={btnStyle} disabled={status === 'loading'}>
        {status === 'loading' ? 'Fetching...' : 'Fetch User Profile'}
      </button>
      {status === 'error' && (
        <p style={{ color: '#c00', marginTop: 8, fontSize: 13 }}>
          Unhandled rejection thrown — check PostHog error tracking.
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
