import { Component, type ReactNode } from 'react';

// A Settings page that crashes shows its error here instead of blanking the
// whole app; "Try again" redraws it.
export default class SectionBoundary extends Component<{ children: ReactNode; name?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[settings]', this.props.name || '', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ border: '1px solid var(--shell-danger, #c0392b)', borderRadius: 10, padding: '14px 16px', margin: '12px 0' }} data-testid="section-error">
        <b>This page couldn't be shown{this.props.name ? ` (${this.props.name})` : ''}.</b>
        <div style={{ fontSize: 13, marginTop: 6, wordBreak: 'break-word' }}>{String(this.state.error.message || this.state.error)}</div>
        <button type="button" className="eid-secondary" style={{ marginTop: 10 }} onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
