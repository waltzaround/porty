import type { ConnectedDevice, Scan } from "./types";

export interface ConnectionEvent {
  id: string;
  at: string;
  type: "connected" | "disconnected" | "changed" | "info" | "warning";
  name: string;
  detail: string;
  source: "system" | "scan" | "monitor";
}
export interface MonitoringState {
  enabled: boolean;
  mode: "live" | "polling" | "paused";
  detail: string;
}
export interface EventHistory {
  events: ConnectionEvent[];
  monitoring: MonitoringState;
}
export interface MonitorUpdate extends EventHistory {
  scan?: Scan;
  error?: string;
}
export interface HardwareNotification {
  kind: "usb" | "display" | "power" | "ready";
  action?: "connected" | "disconnected" | "changed";
  id?: string;
  name?: string;
  usb?: boolean;
  displays?: boolean;
}

function endpoints(scan: Scan) {
  return [...scan.ports.flatMap((p) => p.devices), ...scan.devices].filter(
    (d, i, all) =>
      d.id &&
      !["power", "hub"].includes(d.kind ?? "") &&
      d.usb?.internal !== true &&
      all.findIndex((other) => other.id === d.id) === i,
  );
}
const mode = (d: ConnectedDevice) =>
  d.displayMode
    ? `${d.displayMode.width} × ${d.displayMode.height}${d.displayMode.refreshHz == null ? "" : ` · ${d.displayMode.refreshHz} Hz`}`
    : undefined;
const category = (d: ConnectedDevice) =>
  d.kind === "display" ? "displays" : "usb";
const complete = (scan: Scan, key: "usb" | "displays" | "ports") =>
  scan.collection?.[key] ??
  !scan.warnings.some((w) =>
    /could not|unavailable|failed|incomplete/i.test(w),
  );

// A failed or partial observation is never evidence that something unplugged.
// Timestamps describe when a change was observed, not an inferred unplug time.
export function scanChanges(
  before: Scan,
  after: Scan,
): Omit<ConnectionEvent, "id" | "at">[] {
  if (before.demo || after.demo) return [];
  const events: Omit<ConnectionEvent, "id" | "at">[] = [];
  const previous = endpoints(before),
    current = endpoints(after);
  for (const [old, next, type] of [
    [previous, current, "disconnected"],
    [current, previous, "connected"],
  ] as const) {
    for (const d of old) {
      if (
        !complete(before, category(d)) ||
        !complete(after, category(d)) ||
        next.some((n) => n.id === d.id)
      )
        continue;
      // Registry IDs can change without a visible disconnect. Ambiguous identity
      // churn is omitted from scan diffs; native notifications retain real edges.
      if (
        next.some((n) => n.name === d.name && !old.some((o) => o.id === n.id))
      )
        continue;
      events.push({
        type,
        name: d.name,
        detail: "Observed during a hardware scan.",
        source: "scan",
      });
    }
  }
  for (const d of current) {
    const old = previous.find((p) => p.id === d.id);
    if (!old || !complete(before, category(d)) || !complete(after, category(d)))
      continue;
    if (mode(old) && mode(d) && mode(old) !== mode(d))
      events.push({
        type: "changed",
        name: d.name,
        detail: `${mode(old)} → ${mode(d)}`,
        source: "scan",
      });
    if (old.linkSpeed && d.linkSpeed && old.linkSpeed !== d.linkSpeed)
      events.push({
        type: "changed",
        name: d.name,
        detail: `Link: ${old.linkSpeed} → ${d.linkSpeed}`,
        source: "scan",
      });
  }
  if (complete(before, "ports") && complete(after, "ports"))
    for (const port of after.ports) {
      const old = before.ports.find((p) => p.id === port.id);
      if (!old) continue;
      if (
        old.connection &&
        port.connection &&
        old.connection.active !== port.connection.active
      )
        events.push({
          type: port.connection.active ? "connected" : "disconnected",
          name: port.name,
          detail: "Host connector state changed.",
          source: "scan",
        });
      const contract = (p: typeof port) =>
        p.connection?.active
          ? p.connection.power.find(
              (c) =>
                c.label === "Selected power input" && c.evidence === "detected",
            )?.value
          : undefined;
      const first = contract(old),
        second = contract(port);
      if (first && second && first !== second)
        events.push({
          type: "changed",
          name: port.name,
          detail: `Charging contract: ${first} → ${second}`,
          source: "scan",
        });
      const link = (p: typeof port) =>
        p.capabilities.find(
          (c) => c.label === "Current link" && c.evidence === "detected",
        )?.value;
      if (link(old) && link(port) && link(old) !== link(port))
        events.push({
          type: "changed",
          name: port.name,
          detail: `Upstream link: ${link(old)} → ${link(port)}`,
          source: "scan",
        });
      for (const stat of port.currentStats ?? []) {
        if (
          stat.evidence !== "detected" ||
          /current power|current draw/i.test(stat.label)
        )
          continue;
        const previous = old.currentStats?.find(
          (c) => c.label === stat.label && c.evidence === "detected",
        );
        if (previous && previous.value !== stat.value)
          events.push({
            type: "changed",
            name: port.name,
            detail: `${stat.label}: ${previous.value} → ${stat.value}`,
            source: "scan",
          });
      }
      // Ordinary changes in measured watts are deliberately not logged.
    }
  return events;
}

export class ConnectionHistory {
  private sequence = 0;
  private previous?: Scan;
  private list: ConnectionEvent[] = [];
  private nativeDomains = new Set<"usb" | "display">();
  constructor(private readonly limit = 500) {}
  get events() {
    return this.list.map((event) => ({ ...event }));
  }
  clear() {
    this.list = [];
  }
  liveDomains(usb: boolean, displays: boolean) {
    this.nativeDomains = new Set([
      ...(usb ? ["usb" as const] : []),
      ...(displays ? ["display" as const] : []),
    ]);
  }
  add(
    event: Omit<ConnectionEvent, "id" | "at">,
    at = new Date().toISOString(),
  ) {
    this.list = [
      { ...event, id: `event-${++this.sequence}`, at },
      ...this.list,
    ].slice(0, this.limit);
  }
  observe(scan: Scan) {
    if (scan.demo) return;
    if (!this.previous)
      this.add(
        {
          type: "info",
          name: "Monitoring started",
          detail:
            "Initial hardware snapshot recorded. Existing devices are the baseline.",
          source: "monitor",
        },
        scan.scannedAt,
      );
    else
      for (const event of scanChanges(this.previous, scan)) {
        // Native arrival/removal callbacks are authoritative and can capture a
        // reconnect that finishes before either scan. Avoid duplicate scan edges.
        const device =
          endpoints(scan).find((d) => d.name === event.name) ??
          endpoints(this.previous).find((d) => d.name === event.name);
        const domain = device?.kind === "display" ? "display" : "usb";
        if (
          device &&
          this.nativeDomains.has(domain) &&
          event.type !== "changed"
        )
          continue;
        this.add(event, scan.scannedAt);
      }
    this.previous = scan;
  }
  notification(value: HardwareNotification) {
    if (!value.action || !["usb", "display"].includes(value.kind)) return;
    const known =
      this.previous && endpoints(this.previous).find((d) => d.id === value.id);
    this.add({
      type: value.action,
      name:
        known?.name ??
        value.name ??
        (value.kind === "usb" ? "USB device" : "Display"),
      detail:
        value.kind === "usb"
          ? "USB device notification from macOS. Internal dock components can report their own events."
          : "Display configuration notification from macOS.",
      source: "system",
    });
  }
}
