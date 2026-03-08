import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, background: '#fff0f0', borderRadius: 6, border: '1px solid #fcc' }}>
          <strong style={{ color: '#c00' }}>Caught: {this.state.error.name}</strong>
          <pre style={{ fontSize: 12, color: '#666', marginTop: 8, whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ fontSize: 11, color: '#999', marginTop: 4, whiteSpace: 'pre-wrap' }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
