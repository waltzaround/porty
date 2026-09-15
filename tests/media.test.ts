import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMacScan } from "../electron/collectors/macos";
import { portStats, portStatLabels } from "../shared/port-stats";

const hardware = {
  SPHardwareDataType: [{ machine_model: "Mac16,5", chip_type: "Apple M4 Max" }],
};
const slot = {
  PortTypeDescription: "SD Card",
  ConnectionActive: true,
  TransportsActive: ["SD"],
  "Card Characteristics": { "Card Type": "SDXC", SerialNumber: "PRIVATE" },
  "Speed Mode": "UHS: SDR104",
  IORegistryEntryChildren: [
    {
      IOObjectClass: "IOMedia",
      Whole: true,
      "BSD Name": "disk18",
      Size: 128177930240,
    },
  ],
};
const readers = [
  {
    _items: [
      {
        _name: "SDXC Card (Class 10)",
        bsd_name: "disk18",
        serial_number: "PRIVATE",
        volumes: [{ file_system: "ExFAT", iocontent: "Windows_NTFS" }],
      },
    ],
  },
];
const scanCard = (node = slot, records = readers) =>
  parseMacScan({ ...hardware, SPCardReaderDataType: records }, [], "macOS", 0, [
    node,
  ]);
const values = (scan: ReturnType<typeof parseMacScan>, id: string) =>
  portStats(scan.ports.find((p) => p.id === id)!).map((s) => s.metric.value);

test("card rows show inserted card capacity, actual file system and current bus mode", () => {
  const scan = scanCard();
  assert.deepEqual(values(scan, "mac-sd"), [
    "SDXC",
    "128.18 GB",
    "ExFAT",
    "UHS: SDR104",
  ]);
  assert.equal(
    scan.ports.find((p) => p.id === "mac-sd")!.devices[0].name,
    "SDXC Card (Class 10)",
  );
  assert.ok(!JSON.stringify(scan).includes("PRIVATE"));
});

test("unplugged cards do not retain stats or card identity from older OS records", () => {
  const scan = scanCard({ ...slot, ConnectionActive: false });
  assert.deepEqual(values(scan, "mac-sd"), ["—", "—", "—", "—"]);
  assert.deepEqual(scan.ports.find((p) => p.id === "mac-sd")!.devices, []);
});

test("another reader’s volumes and partition hints cannot supply this card’s format", () => {
  const other = readers.map((r) => ({
    _items: r._items.map((c) => ({ ...c, bsd_name: "disk99" })),
  }));
  assert.equal(values(scanCard(slot, other), "mac-sd")[2], "Not reported");
  const unformatted = readers.map((r) => ({
    _items: r._items.map((c) => ({
      ...c,
      volumes: [{ file_system: "", iocontent: "Windows_NTFS" }],
    })),
  }));
  assert.equal(
    values(scanCard(slot, unformatted), "mac-sd")[2],
    "Not reported",
  );
});

test("headphone stats use the built-in endpoint rather than USB, Bluetooth or display audio", () => {
  const scan = parseMacScan(
    {
      ...hardware,
      SPAudioDataType: [
        {
          _items: [
            {
              _name: "External Headphones",
              coreaudio_device_transport: "coreaudio_device_type_builtin",
              coreaudio_device_srate: 44100,
              coreaudio_device_output: 2,
            },
            {
              _name: "USB Headphones",
              coreaudio_device_transport: "coreaudio_device_type_usb",
              coreaudio_device_srate: 96000,
              coreaudio_device_output: 8,
              coreaudio_default_audio_output_device: "spaudio_yes",
            },
          ],
        },
      ],
    },
    [],
    "macOS",
  );
  assert.deepEqual(values(scan, "mac-audio"), ["44.1 kHz", "2", "No"]);
  assert.equal(
    scan.ports.find((p) => p.id === "mac-audio")!.status,
    "connected",
  );
  assert.equal(
    scan.ports.find((p) => p.id === "mac-audio")!.devices[0].name,
    "External Headphones",
  );
});

test("missing headphone telemetry never copies speaker settings or invents jack connection state", () => {
  const scan = parseMacScan(
    {
      ...hardware,
      SPAudioDataType: [
        {
          _items: [
            {
              _name: "MacBook Pro Speakers",
              coreaudio_device_transport: "coreaudio_device_type_builtin",
              coreaudio_device_srate: 48000,
              coreaudio_device_output: 2,
              coreaudio_default_audio_output_device: "spaudio_yes",
            },
          ],
        },
      ],
    },
    [],
    "macOS",
  );
  assert.deepEqual(values(scan, "mac-audio"), [
    "Not reported",
    "Not reported",
    "No",
  ]);
  assert.equal(scan.ports.find((p) => p.id === "mac-audio")!.status, "unknown");
  const missing = parseMacScan(hardware, [], "macOS");
  assert.deepEqual(values(missing, "mac-audio"), [
    "Not reported",
    "Not reported",
    "Not reported",
  ]);
});

test("card and headphone column labels describe their own stats", () => {
  assert.deepEqual(portStatLabels("SD card"), [
    "Card type",
    "Capacity",
    "Format",
    "Bus mode",
  ]);
  assert.deepEqual(portStatLabels("Audio"), [
    "Sample rate",
    "Channels",
    "Default output",
  ]);
  assert.deepEqual(portStatLabels("USB-C"), [
    "Current data",
    "Current resolution",
    "Current refresh rate",
    "Current power",
  ]);
});
