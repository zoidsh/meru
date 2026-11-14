import { describe, expect, it } from "vitest";

import { isDocsHost, isMeetHost } from "./hosts.ts";

describe(isDocsHost, () => {
  it("is the Docs editor's host alone", () => {
    expect(isDocsHost("docs.google.com")).toBeTruthy();
    expect(isDocsHost("docs.google.com.example.com")).toBeFalsy();
    expect(isDocsHost("drive.google.com")).toBeFalsy();
  });
});

describe(isMeetHost, () => {
  it("is Meet's host alone", () => {
    expect(isMeetHost("meet.google.com")).toBeTruthy();
    expect(isMeetHost("mail.google.com")).toBeFalsy();
  });
});
