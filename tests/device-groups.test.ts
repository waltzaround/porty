import test from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/mac-dx3-dock.json";
import type { Scan } from "../shared/types";
import { locatedDevices, physicalDeviceGroups } from "../shared/device-groups";
import { portInventory } from "../shared/port-inventory";
import { deviceTopology } from "../shared/topology";
import { displayReadings, currentPortValues } from "../shared/current";
import { parseWindowsDisplays } from "../electron/collectors/windows-displays";
import { windowsDeviceId } from "../electron/collectors/windows-topology";
import { attachCurrentDisplay } from "../electron/collectors/mac-current";
const scan = () => structuredClone(fixture) as Scan;
const groups = (s: Scan) =>
  physicalDeviceGroups(s.ports, locatedDevices(s.ports, s.devices));

test("DX3 is one dock with three separate display readings, four sockets and separate accessories", () => {
  const s = scan(),
    before = JSON.stringify(s),
    model = groups(s);
  assert.equal(model.length, 1);
  assert.equal(model[0].name, "ALOGIC DX3 Docking Station");
  assert.equal(model[0].kind, "dock");
  assert.equal(model[0].members.length, 7);
  assert.ok(
    model[0].members.every((d) => !/Sennheiser|StreamCam/.test(d.name)),
  );
  assert.equal(model[0].displays.length, 3);
  assert.ok(model[0].displays.every((d) => d.evidence === "inferred"));
  const inventory = portInventory(s);
  assert.equal(inventory.length, 2);
  assert.equal(
    inventory[1].ports.filter((p) => p.connector.startsWith("USB")).length,
    4,
  );
  assert.equal(
    new Set(inventory[1].ports.map((p) => p.id)).size,
    inventory[1].ports.length,
  );
  const readings = displayReadings(model[0].displays.map((d) => d.device));
  assert.deepEqual(
    readings.map((r) => r.label),
    ["MSI MD272QXP", "Q27B3M 1", "Q27B3M 2"],
  );
  assert.ok(readings.every((r) => r.value === "2560 × 1440 · 60 Hz"));
  assert.equal(JSON.stringify(s), before);
});

test("connection map shares membership and retains downstream peripherals and inferred edges", () => {
  const s = scan(),
    model = groups(s);
  const input = locatedDevices(s.ports, s.devices).map((d) => ({
    ...d,
    port: d.portId ?? "System inventory",
  }));
  const nodes = deviceTopology(s.ports, input, model),
    dock = nodes.find((n) => n.group)!;
  assert.equal(nodes.filter((n) => n.group).length, 1);
  for (const name of [
    "Sennheiser Profile",
    "Logitech StreamCam",
    "Q27B3M 1",
    "Q27B3M 2",
  ])
    assert.equal(nodes.find((n) => n.name === name)?.parent, dock.id);
  assert.equal(
    nodes.filter((n) => n.device?.kind === "display" && n.uncertain).length,
    3,
  );
  assert.ok(!nodes.some((n) => /^USB[23]/.test(n.name)));
  assert.ok(!nodes.some((n) => n.device?.kind === "power"));
});

test("ordinary USB-C and Thunderbolt native docks also group multiple displays without DisplayLink", () => {
  for (const transports of [
    ["USB3", "DisplayPort"],
    ["CIO", "Thunderbolt"],
  ]) {
    const s = scan();
    const graphic = s.ports[0].devices.find((d) => d.usb?.vendorId === 0x17e9)!;
    graphic.name = "Example dock";
    graphic.usb!.vendorId = 123;
    s.ports[0].connection!.transports = transports;
    s.ports[0].devices.push(
      ...s.devices.map((d) => ({ ...d, portMapping: "Reported host route" })),
    );
    const model = groups(s);
    assert.equal(model.length, 1);
    assert.equal(model[0].displayLink, false);
    assert.equal(model[0].displays.length, 3);
    assert.equal(model[0].name, "Example dock");
  }
});

test("two docks do not absorb unmapped displays and explicit adapter routes choose one dock", () => {
  const s = scan(),
    second = structuredClone(s.ports[0]);
  second.id = s.ports[1].id;
  second.name = s.ports[1].name;
  for (const d of second.devices) {
    if (d.id) d.id += "-b";
    if (d.parentId) d.parentId += "-b";
    if (d.usb?.containerId) d.usb.containerId += "-b";
    for (const p of d.hubPorts ?? [])
      p.deviceIds = p.deviceIds?.map((id) => id + "-b");
  }
  s.ports[1] = second;
  assert.equal(groups(s).length, 2);
  assert.ok(groups(s).every((g) => !g.displays.length));
  s.devices[0].displayRoute = {
    transport: "usb",
    deviceId: second.devices.find((d) => d.usb?.vendorId === 0x17e9)!.id,
  };
  const model = groups(s);
  assert.equal(model[0].displays.length, 0);
  assert.equal(model[1].displays[0].evidence, "reported");
  assert.equal(model[1].displays.length, 1);
});

