import { describe, expect, it } from "vitest";

import { metricsOf, nameRenderers } from "./sample.ts";

const MB = 1024 * 1024;

describe(nameRenderers, () => {
  it("names a renderer by its page, a frames-only one by its frames, and a pageless one by the workers outside every page", () => {
    const names = nameRenderers({
      pages: [
        {
          pid: 10,
          processId: 1,
          url: "meru-app://shell/index.html",
          isSubframe: false,
        },
        { pid: 10, processId: 1, url: "about:blank", isSubframe: false },
        {
          pid: 11,
          processId: 2,
          url: "https://mail.google.com/mail/u/0/#inbox",
          isSubframe: false,
        },
        {
          pid: 12,
          processId: 3,
          url: "https://accounts.google.com/frame",
          isSubframe: true,
        },
      ],
      workers: [
        { processId: 2, scope: "https://mail.google.com/sw-in-page/" },
        { processId: 4, scope: "https://mail.google.com/mail/u/0/" },
      ],
      rendererPids: [10, 11, 12, 13],
    });

    expect(Object.fromEntries(names)).toStrictEqual({
      10: "shell",
      11: "Gmail",
      12: "frames accounts.google.com",
      13: "service worker Gmail",
    });
  });

  it("leaves a renderer unnamed when no worker runs outside a page", () => {
    const names = nameRenderers({
      pages: [],
      workers: [],
      rendererPids: [13],
    });

    expect(names.size).toBe(0);
  });
});

describe(metricsOf, () => {
  it("gives memory by process type, renderers by name, and the run's other figures", () => {
    const metrics = metricsOf({
      windowShownMs: 400,
      inboxUsableMs: 1200,
      idleCpuPercent: 0.5,
      sharedOnceBytes: 290 * MB,
      processes: [
        { pid: 1, type: { kind: "browser" }, footprintBytes: 50 * MB },
        { pid: 2, type: { kind: "gpu" }, footprintBytes: 40 * MB },
        { pid: 3, type: { kind: "network" }, footprintBytes: 10 * MB },
        {
          pid: 4,
          type: { kind: "renderer" },
          name: "Gmail",
          footprintBytes: 100 * MB,
        },
        {
          pid: 5,
          type: { kind: "renderer" },
          name: "Gmail",
          footprintBytes: 80 * MB,
        },
        { pid: 6, type: { kind: "renderer" }, footprintBytes: 5 * MB },
        {
          pid: 7,
          type: { kind: "utility", detail: "storage" },
          footprintBytes: 6 * MB,
        },
      ],
    });

    expect(metrics).toStrictEqual({
      "memory browser": 50,
      "memory GPU": 40,
      "memory network": 10,
      "memory renderer: Gmail": 100,
      "memory renderer: Gmail #2": 80,
      "memory renderer: unnamed": 5,
      "memory helper storage": 6,
      "memory total": 291,
      "memory total, shared once": 290,
      processes: 7,
      "idle CPU %": 0.5,
      "window shown ms": 400,
      "inbox usable ms": 1200,
    });
  });
});
