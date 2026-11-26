import { describe, expect, it } from "vitest";

import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { supportMailto } from "#core/support.ts";

import { createContactSupport } from "./support.ts";

const STATE: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "b",
};

const setup = (signedOut: readonly string[]) => {
  const composed: [string, string][] = [];
  const opened: string[] = [];
  const contact = createContactSupport({
    state: () => STATE,
    signedOut: (profileId) => signedOut.includes(profileId),
    compose: (profileId, mailto) => {
      composed.push([profileId, mailto]);
    },
    openExternal: (url) => {
      opened.push(url);

      return Promise.resolve();
    },
    log: () => {},
  });

  return { contact, composed, opened };
};

describe(createContactSupport, () => {
  it("writes to support from the selected profile's Gmail, asking which profile of none", async () => {
    const { contact, composed, opened } = setup([]);

    await contact();

    expect(composed).toStrictEqual([["b", supportMailto("Meru Pro license")]]);
    expect(opened).toStrictEqual([]);
  });

  it("hands the link to the system's mail app while the selected profile is signed out", async () => {
    const { contact, composed, opened } = setup(["b"]);

    await contact();

    expect(composed).toStrictEqual([]);
    expect(opened).toStrictEqual([supportMailto("Meru Pro license")]);
  });
});
