import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { HardwareNotification } from "../shared/events";

export function parseHardwareNotification(
  line: string,
): HardwareNotification | undefined {
  if (line.length > 2048) return;
  try {
    const value = JSON.parse(line);
    if (
      value.kind === "ready" &&
      typeof value.usb === "boolean" &&
      typeof value.displays === "boolean"
    )
      return { kind: "ready", usb: value.usb, displays: value.displays };
    if (value.kind === "power") return { kind: "power" };
    if (
      !["usb", "display"].includes(value.kind) ||
      !["connected", "disconnected", "changed"].includes(value.action) ||
      typeof value.id !== "string" ||
      !/^(usb|mac-display)-\d+$/.test(value.id)
    )
      return;
    return {
      kind: value.kind,
      action: value.action,
      id: value.id,
      name:
        typeof value.name === "string"
          ? value.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160)
          : undefined,
    };
  } catch {
    return;
  }
}

export function startMacMonitor(
  executable: string,
  onEvent: (event: HardwareNotification) => void,
  onFailure: () => void,
) {
  let stopped = false,
    failed = false,
    buffer = "";
  const child: ChildProcessWithoutNullStreams = spawn(executable, [], {
    stdio: "pipe",
  });
  const fail = () => {
    if (!stopped && !failed) {
      failed = true;
      onFailure();
      child.kill();
    }
  };
  const timer = setTimeout(fail, 5000);
  child.on("error", fail);
  child.on("exit", () => {
    clearTimeout(timer);
    fail();
  });
  child.stderr.resume();
  child.stdout.on("data", (chunk) => {
    if (stopped || failed) return;
    buffer += chunk.toString();
    if (buffer.length > 65536) {
      buffer = "";
      fail();
      return;
    }
    let boundary: number;
    while ((boundary = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      const event = parseHardwareNotification(line);
      if (!event) continue;
      if (event.kind === "ready") clearTimeout(timer);
      onEvent(event);
    }
  });
  return () => {
    stopped = true;
    clearTimeout(timer);
    child.kill();
  };
}