test("missing port state, separate video cables and virtual displays never become inferred dock outputs", () => {
  for (const change of ["unknown", "hdmi", "virtual", "conflicting-id"]) {
    const s = scan();
    if (change === "unknown") s.ports[1].connection = undefined;
    if (change === "hdmi") s.ports[3].connection!.active = true;
    if (change === "virtual")
      s.devices.forEach((d) => {
        d.displayRoute = { transport: "virtual" };
      });
    if (change === "conflicting-id")
      s.devices.forEach((d) => {
        d.displayRoute = { transport: "usb", deviceId: "absent-adapter" };
      });
    assert.equal(groups(s)[0].displays.length, 0, change);
  }
});

test("removable graphics adapters and hubs keep their own identity and no share of upstream power", () => {
  const s = scan(),
    host = s.ports[0],
    graphic = host.devices.find((d) => d.usb?.vendorId === 0x17e9)!;
  graphic.usb!.internal = false;
  const model = groups(s);
  assert.equal(model.length, 2);
  const adapter = model.find((g) =>
    g.members.some((d) => d.id === graphic.id),
  )!;
  assert.ok(adapter.parentGroupId);
  assert.equal(adapter.powerPort, undefined);
  assert.ok(model.every((g) => g.displays.length === 0));
});

test("unplugging clears membership and power; missing modes remain individually visible", () => {
  const s = scan();
  s.devices[1].displayMode = undefined;
  s.devices[2].displayMode!.refreshHz = undefined;
  const readings = displayReadings(groups(s)[0].displays.map((d) => d.device));
  assert.equal(readings[1].value, "Not reported");
  assert.equal(readings[2].value, "2560 × 1440 · Refresh not reported");
  const metric = currentPortValues({
    ...s.ports[0],
    devices: s.devices,
  }).displays;
  assert.equal(metric.lines!.length, 3);
  assert.match(metric.value, /Q27B3M 1: Not reported/);
  s.ports[0].devices = [];
  s.ports[0].connection!.active = false;
  assert.deepEqual(groups(s), []);
});

test("Windows adapter identities are private, match USB identity and reject composite guesses", () => {
  const raw = "USB\\VID_17E9&PID_6000\\PRIVATE-SERIAL";
  const [d] = parseWindowsDisplays([
    { Id: "target", AdapterUsbInstanceId: raw, Technology: 16 },
  ]);
  assert.equal(d.displayRoute!.deviceId, windowsDeviceId(raw.toLowerCase()));
  assert.equal(d.displayRoute!.transport, "usb");
  assert.ok(!JSON.stringify(d).includes("PRIVATE-SERIAL"));
  assert.equal(
    parseWindowsDisplays([
      { Id: "t", AdapterUsbInstanceId: raw.replace("6000", "6000&MI_00") },
    ])[0].displayRoute!.deviceId,
    undefined,
  );
});

test("a USB graphics display is never assigned to a native port by the one-monitor fallback", () => {
  const s = scan();
  attachCurrentDisplay(s.ports, [s.devices[0]]);
  assert.ok(!s.ports[0].devices.some((d) => d.kind === "display"));
  s.ports[0].devices = [];
  s.devices[0].displayRoute = { transport: "usb" };
  attachCurrentDisplay(s.ports, [s.devices[0]]);
  assert.ok(!s.ports[0].devices.some((d) => d.kind === "display"));
});

test("monitor hub with a downstream display stays one group with host charging and separate video readings", () => {
  const s = scan();
  s.devices = s.devices.slice(0, 2);
  s.devices[0].name = "DELL U4025QW";
  s.devices[1].name = "DELL U27";
  s.devices.forEach(d => { d.displayRoute = { transport: "native" }; });
  const graphic = s.ports[0].devices.find(d => d.usb?.vendorId === 0x17e9)!;
  graphic.usb!.vendorId = 0x413c;
  graphic.name = "DELL U4025QW";
  s.ports[0].connection!.transports = ["Thunderbolt", "DisplayPort", "USB2"];
  const model = groups(s);
  assert.equal(model.length, 1);
  assert.equal(model[0].name, "DELL U4025QW");
  assert.equal(model[0].kind, "monitor");
  assert.equal(model[0].displays.length, 2);
  assert.equal(model[0].powerPort?.id, s.ports[0].id);
  assert.ok(model[0].displays.every(d => d.evidence === "inferred"));
  assert.ok(model[0].displays.every(d => d.device.displayRoute?.transport === "native"));
  // A same-named component cannot pull monitors off another host connection.
  s.ports[1].connection!.active = true;
  assert.equal(groups(s)[0].displays.length, 0);
});
