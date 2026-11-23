import { describe, expect, it } from "vitest";

import type { BrowsingDataKinds } from "#core/browsing-data.ts";

import { createDeleteBrowsingData } from "./browsing-data.ts";

/** Each step asked of the session, the views and the mail check, in order. */
const setup = (fails = false) => {
  const steps: string[] = [];
  const deleteData = createDeleteBrowsingData({
    sessions: {
      clearData: (partition, dataTypes) => {
        steps.push(`clear ${partition} ${dataTypes.join(",")}`);

        return fails
          ? Promise.reject(new Error("the session refused"))
          : Promise.resolve();
      },
    },
    views: {
      sleepAllButGmail: (profileId) => {
        steps.push(`sleep all but Gmail of ${profileId}`);
      },
      reloadProfile: (profileId) => {
        steps.push(`reload ${profileId}`);
      },
    },
    mail: {
      poke: (profileId) => {
        steps.push(`poll ${profileId}`);
      },
    },
  });

  return { steps, deleteData };
};

const run = async (kinds: BrowsingDataKinds) => {
  const { steps, deleteData } = setup();

  await deleteData("work", kinds);

  return steps;
};

describe(createDeleteBrowsingData, () => {
  it("clears the cache alone with the pages left open, then reloads them", async () => {
    await expect(run({ cookies: false, cache: true })).resolves.toStrictEqual([
      "clear persist:work cache",
      "reload work",
    ]);
  });

  it("closes the pages but Gmail's before clearing cookies and site data, then reloads them and polls the mail at once", async () => {
    await expect(run({ cookies: true, cache: true })).resolves.toStrictEqual([
      "sleep all but Gmail of work",
      "clear persist:work cache,cookies,localStorage,indexedDB,serviceWorkers,fileSystems,backgroundFetch",
      "reload work",
      "poll work",
    ]);
  });

  it("does nothing with neither asked for", async () => {
    await expect(run({ cookies: false, cache: false })).resolves.toStrictEqual(
      []
    );
  });

  it("rejects when the session could not clear, its pages reloaded and its mail polled, since cookies may have gone", async () => {
    const { steps, deleteData } = setup(true);

    await expect(
      deleteData("work", { cookies: true, cache: false })
    ).rejects.toThrow("the session refused");
    expect(steps).toStrictEqual([
      "sleep all but Gmail of work",
      "clear persist:work cookies,localStorage,indexedDB,serviceWorkers,fileSystems,backgroundFetch",
      "reload work",
      "poll work",
    ]);
  });

  it("polls nothing when clearing the cache alone fails", async () => {
    const { steps, deleteData } = setup(true);

    await expect(
      deleteData("work", { cookies: false, cache: true })
    ).rejects.toThrow("the session refused");
    expect(steps).toStrictEqual(["clear persist:work cache", "reload work"]);
  });
});
