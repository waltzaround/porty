import { expect, test } from "@playwright/test";
import { loadEnv } from "vite";

const version = loadEnv("production", process.cwd(), "").VITE_RELEASE_VERSION;
const builds = [
  { label: "Apple Silicon", file: `Porty-${version}-mac-arm64.dmg` },
  { label: "Intel", file: `Porty-${version}-mac-x64.dmg` },
  { label: "64-bit PC", file: `Porty-${version}-windows-x64-setup.exe` },
];

for (const javaScriptEnabled of [true, false]) {
  test(`published architecture downloads work with JavaScript ${javaScriptEnabled ? "enabled" : "disabled"}`, async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled,
      baseURL: "http://127.0.0.1:4180",
      viewport: { width: 390, height: 844 },
    });
    try {
      // Exercise the destination without downloading full installers in the test.
      await context.route("https://github.com/waltzaround/porty/releases/download/**", async (route) => {
        const file = new URL(route.request().url()).pathname.split("/").pop();
        await route.fulfill({
          contentType: "application/octet-stream",
          headers: { "Content-Disposition": `attachment; filename="${file}"` },
          body: "installer fixture",
        });
      });
      const page = await context.newPage();
      await page.goto("/");
      await page.getByRole("link", { name: "Get Porty", exact: true }).first().click();
      if (!javaScriptEnabled) await page.locator(".download-options summary").click();
      const chooser = javaScriptEnabled ? page.getByRole("dialog") : page.locator(".download-options");
      await expect(chooser.locator(".release-option")).toHaveCount(3);
      await expect(chooser).toContainText("Requires macOS 12 or later");
      for (const build of builds) {
        const row = chooser.locator(".release-option").filter({ hasText: build.label });
        await expect(row).toContainText("Unsigned preview");
        const link = row.getByRole("link", { name: "Download" });
        const url = `https://github.com/waltzaround/porty/releases/download/v${version}/${build.file}`;
        await expect(link).toHaveAttribute("href", url);
        const downloaded = page.waitForEvent("download");
        await link.click();
        const download = await downloaded;
        expect(download.url()).toBe(url);
        expect(download.suggestedFilename()).toBe(build.file);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    } finally {
      await context.close();
    }
  });
}
