import type { Capability, Connector, Port } from "./types";
import { defaultDisplaySupport, m4DisplaySupport } from "./display";

export const unknown = (
  label: string,
  detail = "The operating system does not report this capability. Check the manufacturer’s specifications.",
): Capability => ({
  label,
  value: "Not reported",
  evidence: "unknown",
  detail,
});
export const detected = (
  label: string,
  value: string,
  detail: string,
): Capability => ({ label, value, evidence: "detected", detail });
const spec = (
  label: string,
  value: string,
  detail: string,
  source: string,
): Capability => ({ label, value, evidence: "specification", detail, source });

// Exact model identifiers only. Never guess a generation from the machine’s marketing name.
const profiles: Record<
  string,
  { name: string; source: string; thunderbolt: number }
> = {
  "Mac16,5": {
    name: "MacBook Pro 16″ · 2024",
    source: "https://support.apple.com/en-us/121554",
    thunderbolt: 5,
  },
  "Mac16,7": {
    name: "MacBook Pro 16″ · 2024",
    source: "https://support.apple.com/en-us/121554",
    thunderbolt: 5,
  },
  "Mac16,6": {
    name: "MacBook Pro 14″ · 2024",
    source: "https://support.apple.com/en-us/121553",
    thunderbolt: 5,
  },
  "Mac16,8": {
    name: "MacBook Pro 14″ · 2024",
    source: "https://support.apple.com/en-us/121553",
    thunderbolt: 5,
  },
};
export function getMacProfile(model: string, chip = "") {
  const profile = profiles[model];
  if (!profile) return undefined;
  const { source } = profile;
  const makePort = (
    id: string,
    name: string,
    connector: Connector,
    protocol: string,
    capabilities: Capability[],
  ): Port => ({
    id,
    name,
    connector,
    protocol,
    capabilities,
    display:
      connector === "USB-C" || connector === "HDMI"
        ? m4DisplaySupport(chip)
        : defaultDisplaySupport(connector),
    source,
    location: "Built-in",
    status: "unknown",
    evidence: "specification",
    devices: [],
  });
  const ports: Port[] = Array.from({ length: 3 }, (_, i) => ({
    ...makePort(
      `mac-usbc-${i + 1}`,
      `USB-C ${i + 1}`,
      "USB-C",
      "Thunderbolt 5",
      [
        spec(
          "Data transfer",
          "80 Gb/s",
          "Thunderbolt 5 offers 80 Gb/s bidirectional bandwidth. Actual transfers depend on the device, cable, and workload.",
          "https://www.intel.com/content/www/us/en/newsroom/news/intel-introduces-thunderbolt-5-standard.html",
        ),
        spec(
          "Bandwidth Boost",
          "Up to 120 Gb/s",
          "Asymmetric bandwidth for display-heavy workloads; this is not a 120 Gb/s file-transfer guarantee.",
          source,
        ),
        spec(
          "USB support",
          "USB4",
          "USB4 is supported through this USB-C connector. Older compatible USB devices negotiate their own speed.",
          source,
        ),
        spec(
          "Display output",
          "DisplayPort 2.1",
          "Native DisplayPort over USB-C. Total display count and resolution depend on the chip and other connected displays.",
          source,
        ),
        spec(
          "Charging input",
          "Supported",
          "The computer can charge through this port. Required wattage depends on the adapter, cable, and workload.",
          source,
        ),
        unknown(
          "Power output",
          "Maximum accessory power and negotiated USB Power Delivery profiles are not exposed by this scan. An adapter’s wattage is not the port’s output rating.",
        ),
        unknown(
          "Current link",
          "Connect a device to see the speed reported by the operating system.",
        ),
      ],
    ),
    speedGbps: 80,
  }));
  ports.push(
    makePort("mac-hdmi", "HDMI", "HDMI", "Digital video & audio", [
      spec(
        "Display output",
        "HDMI",
        "Digital video output. Published resolution and refresh-rate limits are listed above.",
        source,
      ),
      spec(
        "Audio",
        "Multichannel",
        "Digital multichannel audio output over HDMI.",
        source,
      ),
    ]),
    makePort("mac-sd", "SDXC card reader", "SD card", "SDXC", [
      spec(
        "Card support",
        "SDXC",
        "Built-in full-size SDXC card slot.",
        source,
      ),
      unknown(
        "Transfer speed",
        "The model profile does not provide a verified maximum card-reader transfer rate.",
      ),
    ]),
    makePort("mac-audio", "Headphone jack", "Audio", "3.5 mm audio", [
      spec(
        "Audio output",
        "High-impedance support",
        "3.5 mm analog headphone output with support for high-impedance headphones.",
        source,
      ),
    ]),
    makePort("mac-magsafe", "MagSafe 3", "MagSafe", "Magnetic charging", [
      spec(
        "Charging input",
        "MagSafe 3",
        "Dedicated magnetic charging connector. Charging performance depends on the power adapter and cable.",
        source,
      ),
      spec(
        "Data transfer",
        "Power only",
        "This connector is used to charge the computer.",
        source,
      ),
    ]),
  );
  return { name: profile.name, ports };
}
