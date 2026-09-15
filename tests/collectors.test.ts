import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMacScan } from "../electron/collectors/macos";
import {
  mergeWindowsCompanions,
  parseWindowsScan,
  type WindowsPort,
} from "../electron/collectors/windows";
import { getMacProfile } from "../shared/profiles";
import { demoScan } from "../shared/demo";

const hardware = {
  SPHardwareDataType: [
    {
      machine_model: "Mac16,5",
      machine_name: "MacBook Pro",
      chip_type: "Apple M4 Max",
      serial_number: "PRIVATE-SERIAL",
      platform_UUID: "PRIVATE-UUID",
    },
  ],
};
test("Mac USB 2 and USB 3 companion paths represent one physical connector", () => {
  const result = parseMacScan(
    hardware,
    [
      { UsbCPortNumber: 1, "UsbProtocol (2.0)": true },
      { UsbCPortNumber: 1, "UsbProtocol (3.x)": true },
    ],
    "macOS",
  );
  assert.equal(result.ports.length, 7);
  assert.equal(result.ports.filter((p) => p.id === "mac-usbc-1").length, 1);
  assert.equal(result.ports[0].status, "available");
  assert.equal(result.ports[1].status, "unknown");
});
test("Mac USB-C connection recognizes devices without treating 120 Gb/s as a transfer rate", () => {
  const result = parseMacScan(
    {
      ...hardware,
      SPThunderboltDataType: [
        {
          _name: "thunderboltusb4_bus_0",
          receptacle_1_tag: {
            receptacle_id_key: "1",
            current_speed_key: "Up to 120 Gb/s",
            receptacle_status_key: "receptacle_no_devices_connected",
          },
        },
      ],
    },
    [
      {
        UsbCPortNumber: 1,
        IORegistryEntryChildren: [
          {
            IOObjectClass: "IOUSBHostDevice",
            "USB Product Name": "Test SSD",
            DeviceSpeed: 3,
          },
        ],
      },
    ],
    "macOS",
  );
  const port = result.ports[0];
  assert.equal(port.status, "connected");
  assert.equal(port.devices[0].name, "Test SSD");
  assert.equal(
    port.capabilities.find((c) => c.label === "Data transfer")?.value,
    "80 Gb/s",
  );
  assert.equal(
    port.capabilities.find((c) => c.label === "Controller limit")?.value,
    "Up to 120 Gb/s",
  );
  assert.equal(
    port.capabilities.find((c) => c.label === "Power output")?.evidence,
    "unknown",
  );
});
test("Missing registry does not turn unobserved ports into available ports", () => {
  const scan = parseMacScan(hardware, null, "macOS");
  assert.ok(scan.ports.every((p) => p.status === "unknown"));
  assert.ok(scan.warnings.some((w) => w.includes("registry")));
});
test("Unknown Mac models do not inherit a guessed hardware profile", () => {
  const scan = parseMacScan(
    {
      SPHardwareDataType: [
        { machine_model: "Mac99,1", machine_name: "MacBook Pro" },
      ],
    },
    [],
    "macOS",
  );
  assert.equal(scan.ports.length, 0);
  assert.ok(scan.warnings.length);
});
test("Internal USB wiring is not counted as external ports", () => {
  const scan = parseMacScan(
    {},
    [
      {
        PortType: 1,
        UsbConnector: 255,
        IORegistryEntryName: "internal-camera",
      },
    ],
    "macOS",
  );
  assert.equal(scan.ports.length, 0);
});
test("Report excludes hardware serials and machine UUIDs", () => {
  const report = JSON.stringify(parseMacScan(hardware, [], "macOS"));
  assert.ok(!report.includes("PRIVATE"));
});
test("Sample data cannot mutate subsequent real model profiles", () => {
  demoScan();
  assert.equal(getMacProfile("Mac16,5")!.ports[0].devices.length, 0);
  assert.equal(getMacProfile("Mac16,5")!.ports[0].status, "unknown");
});
const winPort = (changes: Partial<WindowsPort> = {}): WindowsPort => ({
  Hub: "\\\\?\\USB#ROOT_HUB30#ONE",
  Number: 1,
  PropertiesKnown: true,
  UserConnectable: true,
  TypeC: true,
  CompanionPort: 0,
  Protocols: 2,
  Flags: 0,
  Status: 0,
  Speed: 0,
  ...changes,
});
test("Windows USB 2 and USB 3 companions merge even with different path prefixes and case", () => {
  const p1 = winPort({
    CompanionPort: 2,
    CompanionHub: "\\??\\usb#root_hub30#one",
  });
  const p2 = winPort({ Number: 2, Protocols: 4 });
  assert.equal(mergeWindowsCompanions([p1, p2]).length, 1);
  assert.equal(parseWindowsScan({ usb: { Ports: [p1, p2] } }).ports.length, 1);
});
test("Windows companion cycles terminate and unrelated ports stay distinct", () => {
  const ports = [
    winPort({ CompanionPort: 2 }),
    winPort({ Number: 2, CompanionPort: 1 }),
    winPort({ Number: 3 }),
  ];
  assert.equal(mergeWindowsCompanions(ports).length, 2);
});
test("Windows does not fabricate USB-A shape from a non-C connector flag", () => {
  const scan = parseWindowsScan({
    usb: { Ports: [winPort({ TypeC: false })] },
  });
  assert.equal(scan.ports[0].connector, "USB (unclassified)");
});
test("Windows suppresses internal and unclassifiable logical ports", () => {
  const scan = parseWindowsScan({
    usb: {
      Ports: [
        winPort({ UserConnectable: false }),
        winPort({ Number: 2, PropertiesKnown: false }),
      ],
    },
  });
  assert.equal(scan.ports.length, 0);
  assert.ok(scan.warnings.some((w) => w.includes("logical ports")));
});
test("Windows protocol support does not become an invented maximum speed or power rating", () => {
  const scan = parseWindowsScan({
    usb: {
      Ports: [
        winPort({
          Protocols: 4,
          Status: 1,
          Speed: 3,
          Flags: 4,
          Vid: "1234",
          Pid: "5678",
        }),
      ],
    },
    devices: [
      { Name: "External SSD", PNPDeviceID: "USB\\VID_1234&PID_5678\\SERIAL" },
    ],
  });
  const port = scan.ports[0];
  assert.equal(port.devices[0].name, "External SSD");
  assert.equal(
    port.capabilities.find((c) => c.label === "Data transfer")?.evidence,
    "unknown",
  );
  assert.equal(
    port.capabilities.find((c) => c.label === "Current link")?.value,
    "10 Gb/s or higher",
  );
  assert.ok(!JSON.stringify(scan).includes("SERIAL"));
});
test("Windows failed connection queries remain unknown", () => {
  const scan = parseWindowsScan({ usb: { Ports: [winPort({ Status: -1 })] } });
  assert.equal(scan.ports[0].status, "unknown");
});
test("Windows reads named non-USB firmware ports and deduplicates duplicate labels", () => {
  const scan = parseWindowsScan({
    connectors: [
      { ExternalReferenceDesignator: "HDMI 1" },
      { ExternalReferenceDesignator: "HDMI 1" },
      { ExternalReferenceDesignator: "RJ45 LAN" },
      { ExternalReferenceDesignator: "Internal USB" },
    ],
  });
  assert.deepEqual(
    scan.ports.map((p) => p.connector),
    ["HDMI", "Ethernet"],
  );
  assert.ok(scan.ports.every((p) => p.status === "unknown"));
});
