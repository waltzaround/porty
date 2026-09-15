import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPortValues } from "../shared/current";
import { demoScan } from "../shared/demo";
import { detected, getMacProfile } from "../shared/profiles";
import { parseMacScan } from "../electron/collectors/macos";
import {
  applyCurrentPower,
  readCurrentDisplayMode,
} from "../electron/collectors/mac-current";
import physical from "./fixtures/mac-physical-ports.json";

const hardware = {
  SPHardwareDataType: [{ machine_model: "Mac16,5", chip_type: "Apple M4 Max" }],
};
const battery = {
  ExternalConnected: true,
  AdapterDetails: {
    AdapterVoltage: 20000,
    Current: 4700,
    SerialNumber: "PRIVATE",
  },
  PowerTelemetryData: { SystemPowerIn: 56754 },
};
const chargerScan = (power: typeof battery | null = battery) =>
  parseMacScan(hardware, [], "macOS", 0, physical, power);

test("overview values use active links and display modes, never the port maximums", () => {
  const port = demoScan().ports[0];
  const current = currentPortValues(port);
  assert.equal(current.data.value, "40 Gb/s");
  assert.equal(current.resolution.value, "5120 × 2880");
  assert.equal(current.refresh.value, "60 Hz");
  port.status = "available";
  assert.deepEqual(
    Object.values(currentPortValues(port)).map((v) => v.value),
    ["—", "—", "—", "—"],
  );
});

test("connected but unreported values do not fall back to manufacturer or cable ratings", () => {
  const port = getMacProfile("Mac16,5")!.ports[0];
  port.status = "connected";
  port.connection = {
    active: true,
    transports: ["DisplayPort"],
    cable: [detected("Cable power rating", "240 W", "Rating")],
    power: [detected("Charger advertised maximum", "140 W", "Rating")],
  };
  assert.deepEqual(
    Object.values(currentPortValues(port)).map((v) => v.value),
    Array(4).fill("Not reported"),
  );
});

test("USB companion links retain both current speeds and exclude downstream devices", () => {
  const device = (speed: number, name: string, children: any[] = []): any => ({
    IOObjectClass: "IOUSBHostDevice",
    "USB Product Name": name,
    DeviceSpeed: speed,
    IORegistryEntryChildren: children,
  });
  const scan = parseMacScan(
    hardware,
    [
      {
        UsbCPortNumber: 1,
        IORegistryEntryChildren: [
          device(2, "USB 2 hub", [device(1, "Mouse")]),
          device(3, "USB 3 hub"),
        ],
      },
    ],
    "macOS",
  );
  assert.equal(
    currentPortValues(scan.ports[0]).data.value,
    "480 Mb/s + 5 Gb/s",
  );
});

test("display parsing preserves fractional refresh and does not invent missing rates", () => {
  assert.deepEqual(
    readCurrentDisplayMode({ _spdisplays_resolution: "2560 x 1440 @ 59.94Hz" }),
    {
      resolution: "2560 × 1440",
      width: 2560,
      height: 1440,
      refreshHz: 59.94,
    },
  );
  assert.equal(
    readCurrentDisplayMode({ spdisplays_resolution: "3840 × 2160" })?.refreshHz,
    undefined,
  );
  assert.equal(
    readCurrentDisplayMode({ spdisplays_resolution: "Unknown" }),
    undefined,
  );
});

test("one active native display port gets the current monitor; ambiguous routes stay unmapped", () => {
  const data = {
    ...hardware,
    SPDisplaysDataType: [
      {
        _name: "Apple M4 Max",
        spdisplays_ndrvs: [
          { _name: "Monitor", _spdisplays_resolution: "2560 x 1440 @ 60Hz" },
        ],
      },
    ],
  };
  const records = physical.map((p) => ({
    ...p,
    ConnectionActive: p.PortTypeDescription === "USB-C" && p.PortNumber === 2,
    TransportsActive:
      p.PortTypeDescription === "USB-C" && p.PortNumber === 2
        ? ["CC", "DisplayPort"]
        : [],
  }));
  const scan = parseMacScan(data, [], "macOS", 0, records);
  assert.equal(
    currentPortValues(scan.ports[1]).resolution.value,
    "2560 × 1440",
  );
  assert.match(scan.ports[1].devices[0].portMapping!, /inferred/);
  const ambiguous = parseMacScan(
    data,
    [],
    "macOS",
    0,
    records.map((p) =>
      p.PortTypeDescription === "HDMI"
        ? { ...p, ConnectionActive: true, TransportsActive: ["DisplayPort"] }
        : p,
    ),
  );
  assert.ok(
    ambiguous.ports.every((p) => !p.devices.some((d) => d.kind === "display")),
  );
  const virtual = parseMacScan(
    {
      ...data,
      SPDisplaysDataType: [
        { ...data.SPDisplaysDataType[0], _name: "DisplayLink" },
      ],
    },
    [],
    "macOS",
    0,
    records,
  );
  assert.ok(
    virtual.ports.every((p) => !p.devices.some((d) => d.kind === "display")),
  );
});

