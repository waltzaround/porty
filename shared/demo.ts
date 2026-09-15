import { detected, getMacProfile } from "./profiles";
import type { Scan } from "./types";
export function demoScan(): Scan {
  const profile = getMacProfile("Mac16,5", "Apple M4 Max")!;
  const ports = profile.ports;
  ports[0].status = "connected";
  ports[0].location = "Left side · rear";
  ports[0].devices = [
    {
      name: "Studio Display",
      kind: "display",
      detail: "5120 × 2880 @ 60 Hz",
      displayMode: {
        resolution: "5K",
        width: 5120,
        height: 2880,
        refreshHz: 60,
      },
      audioOutput: { sampleRateHz: 48000, channels: 2, isDefault: false },
    },
  ];
  ports[0].capabilities = ports[0].capabilities.filter(
    (c) => c.label !== "Current link",
  );
  ports[0].capabilities.push(
    detected("Current link", "40 Gb/s", "Sample negotiated Thunderbolt link."),
  );
  ports[0].connection = {
    active: true,
    transports: ["CIO", "DisplayPort"],
    cable: [],
    power: [],
  };
  ports[1].status = "connected";
  ports[1].location = "Left side · front";
  ports[1].devices = [
    {
      name: "Samsung T9",
      kind: "device",
      detail: "USB · 10 Gb/s negotiated",
      linkSpeed: "10 Gb/s",
    },
  ];
  ports[1].capabilities = ports[1].capabilities.filter(
    (c) => c.label !== "Current link",
  );
  ports[1].capabilities.push(
    detected("Current link", "10 Gb/s", "Sample negotiated USB link."),
  );
  ports[1].connection = {
    active: true,
    transports: ["USB3"],
    cable: [],
    power: [],
  };
  ports[2].status = "available";
  ports[2].location = "Right side";
  ports[3].location = "Right side";
  ports[3].status = "available";
  ports[4].location = "Right side";
  ports[4].status = "connected";
  ports[4].devices = [
    {
      name: "SDXC Card",
      kind: "device",
      detail: "128 GB · ExFAT · UHS: SDR104",
    },
  ];
  ports[4].currentStats = [
    detected("Card type", "SDXC", "Sample inserted card type."),
    detected("Capacity", "128 GB", "Sample card capacity."),
    detected("Format", "ExFAT", "Sample volume format."),
    detected("Bus mode", "UHS: SDR104", "Sample current SD bus mode."),
  ];
  ports[5].location = "Left side";
  ports[5].status = "connected";
  ports[5].devices = [
    {
      name: "External Headphones",
      kind: "device",
      detail: "48 kHz · 2 channels",
    },
  ];
  ports[5].currentStats = [
    detected("Sample rate", "48 kHz", "Sample headphone output rate."),
    detected("Channels", "2", "Sample headphone output channels."),
    detected("Default output", "Yes", "Sample default output route."),
  ];
  ports[6].location = "Left side";
  ports[6].status = "connected";
  ports[6].devices = [
    {
      name: "140W power adapter",
      kind: "power",
      detail: "Charging via MagSafe",
    },
  ];
  ports[6].connection = {
    active: true,
    transports: ["CC"],
    cable: [],
    powerSources: [
      {
        name: "USB-PD",
        profiles: [
          { volts: 28, amps: 5, watts: 140, selected: true, supply: "fixed" },
        ],
      },
    ],
    power: [
      detected(
        "Current power input",
        "54.2 W",
        "Sample power telemetry at the Mac’s input, including system use and battery charging.",
      ),
      detected(
        "Selected power input",
        "140 W",
        "Sample negotiated charging limit, not actual power draw.",
      ),
    ],
  };
  return {
    machine: {
      name: profile.name,
      model: "Mac16,5",
      chip: "Apple M4 Max",
      os: "macOS",
      platform: "darwin",
    },
    ports,
    devices: [],
    scannedAt: new Date().toISOString(),
    durationMs: 842,
    warnings: [],
    demo: true,
  };
}
