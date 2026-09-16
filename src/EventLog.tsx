import { Activity, Download, Trash2 } from "lucide-react";
import type { EventHistory } from "../shared/events";

export function EventLog({
  history,
  clear,
  demo,
}: {
  history: EventHistory;
  clear: () => void;
  demo: boolean;
}) {
  function save() {
    const blob = new Blob(
      [
        JSON.stringify(
          { capturedAt: new Date().toISOString(), ...history },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `porty-events-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="event-log" aria-label="Connection event log">
      <header className="event-log-header">
        <div>
          <h2>Connection history</h2>
          <p>
            {demo
              ? "Live events are available in the desktop app."
              : history.monitoring.detail}
          </p>
        </div>
        <div className="event-log-actions">
          <button
            className="button"
            onClick={save}
            disabled={!history.events.length}
          >
            <Download size={14} />
            Save log
          </button>
          <button
            className="button"
            onClick={clear}
            disabled={!history.events.length}
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </header>
      <p className="section-note">
        Last 500 events from this app session. Times show when changes were
        observed. The log stays on this computer; saved logs include device
        names.
      </p>
      {history.events.length ? (
        <ol className="settings-group event-list">
          {history.events.map((event) => (
            <li key={event.id} className={`event-entry event-${event.type}`}>
              <span className="event-marker" aria-hidden="true" />
              <time dateTime={event.at}>
                {new Date(event.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })}
                <small>{new Date(event.at).toLocaleDateString()}</small>
              </time>
              <div>
                <strong>{event.name}</strong>
                <p>{event.detail}</p>
              </div>
              <span className="event-type">
                {event.type === "info"
                  ? "Monitoring"
                  : event.type === "warning"
                    ? "Notice"
                    : event.type[0].toUpperCase() + event.type.slice(1)}
                <small>
                  {event.source === "system"
                    ? "System event"
                    : event.source === "scan"
                      ? "Scan comparison"
                      : "Porty"}
                </small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state">
          <Activity size={25} />
          <h2>No events yet</h2>
          <p>
            {history.monitoring.enabled
              ? "Connect a device or change a display mode to start a history."
              : "Enable auto-refresh or refresh manually to observe connection changes."}
          </p>
        </div>
      )}
    </section>
  );
}
