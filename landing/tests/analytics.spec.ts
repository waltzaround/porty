import { test, expect } from "@playwright/test";

for (const location of ["page", "dialog", "local"] as const) {
  test(`download tracking: ${location}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const googleRequests: string[] = [];
    await page.route("https://www.googletagmanager.com/**", route => {
      googleRequests.push(route.request().url());
      return route.abort(); // Test the queue without polluting production analytics.
    });
    if (location !== "local") {
      await page.route("https://porty.walt.online/**", async route => {
        const url = new URL(route.request().url());
        const response = await page.request.get(`http://127.0.0.1:4180${url.pathname}${url.search}`);
        await route.fulfill({ response });
      });
    }
    await page.route("https://github.com/**/Porty-*-setup.exe", route => route.fulfill({
      contentType: "application/octet-stream", body: "test-download",
      headers: { "content-disposition": 'attachment; filename="porty-test.exe"' },
    }));
    await page.goto(location === "local" ? "/" : "https://porty.walt.online/");
    const queue = () => page.evaluate(() => Array.from((window as unknown as {dataLayer?: ArrayLike<unknown>[]}).dataLayer || [], item => Array.from(item)));
    if (location !== "local") {
      await expect.poll(queue).toContainEqual(["config", "G-68EK891W8D"]);
      await expect(page.locator('script[src="https://www.googletagmanager.com/gtag/js?id=G-68EK891W8D"]')).toHaveCount(1);
    }
    if (location === "page") await page.locator(".download-summary").click();
    else await page.getByRole("link", { name: "Get Porty", exact: true }).first().click();
    expect((await queue()).filter(item => item[0] === "event")).toHaveLength(0);
    const container = location === "page" ? page.locator(".download-options") : page.getByRole("dialog");
    const downloaded = page.waitForEvent("download");
    await container.locator('a[href$="-setup.exe"]').click();
    await (await downloaded).cancel();
    const events = (await queue()).filter(item => item[0] === "event");
    if (location === "local") {
      expect(events).toHaveLength(0);
      expect(googleRequests).toHaveLength(0);
    } else {
      expect(events).toEqual([["event", "download_click", expect.objectContaining({
        send_to: "G-68EK891W8D", download_platform: "windows",
        release_version: "1.0.3", download_location: location,
        file_name: "Porty-1.0.3-windows-x64-setup.exe", file_extension: "exe",
      })]]);
    }
    expect(errors).toEqual([]);
  });
}
