import test from "node:test";
import assert from "node:assert/strict";
import { ConnectionHistory, scanChanges } from "../shared/events";
import { demoScan } from "../shared/demo";
import { parseHardwareNotification } from "../electron/hardware-monitor";
import { boundedScan } from "../electron/scan-timeout";
import { collectMacScan } from "../electron/collectors/macos";
import { Monitoring } from "../electron/monitoring";
import type { MonitorUpdate } from "../shared/events";
import type { ConnectedDevice, Scan } from "../shared/types";

function initial(): Scan {
  const s = demoScan();
  s.demo = false;
  s.warnings = [];
  s.devices = [];
  s.ports.forEach((p) => {
    p.devices = [];
  });
  s.collection = { usb: true, displays: true, ports: true };
  return s;
}
const device = (id: string): ConnectedDevice => ({
  id,
  name: "Desk display",
  kind: "display",
  detail: "Display",
  displayMode: {
    resolution: "1440p",
    width: 2560,
    height: 1440,
    refreshHz: 60,
  },
});

test("history uses a baseline and records independent connect, mode, and disconnect changes", () => {
  const start = initial(),
    connected = structuredClone(start);
  connected.devices.push(device("display-1"));
  const history = new ConnectionHistory();
  history.observe(start);
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].type, "info");
  history.observe(connected);
  assert.equal(history.events[0].type, "connected");
  const changed = structuredClone(connected);
  changed.devices[0].displayMode!.refreshHz = 120;
  history.observe(changed);
  assert.match(history.events[0].detail, /60 Hz → 2560 × 1440 · 120 Hz/);
  history.observe(start);
  assert.equal(history.events[0].type, "disconnected");
});
test("failed and partial sources never generate false disconnects or reconnects", () => {
  const before = initial();
  before.devices = [device("display-1")];
  const partial = initial();
  partial.collection!.displays = false;
  assert.deepEqual(scanChanges(before, partial), []);
  assert.deepEqual(scanChanges(partial, before), []);
  const noMetadata = structuredClone(partial);
  delete noMetadata.collection;
  noMetadata.warnings = ["Display query failed"];
  assert.deepEqual(scanChanges(before, noMetadata), []);
});
test("measured power fluctuations and device ordering do not become events", () => {
  const before = initial();
  before.devices = [
    device("a"),
    { id: "usb-2", name: "Disk", detail: "USB", linkSpeed: "5 Gb/s" },
  ];
  const after = structuredClone(before);
  after.devices.reverse();
  after.ports[0].connection!.power.push({
    label: "Current power input",
    value: "3.4 W",
    evidence: "detected",
    detail: "Measurement",
  });
  assert.deepEqual(scanChanges(before, after), []);
  after.devices[0].linkSpeed = "10 Gb/s";
  assert.match(scanChanges(before, after)[0].detail, /5 Gb\/s → 10 Gb\/s/);
});
test("native notifications retain short reconnects while scan duplicates are suppressed", () => {
  const s = initial();
  s.devices = [{ id: "usb-3", name: "Dock", detail: "USB" }];
  const history = new ConnectionHistory();
  history.observe(s);
  history.clear();
  history.liveDomains(true, true);
  history.notification({ kind: "usb", action: "disconnected", id: "usb-3" });
  history.notification({
    kind: "usb",
    action: "connected",
    id: "usb-4",
    name: "Dock",
  });
  history.observe(initial());
  assert.deepEqual(
    history.events.map((e) => e.type),
    ["connected", "disconnected"],
  );
  assert.equal(history.events[1].name, "Dock");
});
test("history is bounded, copied on read, and clearing preserves the baseline", () => {
  const history = new ConnectionHistory(3),
    s = initial();
  history.observe(s);
  for (let i = 0; i < 5; i++)
    history.notification({
      kind: "usb",
      action: "connected",
      id: `usb-${i}`,
      name: "Dock",
    });
  assert.equal(history.events.length, 3);
  const copy = history.events;
  copy[0].name = "Mutated";
  assert.equal(history.events[0].name, "Dock");
  history.clear();
  history.observe(s);
  assert.equal(history.events.length, 0);
});
test("native listener accepts only bounded structured notifications, without serial fields", () => {
  assert.deepEqual(
    parseHardwareNotification('{"kind":"ready","usb":true,"displays":false}'),
    { kind: "ready", usb: true, displays: false },
  );
  assert.equal(parseHardwareNotification("not json"), undefined);
  assert.equal(
    parseHardwareNotification(
      '{"kind":"usb","action":"connected","id":"PRIVATE-SERIAL"}',
    ),
    undefined,
  );
  const event = parseHardwareNotification(
    JSON.stringify({
      kind: "usb",
      action: "connected",
      id: "usb-123",
      name: "Dock\nname",
      serial: "PRIVATE-SERIAL",
    }),
  );
  assert.equal(event?.name, "Dockname");
  assert.ok(!JSON.stringify(event).includes("PRIVATE-SERIAL"));
  assert.equal(parseHardwareNotification("x".repeat(3000)), undefined);
});
test("a stalled scanner times out, aborts its work and permits a later retry", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    boundedScan((s) => {
      signal = s;
      return new Promise(() => {});
    }, 10),
    /timed out/,
  );
  assert.equal(signal?.aborted, true);
  assert.equal(await boundedScan(async () => "recovered", 100), "recovered");
});
test("monitor shares in-flight scans, preserves history across failures and recovers", async () => {
  const updates: MonitorUpdate[] = [];
  let calls = 0;
  const monitor = new Monitoring(
    async () => {
      calls++;
      if (calls === 2) throw new Error("denied");
      return initial();
    },
    (update) => updates.push(update),
  );
  const a = monitor.scan(),
    b = monitor.scan();
  assert.equal(a, b);
  await a;
  assert.equal(calls, 1);
  await assert.rejects(monitor.scan(), /could not be read/);
  assert.equal(monitor.history.events[0].type, "warning");
  await monitor.scan();
  assert.equal(calls, 3);
  assert.ok(!monitor.history.events.some((e) => e.type === "disconnected"));
  assert.ok(updates.some((u) => u.error));
  monitor.stop();
});
const plist =
  '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array></array></plist>';
