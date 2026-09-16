import { Component, type ReactNode } from "react";

function StartupFailure({ bridge = false }: { bridge?: boolean }) {
  return (
    <main className="startup-failure" role="alert">
      <h1>
        {bridge
          ? "Porty could not connect to its hardware scanner"
          : "Porty could not show this view"}
      </h1>
      <p>
        Reload the interface to try again. You do not need to reinstall the app.
      </p>
      <button className="button" onClick={() => window.location.reload()}>
        Reload Porty
      </button>
      <p>
        If this keeps happening, open <strong>Help → Troubleshooting</strong>{" "}
        for startup diagnostics or a restart with basic graphics.
      </p>
    </main>
  );
}
export class StartupBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    void window.porty?.reportIssue("renderer-error").catch(() => {});
  }
  componentDidMount() {
    void window.porty?.ready().catch(() => {});
  }
  render() {
    if (this.state.failed) return <StartupFailure />;
    if (window.location.protocol === "file:" && !window.porty)
      return <StartupFailure bridge />;
    return this.props.children;
  }
}
