import { _electron as electron, expect } from "@playwright/test";
import electronPath from "electron";
import assert from "node:assert/strict";

const app = await electron.launch({
  executablePath: electronPath,
  args: ["."],
});
try {
  const page = await app.firstWindow();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".scan-status")).toHaveText("Scan complete", {
    timeout: 65000,
  });
  await page.getByRole("switch").uncheck();
  await page
    .getByRole("button", { name: "Connected devices", exact: true })
    .click();
  for (const [width, height] of [
    [1440, 900],
    [960, 620],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setContentSize(...size),
      [width, height],
    );
    await expect.poll(() => page.evaluate(() => innerHeight)).toBe(height);
    const shell = await page.locator(".topology-shell").boundingBox();
    const footer = await page.locator(".main-shell > footer").boundingBox();
    assert.ok(
      Math.abs(footer.y - shell.y - shell.height - 24) < 2,
      "Map fills available height",
    );
    assert.equal(
      await page
        .locator("main")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
      false,
    );
    const root = page.locator(".topology-node.host");
    const boundsBefore = await page.locator(".topology-scroll").boundingBox();
    await root.click();
    const drawer = page.getByRole("dialog", { name: "Device details" });
    await expect(drawer).toBeVisible();
    assert.equal((await drawer.boundingBox()).height, height);
    assert.deepEqual(
      await page.locator(".topology-scroll").boundingBox(),
      boundsBefore,
    );
    await page.keyboard.press("Escape");
    await expect(root).toBeFocused();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const zoomed = await page.locator(".zoom-value").textContent();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    assert.notEqual(await page.locator(".zoom-value").textContent(), zoomed);
    await page.getByRole("button", { name: "Fit view", exact: true }).click();
  }
  const hub = page
    .locator(".topology-node.hub")
    .filter({ hasText: "USB2.0 Hub" })
    .first();
  await hub.click();
  await page.getByRole("button", { name: "Focus on this branch" }).click();
  await expect(
    page.getByRole("button", { name: "All connections", exact: true }),
  ).toBeVisible();
  assert.equal(await page.locator(".topology-node.host").count(), 0);
  await page
    .getByRole("button", { name: "All connections", exact: true })
    .click();
  await expect(page.locator(".topology-node.host")).toBeVisible();
  const link = page.getByRole("button", { name: /^Cable:/ }).first();
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Cable details" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(link).toBeFocused();
  await page.getByRole("textbox", { name: "Search ports" }).fill("C922");
  await expect(
    page.getByRole("button", {
      name: "Inspect C922 Pro Stream Webcam",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await page.locator(".inventory-device").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.mouse.click(20, 200);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: "List", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Connection map" })).toBeFocused();
  assert.deepEqual(errors, []);
  console.log(
    "Passed: responsive map, zoom/fit, branch focus, search with ancestry, device/cable drawers, keyboard tabs, dismissal and focus restoration.",
  );
} finally {
  await app.close();
}
