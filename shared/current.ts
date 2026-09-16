import type { ConnectedDevice, Port } from "./types";
import { getDisplaySupport } from "./display";

export interface CurrentValue {
  value: string;
  detail: string;
  reported: boolean;
  note?: string;
  lines?: { id: string; label: string; value: string }[];
}

export function displayReadings(displays: ConnectedDevice[]) {
  const counts = new Map<string, number>();
  return displays.map((d, index) => {
    const number = (counts.get(d.name) ?? 0) + 1;
    counts.set(d.name, number);
    const mode = d.displayMode;
    return {
      id: d.id ?? `display-${index}`,
      label: displays.filter(other => other.name === d.name).length > 1 ? `${d.name} ${number}` : d.name,
      value: mode ? `${mode.width} × ${mode.height} · ${mode.refreshHz == null ? 'Refresh not reported' : `${Number(mode.refreshHz.toFixed(3))} Hz`}` : 'Not reported',
    };
  });
}

export function currentPortValues(port: Port) {
  const absent = (applicable: boolean, detail: string): CurrentValue => ({
    value: applicable && port.status !== "available" ? "Not reported" : "—",
    detail,
    reported: false,
  });
  const connected = port.status === "connected";
  const data = connected
    ? port.capabilities.find(
        (c) => c.label === "Current link" && c.evidence === "detected",
      )
    : undefined;
  const monitors = connected
    ? port.devices.filter((d) => d.kind === "display")
    : [];
  const video =
    getDisplaySupport(port).status !== "unsupported" &&
    (!port.connection?.active ||
      port.connection.transports.some((t) =>
        /DisplayPort|HDMI|CIO|Thunderbolt/i.test(t),
      ));
  const displayDetail = monitors.length
    ? monitors
        .map(
          (d) =>
            `${d.name}: ${d.detail}${d.portMapping ? `. ${d.portMapping}` : ""}`,
        )
        .join("\n")
    : "No current display mode is mapped to this port.";
  const modes = monitors.filter((d) => d.displayMode);
  const power =
    connected && port.connection?.active
      ? (port.connection.power.find(
          (c) =>
            ["Current power input", "Current power output"].includes(c.label) &&
            c.evidence === "detected",
        ) ??
        port.connection.power.find(
          (c) =>
            c.label === "Selected power input" && c.evidence === "detected",
        ))
      : undefined;
  return {
    displays: monitors.length ? {
      value: displayReadings(monitors).map(d => `${d.label}: ${d.value}`).join('\n'),
      lines: displayReadings(monitors), detail: displayDetail, reported: modes.length > 0,
    } : absent(video, displayDetail),
    data:
      data && data.value !== "Not reported"
        ? { value: data.value, detail: data.detail, reported: true }
        : absent(
            !["HDMI", "DisplayPort", "Audio", "MagSafe"].includes(
              port.connector,
            ),
            "No current data link speed was reported. This is the negotiated link, not measured transfer throughput.",
          ),
    resolution: modes.length
      ? {
          value: modes
            .map((d) => `${d.displayMode!.width} × ${d.displayMode!.height}`)
            .join(" / "),
          detail: displayDetail,
          reported: true,
        }
      : absent(video, displayDetail),
    refresh: modes.some((d) => d.displayMode!.refreshHz != null)
      ? {
          value: modes
            .map((d) =>
              d.displayMode!.refreshHz == null
                ? "Not reported"
                : `${d.displayMode!.refreshHz} Hz`,
            )
            .join(" / "),
          detail: displayDetail,
          reported: true,
        }
      : absent(video, displayDetail),
    power: power
      ? {
          value: power.value,
          detail: power.detail,
          reported: true,
          note:
            power.label === "Current power input"
              ? "Input"
              : power.label === "Current power output"
                ? "Output"
                : "Negotiated",
        }
      : absent(
          ["USB-C", "USB-A", "USB (unclassified)", "MagSafe"].includes(
            port.connector,
          ),
          "Current power draw is not reported for this port.",
        ),
  };
}
