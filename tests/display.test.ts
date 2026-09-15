import { test } from "node:test";
import assert from "node:assert/strict";
import { getMacProfile } from "../shared/profiles";
import {
  defaultDisplaySupport,
  displayLimits,
  formatMode,
  getDisplaySupport,
} from "../shared/display";
import { parseMacScan } from "../electron/collectors/macos";
import { parseWindowsScan } from "../electron/collectors/windows";

test("every profiled USB-C and HDMI port keeps resolution and refresh paired", () => {
  for (const model of ["Mac16,5", "Mac16,6", "Mac16,7", "Mac16,8"]) {
    const ports = getMacProfile(model, "Apple M4 Max")!.ports;
    const video = ports.filter(
      (p) => p.connector === "USB-C" || p.connector === "HDMI",
    );
    assert.equal(video.length, 4);
    for (const port of video) {
      const display = getDisplaySupport(port);
      assert.equal(display.status, "supported");
      const limits = displayLimits(display);
      assert.equal(formatMode(limits.resolution!), "8K at 60 Hz");
      assert.equal(formatMode(limits.refresh!), "4K at 240 Hz");
      if (display.status === "supported") {
        assert.equal(display.evidence, "specification");
        assert.equal(display.source, "https://support.apple.com/en-us/101571");
        assert.ok(
          !display.modes.some(
            (m) => m.resolution === "8K" && m.refreshHz === 240,
          ),
        );
      }
    }
  }
});

test("display budget follows the detected chip and remains shared across ports", () => {
  for (const [chip, expected] of [
    ["Apple M4 Max", 4],
    ["Apple M4 Pro", 2],
  ] as const) {
    const scan = parseMacScan(
      { SPHardwareDataType: [{ machine_model: "Mac16,5", chip_type: chip }] },
      [],
      "macOS",
    );
    const display = getDisplaySupport(scan.ports[0]);
    assert.equal(display.status, "supported");
    if (display.status === "supported") {
      assert.equal(
        Math.max(...display.configurations.map((c) => c.displays)),
        expected,
      );
      assert.match(display.note, /shared across the Mac/);
      assert.match(display.configurations.at(-1)!.detail, /4K 144 Hz/);
    }
  }
  const missingChip = getDisplaySupport(getMacProfile("Mac16,5")!.ports[0]);
  if (missingChip.status === "supported")
    assert.deepEqual(missingChip.configurations, []);
});

test("unknown model display output stays unknown even with a high-bandwidth controller and attached screen", () => {
  const scan = parseMacScan(
    {
      SPHardwareDataType: [
        { machine_model: "Mac99,1", chip_type: "Future chip" },
      ],
      SPThunderboltDataType: [
        {
          _name: "thunderboltusb4_bus_0",
          receptacle_1: {
            receptacle_id_key: 1,
            current_speed_key: "Up to 120 Gb/s",
          },
        },
      ],
      SPDisplaysDataType: [
        {
          spdisplays_ndrvs: [
            {
              _name: "8K screen",
              _spdisplays_resolution: "7680 x 4320 @ 60 Hz",
            },
          ],
        },
      ],
    },
    [{ UsbCPortNumber: 1 }],
    "macOS",
  );
  assert.equal(getDisplaySupport(scan.ports[0]).status, "unknown");
  assert.deepEqual(displayLimits(getDisplaySupport(scan.ports[0])), {});
  assert.equal(scan.devices[0].name, "8K screen");
});

test("Windows video connector names alone do not imply resolution or refresh limits", () => {
  const scan = parseWindowsScan({
    connectors: [
      { ExternalReferenceDesignator: "HDMI 1" },
      { ExternalReferenceDesignator: "DisplayPort" },
    ],
  });
  assert.equal(scan.ports.length, 2);
  for (const port of scan.ports) {
    assert.equal(port.display?.status, "unknown");
    assert.deepEqual(displayLimits(getDisplaySupport(port)), {});
  }
});

test("non-video connectors have no native display modes; unidentified USB remains unknown", () => {
  for (const type of [
    "USB-A",
    "Audio",
    "SD card",
    "MagSafe",
    "Ethernet",
  ] as const) {
    const support = defaultDisplaySupport(type);
    assert.equal(support.status, "unsupported");
    assert.deepEqual(displayLimits(support), {});
  }
  assert.equal(defaultDisplaySupport("USB-C").status, "unknown");
  assert.equal(defaultDisplaySupport("USB (unclassified)").status, "unknown");
});

test("display limit selection uses pixel area and preserves the corresponding rate without mutating modes", () => {
  const support = getDisplaySupport(getMacProfile("Mac16,5")!.ports[0]);
  if (support.status !== "supported") throw new Error("Expected display modes");
  support.modes.reverse();
  const before = structuredClone(support.modes);
  const limits = displayLimits(support);
  assert.equal(limits.resolution?.width, 7680);
  assert.equal(limits.refresh?.refreshHz, 240);
  assert.deepEqual(support.modes, before);
});
