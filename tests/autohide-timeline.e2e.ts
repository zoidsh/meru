import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
/*
 * TEMPORARY, Windows only. Reproduces an auto-hide taskbar on the runner and
 * measures a maximize against it.
 *
 * A 2px gap at the bottom was reported on Windows with auto-hide enabled, on a
 * build carrying the renderer-signal fix. That fix catches a late correction to
 * the content area, so it can only work if there is one. Chromium subtracts
 * `kAutoHideTaskbarThicknessPx` from a maximized window's client rect for every
 * auto-hide edge (`hwnd_message_handler.cc`), deliberately, so that the window
 * is not taken for a fullscreen app — which would be a permanent reserve rather
 * than a correction, and nothing for the fix to hear.
 *
 * This says which. Reports only; asserts nothing beyond the taskbar having
 * actually changed state.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp({ "window.restrictMinimumSize": false });

const SAMPLE_WINDOW = 3_000;

/*
 * ABM_SETSTATE is 0x0A and ABS_AUTOHIDE is 1, carried in `lParam`. ABM_GETSTATE
 * is 4, read first so the runner is put back the way it was found.
 */
const TASKBAR_SCRIPT = `param([int]$State)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Taskbar {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)]
  public struct APPBARDATA {
    public uint cbSize; public IntPtr hWnd; public uint uCallbackMessage;
    public uint uEdge; public RECT rc; public IntPtr lParam;
  }
  [DllImport("shell32.dll", SetLastError = true)]
  public static extern IntPtr SHAppBarMessage(uint dwMessage, ref APPBARDATA pData);
}
"@

$data = New-Object Taskbar+APPBARDATA
$data.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($data)

$before = [Taskbar]::SHAppBarMessage(4, [ref]$data)
Write-Output "state-before $before"

$data.lParam = [IntPtr]$State
[void][Taskbar]::SHAppBarMessage(10, [ref]$data)

Start-Sleep -Milliseconds 700

$after = [Taskbar]::SHAppBarMessage(4, [ref]$data)
Write-Output "state-after $after"
`;

function runPowerShell(scriptPath: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; error: string }>((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
      { timeout: 60_000 },
      (error, stdout, stderr) => {
        resolve({ stdout, stderr, error: error ? error.message : "" });
      },
    );
  });
}

test("reports a maximize against an auto-hide taskbar", async () => {
  test.skip(process.platform !== "win32", "auto-hide taskbars are a Windows thing");

  const directory = await mkdtemp(path.join(tmpdir(), "meru-taskbar-"));
  const scriptPath = path.join(directory, "taskbar.ps1");

  await writeFile(scriptPath, TASKBAR_SCRIPT, "utf8");

  const enabled = await runPowerShell(scriptPath, ["1"]);

  console.log(`[e2e] enable: ${enabled.stdout.trim() || "(none)"} ${enabled.stderr.trim()}`);

  try {
    await meru.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setBounds({ width: 700, height: 500 });
    });

    await meru.app.evaluate(({ BrowserWindow }, sampleWindow) => {
      const [window] = BrowserWindow.getAllWindows();

      if (!window) {
        throw new Error("The app has no window");
      }

      const changes: string[] = [];

      (globalThis as unknown as { __changes: string[] }).__changes = changes;

      const started = Date.now();

      let previous = "";

      const timer = setInterval(() => {
        const bounds = window.getBounds();
        const content = window.getContentBounds();
        const view = window.contentView.children[0]?.getBounds();

        const row = `bounds ${bounds.width}x${bounds.height} content ${content.width}x${content.height} view ${view?.width}x${view?.height}`;

        if (row !== previous) {
          changes.push(`+${Date.now() - started}ms ${row}`);

          previous = row;
        }

        if (Date.now() - started > sampleWindow) {
          clearInterval(timer);
        }
      }, 10);

      window.maximize();
    }, SAMPLE_WINDOW);

    await expect
      .poll(
        async () =>
          meru.app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.isMaximized() ? "maximized" : "not",
          ),
        { timeout: SAMPLE_WINDOW + 5_000, intervals: [SAMPLE_WINDOW] },
      )
      .toBe("maximized");

    const changes = await meru.app.evaluate(
      () => (globalThis as unknown as { __changes: string[] }).__changes,
    );

    for (const change of changes) {
      console.log(`[e2e] ${change}`);
    }

    const summary = await meru.app.evaluate(({ screen, BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      const bounds = window?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
      const display = screen.getDisplayMatching(bounds);

      return {
        workArea: display.workArea,
        displaySize: display.size,
        contentBounds: window?.getContentBounds(),
        views: window?.contentView.children.map((child) => child.getBounds()),
      };
    });

    console.log(`[e2e] summary: ${JSON.stringify(summary)}`);
  } finally {
    const restored = await runPowerShell(scriptPath, ["0"]);

    console.log(`[e2e] restore: ${restored.stdout.trim() || "(none)"}`);
  }
});
