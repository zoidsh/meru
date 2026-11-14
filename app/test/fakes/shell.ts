import type { ShellPort } from "../../core/ports.ts";

export class FakeShell implements ShellPort {
  readonly opened: string[] = [];

  readonly openExternal = async (url: string) => {
    this.opened.push(url);
    await Promise.resolve();
  };
}
