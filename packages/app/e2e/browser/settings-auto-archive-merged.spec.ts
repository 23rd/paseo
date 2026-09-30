import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";
import { openHostSection, openSettingsHost } from "../support/helpers/settings";

// Reproduction for https://github.com/getpaseo/paseo/issues/5769: when the host rejects
// the change, the switch goes back to off and the app says nothing about why.
test.describe("Archive merged PR workspaces setting", () => {
  test("a rejected change tells the user why the switch went back off", async ({ page }) => {
    const serverId = getServerId();
    await gotoAppShell(page);
    await openSettings(page);
    await openSettingsHost(page, serverId);
    await openHostSection(page, serverId, "workspaces");
    const toggle = archiveMergedSwitch(page);
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await withUnreadableDaemonConfig(async () => {
      await toggle.click();

      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(page.getByText("Unable to update workspaces")).toBeVisible();
    });
  });
});

function archiveMergedSwitch(page: Page) {
  return page.getByRole("switch", { name: "Archive merged PR workspaces" });
}

async function withUnreadableDaemonConfig(run: () => Promise<void>): Promise<void> {
  const configPath = path.join(process.env.E2E_PASEO_HOME!, "config.json");
  const original = await readFile(configPath, "utf8");
  await writeFile(configPath, "{ not json");
  try {
    await run();
  } finally {
    await writeFile(configPath, original);
  }
}
