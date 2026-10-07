/**
 * A script the fixture's account-session copies declare in the page's MAIN
 * world, the way Bitwarden's passkey override is: it leaves a global the page's
 * own scripts can read, which no isolated world could, and says whether any
 * extension API reached it — none should, the derive leaving MAIN-world
 * entries unshimmed.
 */
const pageGlobals = globalThis as unknown as {
  chrome?: { runtime?: { id?: string } };
  __meruFixtureDeclaredMain?: { runtimeId: string | null };
};

pageGlobals.__meruFixtureDeclaredMain = { runtimeId: pageGlobals.chrome?.runtime?.id ?? null };
