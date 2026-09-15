import type { Connector, Port } from "./types";
import { currentPortValues, type CurrentValue } from "./current";

const columns: Record<Connector, string[]> = {
  "USB-C": [
    "Current data",
    "Current resolution",
    "Current refresh rate",
    "Current power",
  ],
  "USB-A": ["Current data", "Current power"],
  "USB (unclassified)": [
    "Current data",
    "Current resolution",
    "Current refresh rate",
    "Current power",
  ],
  HDMI: ["Current resolution", "Current refresh rate", "Audio output"],
  DisplayPort: ["Current resolution", "Current refresh rate", "Audio output"],
  "Display (unclassified)": [
    "Current resolution",
    "Current refresh rate",
    "Audio output",
  ],
  "SD card": ["Card type", "Capacity", "Format", "Bus mode"],
  Audio: ["Sample rate", "Channels", "Default output"],
  MagSafe: [
    "Current power",
    "Negotiated power",
    "Contract voltage",
    "Current limit",
  ],
  Ethernet: ["Network link", "Adapter link", "Duplex"],
};

export function portStatLabels(connector: Connector): string[] {
  return [...columns[connector]];
}

export function portSections(connector: Connector) {
  const usb = ["USB-C", "USB-A", "USB (unclassified)"].includes(connector);
  const display = [
    "HDMI",
    "DisplayPort",
    "Display (unclassified)",
    "USB-C",
    "USB (unclassified)",
  ].includes(connector);
  const data = usb || connector === "Ethernet";
  return {
    power: usb || connector === "MagSafe",
    data,
    display,
    dataTab:
      connector === "Ethernet"
        ? "Network"
        : data && display
          ? "Data & Display"
          : display
            ? "Display"
            : "Data",
  };
}

function missing(port: Port, label: string): CurrentValue {
  return {
    value: port.status === "available" ? "—" : "Not reported",
    detail: `No current ${label.toLowerCase()} reported for this connection.`,
    reported: false,
  };
}

export function displayAudioValue(port: Port): CurrentValue {
  const monitors =
    port.status === "connected"
      ? port.devices.filter((d) => d.kind === "display")
      : [];
  if (!monitors.some((d) => d.audioOutput))
    return missing(port, "audio output");
  const format = (device: (typeof monitors)[number]) =>
    device.audioOutput
      ? [
          device.audioOutput.sampleRateHz
            ? `${device.audioOutput.sampleRateHz / 1000} kHz`
            : undefined,
          `${device.audioOutput.channels} ch`,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Not reported";
  const output = monitors.length === 1 ? monitors[0].audioOutput : undefined;
  return {
    value: monitors.map(format).join(" / "),
    reported: true,
    detail: monitors
      .map(
        (d) =>
          `${d.name}: ${format(d)}. ${d.audioOutput?.isDefault === true ? "Default macOS audio output." : "Audio endpoint format; this does not indicate audio is playing."}`,
      )
      .join("\n"),
    ...(output?.isDefault === true ? { note: "Default output" } : {}),
  };
}

export function portStats(
  port: Port,
): { label: string; metric: CurrentValue }[] {
  const current = currentPortValues(port);
  const activePower = port.status === "connected" && port.connection?.active;
  const contract = activePower
    ? port.connection!.power.find(
        (c) => c.label === "Selected power input" && c.evidence === "detected",
      )
    : undefined;
  const selected = activePower
    ? port
        .connection!.powerSources?.find((s) => s.name === "USB-PD")
        ?.profiles.find((p) => p.selected)
    : undefined;
  const adapterLinks = [
    ...new Set(port.devices.flatMap((d) => (d.linkSpeed ? [d.linkSpeed] : []))),
  ];
  const metrics: Record<string, CurrentValue> = {
    "Current data": current.data,
    "Current resolution": current.resolution,
    "Current refresh rate": current.refresh,
    "Current power": current.power,
    "Audio output": displayAudioValue(port),
    "Negotiated power": contract
      ? { value: contract.value, detail: contract.detail, reported: true }
      : missing(port, "negotiated power"),
    "Contract voltage": selected
      ? {
          value: `${selected.volts} V`,
          detail:
            "Voltage selected in the active USB-PD charging contract; not a voltage measurement.",
          reported: true,
        }
      : missing(port, "contract voltage"),
    "Current limit": selected
      ? {
          value: `${selected.amps} A`,
          detail:
            "Current limit selected in the active USB-PD charging contract; not measured current draw.",
          reported: true,
        }
      : missing(port, "current limit"),
    "Adapter link": adapterLinks.length
      ? {
          value: adapterLinks.join(" + "),
          detail:
            "Negotiated USB link to the network adapter. This is separate from the Ethernet cable’s network link speed.",
          reported: true,
        }
      : missing(port, "adapter link"),
  };
  return portStatLabels(port.connector).map((label) => {
    const stat = port.currentStats?.find(
      (c) => c.label === label && c.evidence === "detected",
    );
    return {
      label,
      metric:
        metrics[label] ??
        (stat
          ? { value: stat.value, detail: stat.detail, reported: true }
          : missing(port, label)),
    };
  });
}

export function portCapabilities(port: Port) {
  const sections = portSections(port.connector);
  return port.capabilities.filter(
    (c) =>
      c.label !== "Current link" &&
      c.label !== "Active connection" &&
      (sections.power || !/charging|power/i.test(c.label)) &&
      (sections.display || !/display|video/i.test(c.label)) &&
      (sections.data || c.label !== "Data transfer") &&
      (port.connector !== "USB-A" || !/charging input/i.test(c.label)),
  );
}
