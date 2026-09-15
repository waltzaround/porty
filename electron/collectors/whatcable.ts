// Adapted from WhatCable (MIT), copyright (c) 2026 Darryl Morley.
// Upstream: 3810eda84e415ad76616d361bb7c4d4126fd1024.
// See THIRD_PARTY_NOTICES.md for the source modules, changes and full licence.
import type { Capability, PowerProfile } from "../../shared/types";
import { detected, unknown } from "../../shared/profiles";
type Raw = Record<string, any>;
export const WHATCABLE_SOURCE = "https://github.com/darrylmorley/whatcable";
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const cap = (label: string, value: string, detail: string): Capability => ({
  ...detected(label, value, detail),
  source: WHATCABLE_SOURCE,
});

// PowerSourceWatcher.parseOption: explicit power wins, otherwise mV × mA.
export function parsePowerOption(raw: unknown): PowerProfile | undefined {
  if (!raw || typeof raw !== "object") return;
  const d = raw as Raw;
  const v = d["Voltage (mV)"];
  const a = d["Max Current (mA)"];
  if (!finite(v) || v <= 0 || !finite(a) || a < 0) return;
  const p = d["Max Power (mW)"];
  const watts = finite(p) ? p / 1000 : (v * a) / 1e6;
  if (watts < 0) return;
  return {
    volts: v / 1000,
    amps: a / 1000,
    watts,
    selected: false,
    supply: !("Class" in d)
      ? "unknown"
      : d.Class === "IOPortFeaturePowerSourceOptionFixed"
        ? "fixed"
        : "non-fixed",
  };
}
export function readPowerSources(branch: Raw[]) {
  return branch
    .filter((n) => typeof n.PowerSourceName === "string")
    .map((n) => {
      const winning = parsePowerOption(n.WinningPowerSourceOption);
      const same = (p: PowerProfile) =>
        !!winning &&
        p.volts === winning.volts &&
        p.amps === winning.amps &&
        p.watts === winning.watts &&
        p.supply === winning.supply;
      const profiles: PowerProfile[] = (
        Array.isArray(n.PowerSourceOptions) ? n.PowerSourceOptions : []
      ).flatMap((raw: unknown) => {
        const p = parsePowerOption(raw);
        return p ? [{ ...p, selected: same(p) }] : [];
      });
      if (winning && !profiles.some(same))
        profiles.push({ ...winning, selected: true });
      profiles.sort((a, b) => a.volts - b.volts || a.amps - b.amps);
      return { name: String(n.PowerSourceName), profiles };
    })
    .filter((s) => s.profiles.length);
}