test("macOS optional permission failures retain hardware and other query results, then recover on retry", async () => {
  let deny = true;
  const run = async (file: string, args: string[]) => {
    if (file.endsWith("sw_vers")) return "26.6";
    if (file.endsWith("ioreg")) return plist;
    if (args.includes("SPHardwareDataType"))
      return JSON.stringify({
        SPHardwareDataType: [
          { machine_model: "Mac16,5", chip_type: "Apple M4 Max" },
        ],
      });
    if (args.includes("SPDisplaysDataType")) {
      if (deny) throw new Error("EPERM operation not permitted");
      return JSON.stringify({ SPDisplaysDataType: [] });
    }
    return "{}";
  };
  const partial = await collectMacScan(run);
  assert.equal(partial.ports.length, 7);
  assert.equal(partial.collection?.displays, false);
  assert.ok(
    partial.warnings.some((w) => /Display information was blocked/.test(w)),
  );
  deny = false;
  const recovered = await collectMacScan(run);
  assert.equal(recovered.collection?.displays, true);
  assert.ok(
    !recovered.warnings.some((w) => /Display information was blocked/.test(w)),
  );
});
test("total query failure is actionable and malformed optional data does not blank the app", async () => {
  await assert.rejects(
    collectMacScan(async () => {
      throw new Error("denied");
    }),
    /hardware information is unavailable/,
  );
  const scan = await collectMacScan(async (file) =>
    file.endsWith("ioreg") ? plist : "invalid json",
  );
  assert.ok(scan.warnings.length > 0);
  assert.deepEqual(scan.collection, {
    usb: true,
    displays: false,
    ports: true,
  });
});
