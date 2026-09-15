import { test } from "node:test";
import assert from "node:assert/strict";
import physical from "./fixtures/mac-physical-ports.json";
import { parseMacScan } from "../electron/collectors/macos";
import { readUSBDevices, readIOKitProperties } from "../electron/collectors/mac-connections";
const hardware = {
  SPHardwareDataType: [{ machine_model: "Mac16,5", chip_type: "Apple M4 Max" }],
};

test("IOKit properties serialize binary and nested values without registry children or identifiers", () => {
  const rows = readIOKitProperties({
    TransportsActive: ["CC", "USB3"],
    Flags: Buffer.from([0, 129, 255]),
    Metadata: { Count: 2, SerialNumber: "private", UUID: "private" },
    IORegistryEntryChildren: [{ Name: "child" }],
    SerialNumber: "private",
    ConnectionActive: false,
  });
  assert.deepEqual(rows, [
    { key: "ConnectionActive", value: "false" },
    { key: "Flags", value: "00 81 ff" },
    { key: "Metadata", value: "{Count: 2}" },
    { key: "TransportsActive", value: "[CC, USB3]" },
  ]);
});

test("live charger fixture is connected without any enumerated USB data device", () => {
  const scan = parseMacScan(
    hardware,
    [{ UsbCPortNumber: 3 }],
    "macOS",
    0,
    physical,
  );
  const port = scan.ports.find((p) => p.id === "mac-usbc-3")!;
  assert.equal(port.status, "connected");
  assert.equal(port.connection?.active, true);
  assert.equal(port.devices[0].name, "96W USB-C Power Adapter");
  assert.equal(port.devices[0].kind, "power");
  assert.equal(port.connection?.power[0].value, "94 W");
  assert.match(port.connection!.power[0].detail, /not measured power draw/);
  assert.equal(
    port.connection?.cable.find((c) => c.label === "Cable power rating")
      ?.evidence,
    "unknown",
  );
  assert.equal(
    port.capabilities.find((c) => c.label === "Power output")?.evidence,
    "unknown",
  );
  assert.equal(scan.ports[0].connection?.active, false);
  assert.equal(scan.ports[0].status, "available");
  assert.ok(!/UUID|Serial|IORegistryEntryChildren/.test(JSON.stringify(scan)));
});

test("unplugging clears stale charger identity and cable records retained by firmware", () => {
  const disconnected = physical.map((n) => ({ ...n, ConnectionActive: false }));
  const scan = parseMacScan(
    hardware,
    [{ UsbCPortNumber: 3 }],
    "macOS",
    0,
    disconnected,
  );
  const port = scan.ports.find((p) => p.id === "mac-usbc-3")!;
  assert.equal(port.status, "available");
  assert.deepEqual(port.devices, []);
  assert.deepEqual(port.connection?.power, []);
  assert.deepEqual(port.connection?.cable, []);
});

test("display-only USB-C connection counts as occupied without invented USB devices", () => {
  const scan = parseMacScan(hardware, [{ UsbCPortNumber: 2 }], "macOS", 0, [
    {
      PortTypeDescription: "USB-C",
      PortNumber: 2,
      ConnectionActive: true,
      TransportsActive: ["CC", "DisplayPort"],
    },
  ]);
  const port = scan.ports[1];
  assert.equal(port.status, "connected");
  assert.deepEqual(port.devices, []);
  assert.ok(port.connection?.transports.includes("DisplayPort"));
});

test("hub driver layers preserve downstream ports and identically named devices", () => {
  const device = (id: number) => ({
    IOObjectClass: "IOUSBHostDevice",
    IORegistryEntryID: id,
    "USB Product Name": "USB SSD",
    "Device Speed": 3,
  });
  const nodes = [
    {
      IOObjectClass: "IOUSBHostDevice",
      IORegistryEntryID: 100,
      "USB Product Name": "USB Hub",
      bDeviceClass: 9,
      IORegistryEntryChildren: [
        {
          IOObjectClass: "AppleUSBHub",
          IORegistryEntryChildren: [
            {
              IOObjectClass: "AppleUSB30HubPort",
              PortNumber: 1,
              UsbConnector: 3,
              IORegistryEntryChildren: [device(101)],
            },
            {
              IOObjectClass: "AppleUSB30HubPort",
              PortNumber: 2,
              IORegistryEntryChildren: [device(102)],
            },
            { IOObjectClass: "AppleUSB30HubPort", PortNumber: 3 },
          ],
        },
      ],
    },
  ];
  const scan = parseMacScan(
    hardware,
    [
      { UsbCPortNumber: 1, IORegistryEntryChildren: nodes },
      { IOObjectClass: "AppleUSB30HubPort", PortNumber: 3, PortType: 0 },
    ],
    "macOS",
  );
  const port = scan.ports[0];
  assert.equal(port.status, "connected");
  assert.equal(port.devices.length, 3);
  assert.equal(port.devices[0].hubPorts?.length, 3);
  assert.equal(port.devices[0].hubPorts?.[0].connector, "USB-A");
  assert.equal(port.devices[0].hubPorts?.[1].connector, "USB (unclassified)");
  assert.equal(port.devices[0].hubPorts?.[2].status, "available");
  assert.equal(port.devices[1].parentName, "USB Hub");
  assert.notEqual(port.devices[1].id, port.devices[2].id);
  assert.equal(scan.ports.length, 7); // Do not call hub logical paths extra chassis connectors.
});

test("unnamed USB devices are retained using registry device identity", () => {
  const devices = readUSBDevices([
    {
      IOObjectClass: "IOUSBHostDevice",
      idVendor: 1,
      idProduct: 2,
      IORegistryEntryID: 44,
    },
  ]);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, "USB device");
});

test("all online external monitors retain separate identities and current modes", () => {
  const scan = parseMacScan({ ...hardware, SPDisplaysDataType: [{
    _name: "DisplayLink",
    spdisplays_ndrvs: [
      { _name: "Same monitor", _spdisplays_displayID: "1", _spdisplays_resolution: "2560 x 1440 @ 60Hz" },
      { _name: "Same monitor", _spdisplays_displayID: "2", _spdisplays_resolution: "2560 x 1440 @ 60Hz" },
      { _name: "Portrait", _spdisplays_displayID: "3", _spdisplays_resolution: "1080 x 1920 @ 60Hz" },
      { _name: "Built-in", spdisplays_connection_type: "spdisplays_internal" },
      { _name: "Offline", spdisplays_online: "spdisplays_no" },
    ],
  }] }, [], "macOS", 0, []);
  const monitors = scan.devices.filter((d) => d.kind === "display");
  assert.equal(monitors.length, 3);
  assert.notEqual(monitors[0].id, monitors[1].id);
  assert.equal(monitors[2].detail, "1080 x 1920 @ 60Hz");
});
