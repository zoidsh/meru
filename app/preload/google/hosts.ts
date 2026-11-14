/** Whether the page is a Google Docs editor, which needs the clipboard flags an extension would set. */
export const isDocsHost = (hostname: string): boolean =>
  hostname === "docs.google.com";

/** Whether the page is a Meet call, whose microphone and camera main can turn on and off. */
export const isMeetHost = (hostname: string): boolean =>
  hostname === "meet.google.com";
