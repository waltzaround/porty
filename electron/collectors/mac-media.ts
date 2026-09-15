import type { Capability, ConnectedDevice, Port } from "../../shared/types";
import { detected } from "../../shared/profiles";
import { children, descendants } from "./mac-connections";

type Raw = Record<string, any>;
const array = (value: unknown): Raw[] => (Array.isArray(value) ? value : []);
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export function applyDisplayAudioStats(
  monitors: ConnectedDevice[],
  audio: Raw[],
) {
  const devices = audio.flatMap((group) => array(group._items));
  const outputs = devices.filter(
    (d) =>
      [
        "coreaudio_device_type_displayport",
        "coreaudio_device_type_hdmi",
      ].includes(d.coreaudio_device_transport) &&
      positive(d.coreaudio_device_output),
  );
  const name = (value: unknown) => text(value)?.toLowerCase();
  const defaultKnown = devices.some(
    (d) => d.coreaudio_default_audio_output_device === "spaudio_yes",
  );
  for (const monitor of monitors) {
    if (
      monitors.filter((d) => name(d.name) === name(monitor.name)).length !== 1
    )
      continue;
    const matching = outputs.filter(
      (d) => name(d._name) === name(monitor.name),
    );
    if (matching.length !== 1) continue;
    const device = matching[0];
    monitor.audioOutput = {
      channels: device.coreaudio_device_output,
      ...(positive(device.coreaudio_device_srate)
        ? { sampleRateHz: device.coreaudio_device_srate }
        : {}),
      ...(defaultKnown
        ? {
            isDefault:
              device.coreaudio_default_audio_output_device === "spaudio_yes",
          }
        : {}),
    };
  }
}

export function applyCardStats(ports: Port[], physical: Raw[], readers: Raw[]) {
  const port = ports.find((p) => p.id === "mac-sd");
  const slot = physical.find((p) => p.PortTypeDescription === "SD Card");
  if (!port || slot?.ConnectionActive !== true) return;
  const branch = descendants(children(slot));
  const media = branch.find(
    (n) => n.IOObjectClass === "IOMedia" && n.Whole === true,
  );
  // Join the system volume information to the slot's actual disk, never the
  // first removable disk (which could be a separate USB card reader).
  const cards = readers.flatMap((r) => array(r._items));
  const matches = media?.["BSD Name"]
    ? cards.filter((c) => c.bsd_name === media["BSD Name"])
    : [];
  const card = matches.length === 1 ? matches[0] : undefined;
  const characteristics = slot["Card Characteristics"] ?? {};
  const cardType = text(characteristics["Card Type"]);
  const bytes = media?.Size;
  const formats = [
    ...new Set(
      array(card?.volumes).flatMap((v) =>
        text(v.file_system) ? [v.file_system as string] : [],
      ),
    ),
  ];
  const busMode = text(slot["Speed Mode"]);
  const stats: Capability[] = [];
  if (cardType)
    stats.push(
      detected(
        "Card type",
        cardType,
        "Type of the inserted card reported by the SD controller.",
      ),
    );
  if (positive(bytes))
    stats.push(
      detected(
        "Capacity",
        `${Number((bytes / 1e9).toFixed(2))} GB`,
        "Total capacity of the inserted card, in decimal gigabytes. This is not free space.",
      ),
    );
  if (formats.length)
    stats.push(
      detected(
        "Format",
        formats.join(" / "),
        "File systems reported for the volumes on this card. Partition type identifiers are not used as file systems.",
      ),
    );
  if (busMode)
    stats.push(
      detected(
        "Bus mode",
        busMode,
        "Current SD bus mode reported by the controller; this is not measured read or write throughput.",
      ),
    );
  port.currentStats = stats;
  port.note =
    "Connection state and bus mode come from the SD slot. Volume formats are matched to the inserted card’s disk.";
  port.devices.push({
    id: `${port.id}-card`,
    kind: "device",
    name: text(card?._name) ?? (cardType ? `${cardType} card` : "SD card"),
    detail: stats.map((s) => s.value).join(" · ") || "Card inserted",
  });
}

export function applyAudioStats(ports: Port[], audio: Raw[] | undefined) {
  const port = ports.find((p) => p.id === "mac-audio");
  if (!port || !audio) return;
  const devices = audio.flatMap((group) => array(group._items));
  const builtin = devices.filter(
    (d) =>
      d.coreaudio_device_transport === "coreaudio_device_type_builtin" &&
      positive(d.coreaudio_device_output),
  );
  const headphones = builtin.filter((d) =>
    /headphones?|external_headphones/i.test(
      `${d._name ?? ""} ${d.coreaudio_output_source ?? ""}`,
    ),
  );
  if (headphones.length !== 1) {
    // Another default output is useful information, but a missing headphone
    // endpoint alone does not prove the physical jack is empty.
    if (
      !headphones.length &&
      devices.some(
        (d) => d.coreaudio_default_audio_output_device === "spaudio_yes",
      )
    ) {
      port.currentStats = [
        detected(
          "Default output",
          "No",
          "macOS currently uses a different audio device as the default output.",
        ),
      ];
    }
    return;
  }
  const device = headphones[0];
  const stats: Capability[] = [];
  if (positive(device.coreaudio_device_srate))
    stats.push(
      detected(
        "Sample rate",
        `${device.coreaudio_device_srate / 1000} kHz`,
        "Current Core Audio sample rate of the built-in headphone output.",
      ),
    );
  stats.push(
    detected(
      "Channels",
      String(device.coreaudio_device_output),
      "Output channel count reported for the built-in headphone endpoint.",
    ),
  );
  if (
    device.coreaudio_default_audio_output_device === "spaudio_yes" ||
    devices.some(
      (d) => d.coreaudio_default_audio_output_device === "spaudio_yes",
    )
  ) {
    stats.push(
      detected(
        "Default output",
        device.coreaudio_default_audio_output_device === "spaudio_yes"
          ? "Yes"
          : "No",
        "Whether macOS currently routes default audio output to the headphone jack.",
      ),
    );
  }
  port.currentStats = stats;
  port.status = "connected";
  port.evidence = "detected";
  port.source = "macOS Core Audio + model specifications";
  port.note =
    "The built-in headphone endpoint is reported by Core Audio. USB, Bluetooth, display and virtual audio devices are excluded.";
  port.devices.push({
    id: `${port.id}-headphones`,
    kind: "device",
    name: text(device._name) ?? "Headphones",
    detail: stats
      .filter((s) => s.label !== "Default output")
      .map((s) => (s.label === "Channels" ? `${s.value} channels` : s.value))
      .join(" · "),
  });
}
