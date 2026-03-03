import React from "react";

type Props = {
  scope?: string;
  onEmergencyExport?: () => void;
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Log to console for debugging; keep user experience calm.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary] ${this.props.scope || "App"} crashed`, error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const scope = this.props.scope ? ` (${this.props.scope})` : "";
    const errText =
      this.state.error instanceof Error
        ? `${this.state.error.name}: ${this.state.error.message}`
        : typeof this.state.error === "string"
          ? this.state.error
          : "Unknown error";

    return (
      <div style={{ padding: 20, border: "1px solid #ddd", borderRadius: 12, background: "#fff" }}>
        <h3 style={{ marginTop: 0 }}>Well… that wasn’t supposed to happen{scope}.</h3>
        <p style={{ marginTop: 0 }}>
          Something crashed in the UI. Your data should still be in Dexie. First priority: back it up.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
          {this.props.onEmergencyExport && (
            <button onClick={this.props.onEmergencyExport} title="Export a full backup JSON right now">
              Export Backup (Emergency)
            </button>
          )}
          <button onClick={this.reset} title="Try rendering this section again">
            Try Again
          </button>
          <button onClick={() => window.location.reload()} title="Hard reload the app">
            Reload App
          </button>
        </div>

        <details style={{ marginTop: 10 }}>
          <summary>Technical details</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{errText}</pre>
        </details>

        <p style={{ marginTop: 12, opacity: 0.8 }}>
          If this keeps happening, tell Rev what you clicked right before it blew up.
        </p>
      </div>
    );
  }
}
