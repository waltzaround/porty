import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

// Capture the actual built renderer and live hardware through its normal UI.
// No fixture injection, text replacement, or synthetic operating-system chrome.
const app = await electron.launch({
  executablePath: electronPath,
  args: ["."],
});
try {
  await app.evaluate(({ BrowserWindow, nativeTheme }) => {
    nativeTheme.themeSource = "dark";
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900);
  });
  const page = await app.firstWindow();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".scan-status")).toHaveText("Scan complete", {
    timeout: 65000,
  });
  await page.getByRole("switch").uncheck();
  const scan = await page.evaluate(() => window.porty.scan());
  assert.equal(scan.demo, false);
  const output = ".artifacts/product-captures";
  await mkdir(output, { recursive: true });
  await page
    .getByRole("button", { name: "Connected devices", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Connection map" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".topology-node")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await page.screenshot({ path: `${output}/connections.png` });
  console.log(
    "Visible hubs:",
    await page.locator(".topology-node.hub strong").allTextContents(),
  );
  const hub = page
    .locator(".topology-node.hub")
    .filter({ hasText: "USB2.0 Hub" })
    .first();
  await (
    (await hub.count()) ? hub : page.locator(".topology-node.hub").first()
  ).click();
  await expect(page.getByRole("dialog", { name: "Hub details" })).toBeVisible();
  await page.getByRole("button", { name: "Focus on this branch" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await page.screenshot({ path: `${output}/branch.png` });
  await page
    .locator(".topology-shell")
    .screenshot({ path: `${output}/branch-map.png` });
  const branchRoot = page
    .getByRole("button", { name: "Inspect USB2.0 Hub", exact: true })
    .first();
  await (
    (await branchRoot.count())
      ? branchRoot
      : page.locator(".topology-node.hub").first()
  ).click();
  await expect(page.getByRole("dialog", { name: "Hub details" })).toBeVisible();
  await page.screenshot({ path: `${output}/details.png` });
  await page
    .getByRole("dialog", { name: "Hub details" })
    .screenshot({ path: `${output}/hub-drawer.png` });
  await page.locator(".topology-inspector dl").first().screenshot({ path: `${output}/hub-current.png` });
  await page.locator(".hub-path-list").screenshot({ path: `${output}/hub-paths.png` });
  await page.keyboard.press("Escape");
  await expect(
    (await branchRoot.count())
      ? branchRoot
      : page.locator(".topology-node.hub").first(),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "All connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "All ports", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "Connected", exact: true }).click();
  await page.screenshot({ path: `${output}/ports.png` });
  const display = page.getByRole("button", { name: /^Inspect .*DELL/ }).first();
  if (await display.count()) {
    await display.click();
    await page.screenshot({ path: `${output}/display.png` });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/capture.json`,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        platform: process.platform,
        width: 1440,
        height: 900,
        source:
          "Built Electron app, live hardware scan; no fixture or DOM changes",
        demo: scan.demo,
      },
      null,
      2,
    ),
  );
  await mkdir("landing/public/screenshots", { recursive: true });
  for (const name of ["branch", "details", "ports", "branch-map", "hub-drawer", "hub-current", "hub-paths"])
    await copyFile(
      `${output}/${name}.png`,
      `landing/public/screenshots/${name}.png`,
    );
  console.log(
    "Captured real app: connections, branch, details, ports. No renderer exceptions.",
  );
} finally {
  await app.close();
}
