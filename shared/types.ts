export type Connector =
  | "USB-C"
  | "USB-A"
  | "HDMI"
  | "DisplayPort"
  | "Display (unclassified)"
  | "SD card"
  | "Audio"
  | "MagSafe"
  | "Ethernet"
  | "USB (unclassified)";
export type Evidence = "detected" | "specification" | "unknown";
export type PortStatus = "connected" | "available" | "unknown";
export interface DisplayResolution {
  resolution: string;
  width: number;
  height: number;
  refreshHz?: number;
}
export interface DisplayMode extends DisplayResolution {
  refreshHz: number;
}
export type DisplaySupport =
  | {
      status: "supported";
      evidence: "specification" | "detected";
      modes: DisplayMode[];
      additionalResolutions?: DisplayResolution[];
      source: string;
      note: string;
      configurations: { displays: number; detail: string }[];
    }
  | { status: "unknown" | "unsupported"; note: string };
export interface Capability {
  label: string;
  value: string;
  evidence: Evidence;
  detail: string;
  source?: string;
}
export interface Port {
  id: string;
  name: string;
  connector: Connector;
  location: string;
  status: PortStatus;
  protocol: string;
  speedGbps?: number;
  display?: DisplaySupport;
  capabilities: Capability[];
  currentStats?: Capability[];
  devices: ConnectedDevice[];
  connection?: {
    active: boolean;
    transports: string[];
    cable: Capability[];
    power: Capability[];
    powerSources?: { name: string; profiles: PowerProfile[] }[];
    diagnostics?: Capability[];
    iokitProperties?: { key: string; value: string }[];
  };
  evidence: Evidence;
  source: string;
  note?: string;
}
export interface PowerProfile {
  volts: number;
  amps: number;
  watts: number;
  selected: boolean;
  supply: "fixed" | "non-fixed" | "unknown";
}
export interface ConnectedDevice {
  id?: string;
  name: string;
  detail: string;
  kind?: "device" | "hub" | "power" | "display";
  parentName?: string;
  parentId?: string;
  // Scan-local token for an OS-reported physical enclosure identity.
  physicalDeviceId?: string;
  usb?: {
    // Scan-local grouping token; the hardware's raw container ID is not exposed.
    containerId?: string;
    vendorId?: number;
    productId?: number;
    locationId?: number;
    route?: string;
    internal?: boolean;
  };
  linkSpeed?: string;
  displayMode?: DisplayResolution;
  displayIdentity?: string;
  audioOutput?: { sampleRateHz?: number; channels: number; isDefault?: boolean };
  portMapping?: string;
  hubPorts?: {
    number: number;
    connector: Connector;
    status: PortStatus;
    devices: string[];
    deviceIds?: string[];
    internal?: boolean;
  }[];
}
export interface Scan {
  machine: {
    name: string;
    model: string;
    chip: string;
    os: string;
    platform: string;
  };
  ports: Port[];
  devices: ConnectedDevice[];
  scannedAt: string;
  durationMs: number;
  warnings: string[];
  demo: boolean;
}
export interface PortyAPI {
  scan: () => Promise<Scan>;
  openExternal: (url: string) => Promise<void>;
  platform: string;
}
export const CONNECTORS: Connector[] = [
  "USB-C",
  "USB-A",
  "HDMI",
  "DisplayPort",
  "Display (unclassified)",
  "SD card",
  "Audio",
  "MagSafe",
  "Ethernet",
  "USB (unclassified)",
];
