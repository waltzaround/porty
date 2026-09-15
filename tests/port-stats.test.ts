import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConnectedDevice, Connector, Port } from "../shared/types";
import { detected } from "../shared/profiles";
import { demoScan } from "../shared/demo";
import {
  portCapabilities,
  portSections,
  portStatLabels,
  portStats,
} from "../shared/port-stats";
import { applyDisplayAudioStats } from "../electron/collectors/mac-media";

const videoPort = (connector: Connector): Port => ({
  ...demoScan().ports[0],
  connector,
});

test("dedicated display connectors show current video and audio without data or charging stats", () => {
  for (const connector of [
    "HDMI",
    "DisplayPort",
    "Display (unclassified)",
  ] as const) {
    const port = videoPort(connector);
    port.connection!.power = [
      detected("Current power input", "90 W", "USB-C upstream input"),
    ];
    assert.deepEqual(
      portStats(port).map((s) => s.label),
      ["Current resolution", "Current refresh rate", "Audio output"],
    );
    assert.deepEqual(
      portStats(port).map((s) => s.metric.value),
      ["5120 × 2880", "60 Hz", "48 kHz · 2 ch"],
    );
    assert.equal(portSections(connector).power, false);
    assert.equal(portSections(connector).data, false);
    assert.equal(portSections(connector).dataTab, "Display");
    assert.ok(
      portCapabilities(port).every(
        (c) => !/power|charging|data transfer/i.test(c.label),
      ),
    );
    port.status = "available";
    assert.deepEqual(
      portStats(port).map((s) => s.metric.value),
      ["—", "—", "—"],
    );
  }
});

test("MagSafe shows measured input and the selected charging contract as distinct values", () => {
  const port = demoScan().ports.find((p) => p.connector === "MagSafe")!;
  assert.deepEqual(
    portStats(port).map((s) => s.metric.value),
    ["54.2 W", "140 W", "28 V", "5 A"],
  );
  assert.match(portStats(port)[3].metric.detail, /not measured/);
  assert.equal(portSections("MagSafe").data, false);
  assert.equal(portSections("MagSafe").display, false);
  port.connection!.active = false;
  assert.ok(portStats(port).every((s) => !s.metric.reported));
});

test("USB-A keeps data and accessory power, without native display or charging input fields", () => {
  const port = { ...demoScan().ports[1], connector: "USB-A" as const };
  port.connection!.power = [
    detected("Current power output", "2.5 W", "Measured accessory output"),
  ];
  assert.deepEqual(portStatLabels("USB-A"), ["Current data", "Current power"]);
  assert.deepEqual(
    portStats(port).map((s) => s.metric.value),
    ["10 Gb/s", "2.5 W"],
  );
  assert.equal(portStats(port)[1].metric.note, "Output");
  assert.equal(portSections("USB-A").display, false);
  assert.equal(portSections("USB-A").dataTab, "Data");
  assert.ok(
    portCapabilities(port).every(
      (c) => !/display|video|charging input/i.test(c.label),
    ),
  );
  assert.equal(portSections("USB-C").power, true);
  assert.equal(portSections("USB-C").display, true);
});

test("Ethernet USB adapter speed never becomes a network link speed", () => {
  const port: Port = {
    ...demoScan().ports[1],
    connector: "Ethernet",
    status: "unknown",
  };
  assert.deepEqual(
    portStats(port).map((s) => s.metric.value),
    ["Not reported", "10 Gb/s", "Not reported"],
  );
  port.currentStats = [
    detected("Network link", "1 Gb/s", "Network interface link"),
    detected("Duplex", "Full", "Network interface duplex"),
  ];
  assert.deepEqual(
    portStats(port).map((s) => s.metric.value),
    ["1 Gb/s", "10 Gb/s", "Full"],
  );
  assert.equal(portSections("Ethernet").power, false);
  assert.equal(portSections("Ethernet").display, false);
  assert.equal(portSections("Ethernet").dataTab, "Network");
});

test("display audio matches a unique display endpoint and excludes USB lookalikes", () => {
  const monitors: ConnectedDevice[] = [
    { name: "DELL U2721DE", kind: "display", detail: "2560 × 1440" },
  ];
  applyDisplayAudioStats(monitors, [
    {
      _items: [
        {
          _name: "DELL U2721DE",
          coreaudio_device_transport: "coreaudio_device_type_displayport",
          coreaudio_device_output: 2,
          coreaudio_device_srate: 48000,
          coreaudio_default_audio_output_device: "spaudio_yes",
        },
        {
          _name: "DELL U2721DE",
          coreaudio_device_transport: "coreaudio_device_type_usb",
          coreaudio_device_output: 8,
          coreaudio_device_srate: 96000,
        },
      ],
    },
  ]);
  assert.deepEqual(monitors[0].audioOutput, {
    sampleRateHz: 48000,
    channels: 2,
    isDefault: true,
  });
  const port = { ...videoPort("DisplayPort"), devices: monitors };
  assert.equal(portStats(port)[2].metric.note, "Default output");
});

test("ambiguous or missing display audio does not invent a current format", () => {
  const monitors: ConnectedDevice[] = [
    { name: "Same monitor", kind: "display", detail: "" },
    { name: "Same monitor", kind: "display", detail: "" },
  ];
  applyDisplayAudioStats(monitors, [
    {
      _items: [
        {
          _name: "Same monitor",
          coreaudio_device_transport: "coreaudio_device_type_hdmi",
          coreaudio_device_output: 2,
          coreaudio_device_srate: 48000,
        },
      ],
    },
  ]);
  assert.ok(monitors.every((d) => !d.audioOutput));
  const port = { ...videoPort("HDMI"), devices: monitors };
  assert.equal(portStats(port)[2].metric.value, "Not reported");
  const missing: ConnectedDevice[] = [
    { name: "No rate", kind: "display", detail: "" },
  ];
  applyDisplayAudioStats(missing, [
    {
      _items: [
        {
          _name: "No rate",
          coreaudio_device_transport: "coreaudio_device_type_hdmi",
          coreaudio_device_output: 2,
        },
      ],
    },
  ]);
  assert.deepEqual(missing[0].audioOutput, { channels: 2 });
});
