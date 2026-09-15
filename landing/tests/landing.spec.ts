import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("page and download dialog meet automated accessibility checks", async ({
  page,
}) => {
  await page.goto("/");
  for (const dialogOpen of [false, true]) {
    if (dialogOpen)
      await page
        .getByRole("link", { name: "Get Porty", exact: true })
        .first()
        .click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((issue) => ({
        rule: issue.id,
        nodes: issue.nodes.map((node) => ({
          target: node.target,
          reason: node.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
});

test("real screenshots switch and enlarge with focus restored", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("tab").first()).toHaveText("Port explorer");
  await expect(page.getByRole("tab", { name: "Port explorer", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".screenshot-platform")).toHaveText("macOS · Light appearance");
  const image = page.locator('.screenshot-panel[data-state="active"] img');
  await expect(image).toHaveAttribute("src", "/screenshots/mac-ports-1180.webp");
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
  const enlarge = page.getByRole("button", {
    name: "Enlarge port explorer screenshot",
  });
  await enlarge.click();
  await expect(page.getByRole("dialog")).toContainText(
    "Mac app screenshot",
  );
  await page.keyboard.press("Escape");
  await expect(enlarge).toBeFocused();
  await page.getByRole("tab", { name: "Connection map", exact: true }).click();
  await expect(image).toHaveAttribute("src", "/screenshots/mac-hero-1440.webp");
  await expect(page.locator(".screenshot-platform")).toHaveText("macOS · Dark appearance");
  await page.getByRole("tab", { name: "Device details", exact: true }).click();
  await expect(
    page.locator('.screenshot-panel[data-state="active"] img'),
  ).toHaveAttribute("src", "/screenshots/details.png");
  expect(errors).toEqual([]);
});
test("download, privacy and FAQ work with keyboard dismissal", async ({
  page,
}) => {
  await page.goto("/");
  const downloadButton = page
    .getByRole("link", { name: "Get Porty", exact: true })
    .first();
  await downloadButton.click();
  await expect(page.getByRole("dialog")).toContainText(
    "Choose the Porty build",
  );
  const releaseOptions = page.getByRole("dialog").locator(".release-option");
  await expect(releaseOptions).toHaveCount(3);
  // A release is either a real HTTPS link or an explicit unavailable state.
  for (const row of await releaseOptions.all()) {
    const link = row.getByRole("link");
    if (await link.count())
      expect(await link.getAttribute("href")).toMatch(/^https:\/\//);
    else await expect(row).toContainText("Coming soon");
  }
  await page.keyboard.press("Escape");
  await expect(downloadButton).toBeFocused();
  await page
    .locator("summary", { hasText: "Is my hardware information private?" })
    .click();
  await expect(
    page.getByRole("region", { name: "Is my hardware information private?" }),
  ).toContainText("Hardware scans run locally");
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Google Analytics");
  await page.keyboard.press("Escape");
});

for (const width of [390, 768, 1440]) {
  test(`layout fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("heading", { name: "Get Porty", exact: true }),
    ).toBeAttached();
    await page.screenshot({
      path: `../.artifacts/landing-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    if (width === 390) {
      await page.locator(".download-options summary").click();
      await expect(page.locator(".download-options .release-option").last()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.locator(".download-options summary").click();
      await page.getByRole("button", { name: "Open menu" }).click();
      await page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "FAQ", exact: true })
        .click();
      await expect(page).toHaveURL(/#questions$/);
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).not.toBeVisible();
      await page
        .getByRole("button", { name: "Enlarge port explorer screenshot" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
}