test("power uses measured input watts, with an explicitly negotiated fallback", () => {
  const scan = chargerScan();
  const measured = currentPortValues(scan.ports[2]).power;
  assert.equal(measured.value, "56.8 W");
  assert.equal(measured.note, "Input");
  const fallback = currentPortValues(chargerScan(null).ports[2]).power;
  assert.equal(fallback.value, "94 W");
  assert.equal(fallback.note, "Negotiated");
  assert.ok(!JSON.stringify(scan).includes("PRIVATE"));
});

test("zero input is valid; missing, invalid, stale and mismatched telemetry is not measured power", () => {
  assert.equal(
    currentPortValues(
      chargerScan({ ...battery, PowerTelemetryData: { SystemPowerIn: 0 } })
        .ports[2],
    ).power.value,
    "0 W",
  );
  for (const update of [
    { ExternalConnected: false },
    { PowerTelemetryData: {} },
    { PowerTelemetryData: { SystemPowerIn: -1 } },
    { PowerTelemetryData: { SystemPowerIn: NaN } },
    { PowerTelemetryData: { SystemPowerIn: 999999 } },
    { AdapterDetails: { AdapterVoltage: 5000, Current: 3000 } },
  ]) {
    const scan = parseMacScan(hardware, [], "macOS", 0, physical, {
      ...battery,
      ...update,
    });
    assert.equal(currentPortValues(scan.ports[2]).power.note, "Negotiated");
  }
  const disconnected = parseMacScan(
    hardware,
    [],
    "macOS",
    0,
    physical.map((p) => ({ ...p, ConnectionActive: false })),
    battery,
  );
  assert.equal(currentPortValues(disconnected.ports[2]).power.value, "—");
});

test("multiple reported charging inputs cannot receive a system-wide power reading", () => {
  const scan = chargerScan(null);
  scan.ports[0].connection = structuredClone(scan.ports[2].connection);
  scan.ports[0].status = "connected";
  applyCurrentPower(scan.ports, battery);
  assert.equal(currentPortValues(scan.ports[0]).power.note, "Negotiated");
  assert.equal(currentPortValues(scan.ports[2]).power.note, "Negotiated");
});

test("active monitor identities map distinct monitors to USB-C and HDMI without exporting EDID serial bytes", () => {
  const edid = (vendor: number, product: number) => {
    const data = Buffer.alloc(128);
    data.set([0, 255, 255, 255, 255, 255, 255, 0]);
    data.writeUInt16BE(vendor, 8);
    data.writeUInt16LE(product, 10);
    data.write("PRIVATE", 12);
    return data;
  };
  const display = (
    name: string,
    vendor: string,
    product: string,
    resolution: string,
  ) => ({
    _name: name,
    "_spdisplays_display-vendor-id": vendor,
    "_spdisplays_display-product-id": product,
    _spdisplays_resolution: resolution,
  });
  const data = {
    ...hardware,
    SPDisplaysDataType: [
      {
        _name: "Apple M4 Max",
        spdisplays_ndrvs: [
          display("Dell", "10ac", "41e0", "2560 x 1440 @ 60Hz"),
          display("LG", "1e6d", "56ff", "1080 x 1920 @ 60Hz"),
        ],
      },
    ],
  };
  const records = [
    {
      PortTypeDescription: "USB-C",
      PortNumber: 2,
      ConnectionActive: true,
      TransportsActive: ["DisplayPort"],
      IORegistryEntryChildren: [
        {
          IOObjectClass: "IOPortTransportStateDisplayPort",
          Active: true,
          EDID: edid(0x10ac, 0x41e0),
        },
      ],
    },
    {
      PortTypeDescription: "HDMI",
      PortNumber: 1,
      ConnectionActive: true,
      TransportsActive: ["DisplayPort"],
      IORegistryEntryChildren: [
        {
          IOObjectClass: "IOPortTransportStateDisplayPort",
          Active: true,
          EDID: edid(0x1e6d, 0x56ff),
        },
      ],
    },
  ];
  const scan = parseMacScan(data, [], "macOS", 0, records);
  assert.equal(
    currentPortValues(scan.ports[1]).resolution.value,
    "2560 × 1440",
  );
  assert.equal(
    currentPortValues(scan.ports[3]).resolution.value,
    "1080 × 1920",
  );
  assert.ok(!JSON.stringify(scan).includes("PRIVATE"));
  const unplugged = parseMacScan(
    data,
    [],
    "macOS",
    0,
    records.map((r) => ({ ...r, ConnectionActive: false })),
  );
  assert.ok(
    unplugged.ports.every((p) => !p.devices.some((d) => d.kind === "display")),
  );
  const identical = structuredClone(data);
  identical.SPDisplaysDataType[0].spdisplays_ndrvs[1] = {
    ...identical.SPDisplaysDataType[0].spdisplays_ndrvs[0],
  };
  const ambiguous = parseMacScan(identical, [], "macOS", 0, records);
  assert.ok(
    ambiguous.ports.every((p) => !p.devices.some((d) => d.kind === "display")),
  );
});

test("current resolution uses output pixels rather than a scaled desktop size", () => {
  const mode = readCurrentDisplayMode({
    _spdisplays_pixels: "5120 x 2880",
    _spdisplays_resolution: "2560 x 1440 @ 60Hz",
  });
  assert.equal(mode?.width, 5120);
  assert.equal(mode?.height, 2880);
  assert.equal(mode?.refreshHz, 60);
});
