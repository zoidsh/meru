import { describe, expect, test } from "bun:test";
import { getWorkspaceAppFromUrl } from "./google";

describe("getWorkspaceAppFromUrl", () => {
  test("resolves an app from its own subdomain", () => {
    expect(getWorkspaceAppFromUrl("https://admin.google.com/ac/home")).toBe("admin");
    expect(getWorkspaceAppFromUrl("https://calendar.google.com/calendar/u/0/r")).toBe("calendar");
    expect(getWorkspaceAppFromUrl("https://drive.google.com/drive/u/0/my-drive")).toBe("drive");
    expect(getWorkspaceAppFromUrl("https://keep.google.com/u/0/")).toBe("keep");
  });

  test("resolves the docs.google.com apps from their path", () => {
    expect(getWorkspaceAppFromUrl("https://docs.google.com/document/d/abc123/edit")).toBe("docs");
    expect(getWorkspaceAppFromUrl("https://docs.google.com/spreadsheets/d/abc123/edit")).toBe(
      "sheets",
    );
    expect(getWorkspaceAppFromUrl("https://docs.google.com/presentation/d/abc123/edit")).toBe(
      "slides",
    );
    expect(getWorkspaceAppFromUrl("https://docs.google.com/forms/d/abc123/edit")).toBe("forms");
  });

  test("resolves the docs.google.com apps behind an account or domain prefix", () => {
    expect(getWorkspaceAppFromUrl("https://docs.google.com/spreadsheets/u/1/d/abc123/edit")).toBe(
      "sheets",
    );
    expect(getWorkspaceAppFromUrl("https://docs.google.com/u/1/spreadsheets/d/abc123/edit")).toBe(
      "sheets",
    );
    expect(
      getWorkspaceAppFromUrl("https://docs.google.com/a/example.com/presentation/d/abc123/edit"),
    ).toBe("slides");
  });

  test("resolves the docs.google.com app home pages", () => {
    expect(getWorkspaceAppFromUrl("https://docs.google.com/spreadsheets/u/0/")).toBe("sheets");
    expect(getWorkspaceAppFromUrl("https://docs.google.com/spreadsheets")).toBe("sheets");
    expect(getWorkspaceAppFromUrl("https://docs.google.com/spreadsheets?usp=sheets_home")).toBe(
      "sheets",
    );
  });

  test("falls back to Docs for the rest of docs.google.com", () => {
    expect(getWorkspaceAppFromUrl("https://docs.google.com/")).toBe("docs");
    expect(getWorkspaceAppFromUrl("https://docs.google.com/drawings/d/abc123/edit")).toBe("docs");
  });

  test("resolves an app from its usercontent subdomain", () => {
    expect(getWorkspaceAppFromUrl("https://drive.usercontent.google.com/download?id=abc123")).toBe(
      "drive",
    );
  });

  test("resolves Gemini Notebook from both its current and its former subdomain", () => {
    expect(getWorkspaceAppFromUrl("https://notebook.google.com/notebook/abc123")).toBe("notebook");
    expect(getWorkspaceAppFromUrl("https://notebooklm.google.com/notebook/abc123")).toBe(
      "notebook",
    );
  });

  test("returns undefined for unsupported urls", () => {
    expect(getWorkspaceAppFromUrl("https://example.com/spreadsheets/d/abc123")).toBeUndefined();
    expect(getWorkspaceAppFromUrl("https://myaccount.google.com/")).toBe("myaccount");
    expect(getWorkspaceAppFromUrl("https://photos.google.com/")).toBeUndefined();
  });
});