// USBPDSOPWatcher endpoint routing and Metadata.VDOs; PDVDO.vdoFromData.
export function vdoWord(value: unknown): number | undefined {
  if (!(value instanceof Uint8Array) || value.byteLength < 4) return;
  return new DataView(
    value.buffer,
    value.byteOffset,
    value.byteLength,
  ).getUint32(0, true);
}
function endpoint(n: Raw): string {
  const name =
    n.ComponentName ?? n.AddressDescription ?? n["Address Description"];
  if (typeof name === "string") return name;
  return (
    (
      {
        IOPortTransportComponentCCUSBPDSOP: "SOP",
        IOPortTransportComponentCCUSBPDSOPp: "SOP'",
        IOPortTransportComponentCCUSBPDSOPpp: "SOP''",
      } as Record<string, string>
    )[n.IOObjectClass] ?? ""
  );
}
export function readCable(
  node: Raw,
  branch: Raw[],
  above3A: boolean,
): Capability[] {
  const candidates = branch
    .filter((n) => ["SOP'", "SOP''"].includes(endpoint(n)))
    .map((n) => {
      const metadata =
        n.Metadata && typeof n.Metadata === "object" ? n.Metadata : {};
      // Keep malformed words in position: dropping one would shift the VDO layout.
      const words = Array.isArray(metadata.VDOs)
        ? (metadata.VDOs.map(vdoWord) as (number | undefined)[])
        : [];
      return { n, metadata, words };
    });
  const identity =
    candidates.find(
      (c) =>
        c.words.length >= 4 &&
        c.words.slice(0, 4).every((w) => w !== undefined),
    ) ??
    candidates.find((c) => c.words.some((w) => w !== undefined)) ??
    candidates[0];
  const cable: Capability[] = [
    cap(
      "Cable connection",
      "Connected",
      "The physical connector reports an active connection.",
    ),
  ];
  cable.push(
    identity
      ? cap(
          "E-marker",
          identity.words.some((w) => w !== undefined)
            ? "Identity read"
            : "Present · identity unread",
          identity.words.some((w) => w !== undefined)
            ? "Read from the cable endpoint’s USB-PD Discover Identity response."
            : above3A || (node.TransportsActive ?? []).includes("CIO")
              ? "The cable endpoint is present, but identity data was not returned. Reconnecting may allow another read; some chargers and docks block it."
              : "The cable endpoint is present, but identity data was not returned. macOS usually reads it above 3 A or over Thunderbolt.",
        )
      : unknown(
          "E-marker",
          "No cable identity endpoint was reported on this connection; this does not establish that the cable has no e-marker.",
        ),
  );
  const words = identity?.words ?? [];
  const header = words[0];
  const kind = header === undefined ? undefined : (header >>> 27) & 7;
  // USBPDSOP.cableVDO excludes VCONN-powered devices (type 6), whose VDO3 is different.
  const raw = words[3];
  if ((kind === 3 || kind === 4) && raw !== undefined) {
    const active = kind === 4 || node.ActiveCable === true || !!(raw & 8);
    const speed = raw & 7;
    const current = (raw >>> 5) & 3;
    const maxV = (raw >>> 9) & 3;
    const volts = maxV === 3 ? 48 : 20; // 50 V is insulation headroom; PD delivers at most 48 V.
    const amps = current === 1 ? 3 : current === 2 ? 5 : undefined;
    cable.push(
      cap(
        "Cable construction",
        active ? "Active" : "Passive",
        "Combines the e-marker product type, the port controller’s ActiveCable flag and the active-layout indicator, as in WhatCable.",
      ),
    );
    const speeds = [
      "USB 2.0 · 480 Mb/s",
      "5 Gb/s",
      "10 Gb/s",
      "20 / 40 Gb/s",
      "80 Gb/s",
    ];
    cable.push(
      speed < speeds.length
        ? cap(
            "Cable speed rating",
            speeds[speed],
            speed === 3
              ? "Encoding 3 depends on the USB-PD revision: 20 Gb/s in PD 3.0 or 40 Gb/s in PD 3.1. This is a cable claim, not a measured link."
              : "Decoded from the cable VDO. This is the cable’s advertised capability, not its negotiated link.",
          )
        : unknown(
            "Cable speed rating",
            `Reserved e-marker speed encoding ${speed}; no speed is inferred.`,
          ),
    );
    cable.push(
      amps
        ? cap(
            "Cable current rating",
            `${amps} A`,
            "Decoded from the e-marker’s VBUS current field.",
          )
        : unknown(
            "Cable current rating",
            current === 0
              ? "The e-marker reports USB default current, not an explicit 3 A or 5 A rating."
              : "The e-marker current field uses a reserved encoding.",
          ),
    );
    cable.push(
      amps
        ? cap(
            "Cable power rating",
            `Up to ${volts * amps} W`,
            "Derived from the cable’s voltage and current fields, capped at the 48 V USB-PD delivery ceiling. This is not present power draw.",
          )
        : unknown(
            "Cable power rating",
            "An explicit cable current rating was not reported.",
          ),
    );
    const vendor =
      identity?.metadata["Vendor ID"] ??
      identity?.metadata["Vendor ID (SOP1)"] ??
      identity?.n["Vendor ID (SOP1)"] ??
      identity?.n["Vendor ID"] ??
      (header ?? 0) & 65535;
    if (finite(vendor) && vendor > 0)
      cable.push(
        cap(
          "E-marker vendor ID",
          `0x${vendor.toString(16).toUpperCase().padStart(4, "0")}`,
          "Manufacturer identifier reported by the cable; not inferred from the connected charger.",
        ),
      );
  } else {
    cable.push(
      node.ActiveCable === true
        ? cap(
            "Cable construction",
            "Active",
            "Reported by the port controller.",
          )
        : unknown(
            "Cable construction",
            "No readable cable VDO is available to classify the cable.",
          ),
      unknown(
        "Cable speed rating",
        "The cable’s speed rating requires a readable cable VDO.",
      ),
      unknown(
        "Cable power rating",
        "The charger contract does not establish the cable’s maximum power rating.",
      ),
    );
  }
  if (node.OpticalCable === true)
    cable.push(
      cap("Cable medium", "Optical", "Reported by the port controller."),
    );
  return cable;
}
export function readConnectionDiagnostics(node: Raw): Capability[] {
  const result: Capability[] = [];
  for (const [key, label] of [
    ["ConnectionActive", "Connection active"],
    ["ActiveCable", "Active cable electronics"],
    ["OpticalCable", "Optical cable"],
    ["IOAccessoryUSBActive", "USB active flag"],
    ["IOAccessoryUSBSuperSpeedActive", "SuperSpeed active flag"],
  ]) {
    if (typeof node[key] === "boolean")
      result.push(
        cap(
          label,
          node[key] ? "Yes" : "No",
          "Raw port-controller state. A USB-active flag alone does not establish an enumerated data connection.",
        ),
      );
  }
  if (finite(node["Plug Event Count"]))
    result.push(
      cap(
        "Plug events",
        String(node["Plug Event Count"]),
        "Cumulative controller counter, not the number of attached devices.",
      ),
    );
  for (const [key, label] of [
    ["TransportsSupported", "Supported transports"],
    ["TransportsProvisioned", "Provisioned transports"],
    ["TransportsActive", "Active transports"],
  ]) {
    if (Array.isArray(node[key]))
      result.push(
        cap(
          label,
          node[key].join(" · ") || "None",
          "CC is the configuration channel; CIO is Thunderbolt/USB4. Supported transports describe the port, not the cable.",
        ),
      );
  }
  return result;
}
