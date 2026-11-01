/*
 * The unified inbox at the window's minimum width.
 *
 * Pro with two accounts, which is what offers the unified inbox. Its messages
 * are pushed the way main pushes a changed feed, since no account here is
 * signed in to have one.
 */
import type { GmailInboxMessage } from "@meru/shared/gmail";
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useProApp } from "./lib/app";
import { readPageMisfits, setMinimumWindowWidth } from "./lib/page-fit";

const FIRST_ACCOUNT_ID = "first";

const SECOND_ACCOUNT_ID = "second";

const meru = useProApp({
  accounts: [
    seedAccount({ id: FIRST_ACCOUNT_ID, label: "First" }),
    seedAccount({ id: SECOND_ACCOUNT_ID, label: "Second", selected: false }),
  ],
});

function seedMessages(accountId: string): GmailInboxMessage[] {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${accountId}-${index}`,
    subject: `Quarterly planning notes and the follow-ups everyone agreed to take on ${index}`,
    summary: "A summary long enough to fill the row it is shown in, and then some more of it.",
    author: { name: "Alexandra Montgomery-Fitzgerald", email: "alexandra@example.com" },
    contributors: [],
    receivedAt: Date.now() - index * 60_000,
  }));
}

test("the unified inbox fits the window at its minimum width", async () => {
  const windowWidth = await setMinimumWindowWidth(meru);

  expect(await meru.runMenuCommand("Unified Inbox")).toBe(true);

  await expect(meru.renderer.getByTestId("settings-title")).toHaveText("Unified inbox");

  const findings: string[] = [];

  const check = async (where: string) => {
    for (const misfit of await readPageMisfits(meru)) {
      findings.push(`${windowWidth}px ${where}: ${misfit}`);
    }
  };

  await check("empty");

  await meru.app.evaluate(
    ({ BrowserWindow }, pushes) => {
      const window = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().includes("main.html"),
      );

      for (const [accountId, messages] of pushes) {
        window?.webContents.send("gmail.inboxChanged", accountId, messages);
      }
    },
    [FIRST_ACCOUNT_ID, SECOND_ACCOUNT_ID].map((id) => [id, seedMessages(id)] as const),
  );

  await expect(meru.renderer.getByRole("row")).toHaveCount(10);

  await check("with messages");

  expect(findings).toEqual([]);
});
