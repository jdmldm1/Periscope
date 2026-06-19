import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.fallbackTitle || 'Component'} crashed:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 40, gap: 16, minHeight: 200, color: 'var(--text-muted)',
          background: 'rgba(239, 68, 68, 0.03)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.15)',
          margin: 16
        }}>
          <AlertTriangle size={32} color="var(--accent-error)" />
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {this.props.fallbackTitle || 'Component'} encountered an error
          </div>
          <div style={{ fontSize: '0.85rem', maxWidth: 500, textAlign: 'center', opacity: 0.7 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            className="btn btn-primary"
            onClick={this.handleReset}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
