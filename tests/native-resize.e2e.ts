/*
 * PROTOTYPE, Windows only. Asks whether a runner can drive the real sizing modal
 * loop — the one an edge-drag runs inside, and the only path through the resize
 * code that nothing has ever covered.
 *
 * Playwright cannot reach it. `page.mouse` goes over CDP into Blink's input
 * pipeline, below the OS, so it never produces the `WM_NCHITTEST` a native
 * resize starts from; and Meru's resize border is 8px of non-client area outside
 * the content entirely, so there is no coordinate to aim at either.
 *
 * The way round is to post the message that starts the loop rather than to
 * pretend to be a mouse: `WM_SYSCOMMAND` with `SC_SIZE` is the documented way in,
 * and it needs no interactive desktop, being a message to a window rather than
 * input to a session. Posted from the test process to the app's `HWND`, so no
 * FFI goes anywhere near the packaged app; PowerShell can P/Invoke `PostMessage`
 * without a dependency being added for it.
 *
 * The open question is whether posted arrow keys drive the loop once it is
 * running. That is what this reports.
 */
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

/** Resolves with whatever the script printed, rather than rejecting on a non-zero exit. */
function runPowerShell(scriptPath: string, hwnd: string) {
  return new Promise<{ stdout: string; stderr: string; error: string }>((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Hwnd", hwnd],
      { timeout: 60_000 },
      (error, stdout, stderr) => {
        resolve({ stdout, stderr, error: error ? error.message : "" });
      },
    );
  });
}

const meru = useApp({ "window.restrictMinimumSize": false });

/*
 * WM_SYSCOMMAND 0x0112 with SC_SIZE 0xF000 enters the loop in keyboard mode.
 * The first arrow picks the border to size and the rest move it, so WM_KEYDOWN
 * 0x0100 with VK_RIGHT 0x27 widens the window one step at a time. VK_RETURN
 * 0x0D commits; VK_ESCAPE 0x1B is posted after it as the way out of a loop that
 * did not take the commit, since a loop left running hangs the main process and
 * with it every later test.
 */
const RESIZE_SCRIPT = `param([string]$Hwnd)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeResize {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
"@

$handle = [IntPtr][long]$Hwnd

[void][NativeResize]::PostMessage($handle, 0x0112, [IntPtr]0xF000, [IntPtr]0)
Start-Sleep -Milliseconds 500

for ($i = 0; $i -lt 60; $i++) {
  [void][NativeResize]::PostMessage($handle, 0x0100, [IntPtr]0x27, [IntPtr]0)
  Start-Sleep -Milliseconds 15
}

[void][NativeResize]::PostMessage($handle, 0x0100, [IntPtr]0x0D, [IntPtr]0)
Start-Sleep -Milliseconds 300
[void][NativeResize]::PostMessage($handle, 0x0100, [IntPtr]0x1B, [IntPtr]0)
`;

function readLayout() {
  return meru.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    return {
      bounds: window.getBounds(),
      contentBounds: window.getContentBounds(),
      views: window.contentView.children
        .filter((child) => child.getVisible())
        .map((child) => child.getBounds()),
    };
  });
}

test("reports whether a posted SC_SIZE drives the sizing modal loop", async () => {
  test.skip(process.platform !== "win32", "the sizing modal loop is a Windows message loop");

  /*
   * `will-resize` is the tell. Electron emits it from `WM_SIZING`, which only
   * arrives inside the modal loop — a `setBounds` call never produces one. If it
   * fires here, the runner drove a real interactive resize.
   */
  const handle = await meru.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    const events: unknown[] = [];

    (globalThis as unknown as { __events: unknown[] }).__events = events;

    // Registered one at a time: `on` is overloaded per event name, so a union
    // of them satisfies none of the overloads.
    const record = (name: string) => () => {
      events.push({
        name,
        bounds: window.getBounds(),
        contentBounds: window.getContentBounds(),
        view: window.contentView.children[0]?.getBounds(),
      });
    };

    window.on("will-resize", record("will-resize"));
    window.on("resize", record("resize"));
    window.on("resized", record("resized"));

    window.setBounds({ width: 700, height: 500 });

    const nativeHandle = window.getNativeWindowHandle();

    // Returned as a string: an HWND is pointer-sized, and a BigInt does not
    // survive the trip back out of the main process.
    return nativeHandle.length >= 8
      ? nativeHandle.readBigInt64LE().toString()
      : String(nativeHandle.readUInt32LE());
  });

  console.log(`[e2e] hwnd: ${handle}`);
  console.log(`[e2e] before: ${JSON.stringify(await readLayout())}`);

  const scriptDirectory = await mkdtemp(path.join(tmpdir(), "meru-native-resize-"));
  const scriptPath = path.join(scriptDirectory, "resize.ps1");

  await writeFile(scriptPath, RESIZE_SCRIPT, "utf8");

  /*
   * The whole gesture is posted in one run, with nothing read back in between.
   * The modal loop is Windows' own, not Chromium's, so while it is turning the
   * main process may not service anything — an `evaluate` mid-loop can simply
   * never return.
   */
  const { stdout, stderr, error } = await runPowerShell(scriptPath, handle);

  console.log(`[e2e] powershell stdout: ${stdout.trim() || "(none)"}`);
  console.log(`[e2e] powershell stderr: ${stderr.trim() || "(none)"}`);
  console.log(`[e2e] powershell error: ${error || "(none)"}`);

  // Polled rather than read once, since the loop exits on its own schedule.
  await expect
    .poll(async () => (await readLayout()).bounds.width, { timeout: 30_000 })
    .toBeGreaterThan(0);

  const events = await meru.app.evaluate(
    () => (globalThis as unknown as { __events: unknown[] }).__events,
  );

  const willResizeCount = events.filter(
    (event) => (event as { name: string }).name === "will-resize",
  ).length;

  console.log(`[e2e] will-resize events: ${willResizeCount} of ${events.length} total`);

  for (const event of events.slice(0, 12)) {
    console.log(`[e2e] event: ${JSON.stringify(event)}`);
  }

  console.log(`[e2e] after: ${JSON.stringify(await readLayout())}`);
});
