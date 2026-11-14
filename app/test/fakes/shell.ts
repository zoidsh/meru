import type { ShellPort } from "../../core/ports.ts";

export class FakeShell implements ShellPort {
  readonly opened: string[] = [];
  readonly files: string[] = [];
  readonly revealed: string[] = [];

  readonly openExternal = async (url: string) => {
    this.opened.push(url);
    await Promise.resolve();
  };

  readonly openPath = async (path: string) => {
    this.files.push(path);
    await Promise.resolve();
  };

  readonly showItemInFolder = (path: string) => {
    this.revealed.push(path);
  };
}
