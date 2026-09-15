import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { packagePaths } from "./package-paths.mjs";
// Attach through Chromium's loopback debugging transport. This does not enable
// the disabled Node inspector or change the packaged binary's security fuses.
const { executable } = packagePaths();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const child = spawn(
  executable,
  ["--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1"],
  { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let browser;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Packaged app did not expose its test connection within 30 seconds",
          ),
        ),
      30000,
    );
    let output = "";
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once("error", fail);
    child.once("exit", (code) =>
      fail(new Error(`App exited during startup (${code})`)),
    );
    child.stderr.on("data", (chunk) => {
      output = (output + chunk).slice(-16000);
      const match = output.match(
        /DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/,
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".scan-status")).toHaveText("Scan complete", {
    timeout: 65000,
  });
  await page
    .getByRole("switch", { name: "Auto-refresh every 15 seconds" })
    .uncheck();
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(await page.evaluate(() => typeof window.process), "undefined");
  const scan = await page.evaluate(() => window.porty.scan());
  assert.equal(scan.demo, false);
  assert.ok(Array.isArray(scan.ports) && Array.isArray(scan.devices));
  assert.ok(
    !scan.warnings.some((w) => /helper could not be loaded/i.test(w)),
    "Native helper failed to load",
  );
  if (!process.env.CI)
    assert.ok(
      !scan.warnings.some((w) => /queries failed/i.test(w)),
      "Native hardware query failed",
    );
  await page
    .getByRole("textbox", { name: "Search ports" })
    .fill("porty-nonexistent-search-123");
  await expect(
    page.getByRole("heading", { name: "No matching ports" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page
    .getByRole("button", { name: "Connected devices", exact: true })
    .click();
  await page.getByRole("tab", { name: "Connection map", exact: true }).click();
  const root = page.locator(".topology-node.host");
  await root.click();
  await expect(
    page.getByRole("dialog", { name: "Device details" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(root).toBeFocused();
  await page.getByRole("button", { name: "Refresh ports" }).click();
  await expect(page.locator(".scan-status")).toHaveText("Scan complete", {
    timeout: 65000,
  });
  assert.deepEqual(errors, []);
  console.log(
    `Packaged smoke checks passed: real scan (${scan.ports.length} host ports, ${scan.devices.length} devices), isolated renderer, search, node view, drawer, Escape/focus, refresh.`,
  );
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
