import type { ShellPort } from "../../core/ports.ts";

export class FakeShell implements ShellPort {
  /** Every address opened in the default browser, in order. */
  readonly opened: string[] = [];

  readonly openExternal = (url: string) => {
    this.opened.push(url);
  };
}
