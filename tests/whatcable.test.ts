import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readCable,
  readPowerSources,
  parsePowerOption,
  vdoWord,
  readConnectionDiagnostics,
} from "../electron/collectors/whatcable";
const word = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const endpoint = (header: number, cable: number) => ({
  IOObjectClass: "IOPortTransportComponentCCUSBPDSOPp",
  Metadata: { VDOs: [word(header), word(0), word(0), word(cable)] },
});
const value = (caps: ReturnType<typeof readCable>, label: string) =>
  caps.find((c) => c.label === label);

test("WhatCable power parser keeps advertised profiles separate and marks only the selected contract", () => {
  const option = (v: number, a: number) => ({
    "Voltage (mV)": v,
    "Max Current (mA)": a,
    Class: "IOPortFeaturePowerSourceOptionFixed",
  });
  const profiles = readPowerSources([
    {
      PowerSourceName: "USB-PD",
      PowerSourceOptions: [
        option(20000, 4700),
        option(5000, 3000),
        option(15000, 3000),
        option(9000, 3000),
      ],
      WinningPowerSourceOption: option(20000, 4700),
    },
  ])[0].profiles;
  assert.deepEqual(
    profiles.map((p) => p.watts),
    [15, 27, 45, 94],
  );
  assert.deepEqual(
    profiles.filter((p) => p.selected).map((p) => [p.volts, p.amps]),
    [[20, 4.7]],
  );
  assert.equal(parsePowerOption({ "Voltage (mV)": 0 }), undefined);
  assert.equal(
    parsePowerOption({ ...option(5000, 3000), Class: null })?.supply,
    "non-fixed",
  );
  assert.equal(
    parsePowerOption({ ...option(5000, 3000), "Max Power (mW)": 14000 })?.watts,
    14,
  );
});
test("50 V / 5 A e-marker becomes at most 240 W, not 250 W", () => {
  const caps = readCable(
    {},
    [endpoint(3 << 27, (2 << 5) | (3 << 9) | (1 << 17) | (2 << 18) | 4)],
    false,
  );
  assert.equal(value(caps, "Cable power rating")?.value, "Up to 240 W");
  assert.equal(value(caps, "Cable speed rating")?.value, "80 Gb/s");
  assert.equal(value(caps, "Cable construction")?.value, "Passive");
});
test("controller active flag promotes a passive self-report", () => {
  const caps = readCable(
    { ActiveCable: true },
    [endpoint(3 << 27, (2 << 5) | 3)],
    true,
  );
  assert.equal(value(caps, "Cable construction")?.value, "Active");
  assert.equal(value(caps, "Cable speed rating")?.value, "20 / 40 Gb/s");
});
test("empty e-marker endpoint is present but unread even above 3 A", () => {
  const caps = readCable(
    {},
    [{ IOObjectClass: "IOPortTransportComponentCCUSBPDSOPp", Metadata: {} }],
    true,
  );
  assert.equal(value(caps, "E-marker")?.value, "Present · identity unread");
  assert.match(value(caps, "E-marker")!.detail, /Reconnecting/);
  assert.equal(value(caps, "Cable power rating")?.evidence, "unknown");
});
test("populated far-end identity wins over empty near-end; partner identities are not cable ratings", () => {
  const far = {
    ...endpoint(3 << 27, (1 << 5) | 2),
    IOObjectClass: "IOPortTransportComponentCCUSBPDSOPpp",
  };
  const caps = readCable(
    {},
    [{ IOObjectClass: "IOPortTransportComponentCCUSBPDSOPp" }, far],
    false,
  );
  assert.equal(value(caps, "Cable power rating")?.value, "Up to 60 W");
  const partner = readCable({}, [{ ...far, ComponentName: "SOP" }], false);
  assert.equal(value(partner, "Cable power rating")?.evidence, "unknown");
});
test("VCONN powered devices, reserved encodings and malformed VDOs cannot invent cable ratings", () => {
  assert.equal(
    value(readCable({}, [endpoint(6 << 27, 64)], false), "Cable power rating")
      ?.evidence,
    "unknown",
  );
  const reserved = readCable({}, [endpoint(3 << 27, (3 << 5) | 7)], false);
  assert.equal(value(reserved, "Cable speed rating")?.evidence, "unknown");
  assert.equal(value(reserved, "Cable power rating")?.evidence, "unknown");
  const broken = endpoint(3 << 27, 64);
  broken.Metadata.VDOs[0] = Buffer.alloc(1);
  assert.equal(
    value(readCable({}, [broken], false), "Cable power rating")?.evidence,
    "unknown",
  );
  assert.equal(vdoWord(Buffer.from([0x78, 0x56, 0x34, 0x12])), 0x12345678);
});
test("raw controller flags and supported transports are distinct from active transports", () => {
  const diagnostics = readConnectionDiagnostics({
    ConnectionActive: true,
    ActiveCable: false,
    IOAccessoryUSBActive: true,
    TransportsSupported: ["USB3", "DisplayPort"],
    TransportsActive: ["CC"],
  });
  assert.equal(
    diagnostics.find((c) => c.label === "Active cable electronics")?.value,
    "No",
  );
  assert.equal(
    diagnostics.find((c) => c.label === "Active transports")?.value,
    "CC",
  );
  assert.equal(
    diagnostics.find((c) => c.label === "Supported transports")?.value,
    "USB3 · DisplayPort",
  );
});
