import {
  ConnectionHistory,
  type MonitorUpdate,
  type MonitoringState,
  type HardwareNotification,
} from "../shared/events";
import type { Scan } from "../shared/types";
import { boundedScan } from "./scan-timeout";
import { startMacMonitor } from "./hardware-monitor";

export class Monitoring {
  readonly history = new ConnectionHistory();
  private pending?: Promise<Scan>;
  private stopNative?: () => void;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private poll?: ReturnType<typeof setInterval>;
  private dirty = false;
  private stopped = false;
  private state: MonitoringState = {
    enabled: false,
    mode: "paused",
    detail: "Automatic monitoring is paused.",
  };
  constructor(
    private scanner: (signal: AbortSignal) => Promise<Scan>,
    private publish: (update: MonitorUpdate) => void,
    private executable?: string,
  ) {}
  snapshot() {
    return { events: this.history.events, monitoring: { ...this.state } };
  }
  clear() {
    this.history.clear();
    this.publish(this.snapshot());
  }
  setEnabled(enabled: boolean) {
    if (this.state.enabled === enabled) return;
    this.stopNative?.();
    this.stopNative = undefined;
    if (this.poll) clearInterval(this.poll);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.dirty = false;
    this.history.liveDomains(false, false);
    this.state = {
      enabled,
      mode: enabled ? "polling" : "paused",
      detail: enabled
        ? "Checking every 15 seconds. Brief changes between scans may be missed."
        : "Automatic monitoring is paused. Manual refreshes still record observed changes.",
    };
    if (enabled) {
      this.poll = setInterval(() => {
        void this.scan().catch(() => {});
      }, 15000);
      if (this.executable)
        this.stopNative = startMacMonitor(
          this.executable,
          (event) => this.notification(event),
          () => {
            this.history.liveDomains(false, false);
            this.state = {
              enabled: true,
              mode: "polling",
              detail:
                "Live notifications are unavailable. Checking every 15 seconds; brief changes may be missed.",
            };
            this.history.add({
              type: "warning",
              name: "Live notifications unavailable",
              detail:
                "Periodic scans continue. Pause and resume auto-refresh to retry the native listener.",
              source: "monitor",
            });
            this.publish(this.snapshot());
          },
        );
    }
    this.publish(this.snapshot());
  }
  private notification(event: HardwareNotification) {
    if (!this.state.enabled || this.stopped) return;
    if (event.kind === "ready") {
      this.history.liveDomains(!!event.usb, !!event.displays);
      this.state = {
        enabled: true,
        mode: event.usb || event.displays ? "live" : "polling",
        detail: `${event.usb ? "Live USB" : "USB checked every 15s"} · ${event.displays ? "live display events" : "displays checked every 15s"}. Other readings are checked every 15 seconds.`,
      };
      if (!event.usb || !event.displays)
        this.history.add({
          type: "warning",
          name: "Some live notifications are unavailable",
          detail: this.state.detail,
          source: "monitor",
        });
    } else {
      this.history.notification(event);
      // Every native edge is logged immediately, including rapid reconnects.
      // Expensive scans are coalesced; one follow-up runs after an in-flight scan.
      this.dirty = true;
      if (!this.refreshTimer && !this.pending) this.queueRefresh();
    }
    this.publish(this.snapshot());
  }
  private queueRefresh() {
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.dirty = false;
      void this.scan().catch(() => {});
    }, 1000);
  }
  scan(): Promise<Scan> {
    if (this.pending) return this.pending;
    this.pending = boundedScan(
      this.scanner,
      process.platform === "win32" ? 65000 : 30000,
    )
      .then((scan) => {
        this.history.observe(scan);
        this.publish({ ...this.snapshot(), scan });
        return scan;
      })
      .catch((error) => {
        const message =
          error instanceof Error &&
          /timed out|macOS hardware information is unavailable/.test(
            error.message,
          )
            ? error.message
            : "Hardware information could not be read. Refresh to retry. Device or administrator restrictions may limit some readings.";
        this.history.add({
          type: "warning",
          name: "Scan could not complete",
          detail: message,
          source: "monitor",
        });
        this.publish({ ...this.snapshot(), error: message });
        throw new Error(message);
      })
      .finally(() => {
        this.pending = undefined;
        if (
          this.dirty &&
          this.state.enabled &&
          !this.stopped &&
          !this.refreshTimer
        )
          this.queueRefresh();
      });
    return this.pending;
  }
  stop() {
    this.stopped = true;
    this.setEnabled(false);
  }
}
