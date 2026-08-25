/*
 * Windows only. Drives the real sizing modal loop — the one an edge-drag runs
 * inside — and asserts the account view keeps up with the window all the way
 * through it, not merely once it is over.
 *
 * Playwright cannot reach this path. `page.mouse` goes over CDP into Blink's
 * input pipeline, below the OS, so it never produces the `WM_NCHITTEST` a native
 * resize starts from. The way round is to post the message that starts the loop
 * rather than to imitate a mouse: `WM_SYSCOMMAND` with `SC_SIZE` is the
 * documented way in, and a posted window message needs no interactive desktop,
 * being a message to a window rather than input to a session. It is posted from
 * the test process to the app's `HWND`, so no FFI goes anywhere near the
 * packaged app, and PowerShell can P/Invoke `PostMessage` with no dependency
 * added for it.
 *
 * Two gestures, because they exercise different halves. Keyboard sizing draws a
 * rubber band and applies the size once, on Enter, so it covers entering and
 * leaving the loop. Only the mouse live-resizes, emitting a `resize` per motion,
 * and that continuous phase is the one where a view can visibly lag the window.
 */
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp({ "window.restrictMinimumSize": false });

/** The size the window is put at before a gesture, leaving room to grow on a 1024x768 runner. */
const START_SIZE = { width: 700, height: 500 };

/*
 * The messages both gestures are built from. WM_SYSCOMMAND is 0x0112 and SC_SIZE
 * 0xF000; adding WMSZ_RIGHT (2) attaches the loop to the right border and warps
 * the cursor to it. WM_KEYDOWN is 0x0100, with VK_RIGHT 0x27, VK_RETURN 0x0D and
 * VK_ESCAPE 0x1B. Escape is posted after Return in both scripts as the way out
 * of a loop that did not take the commit: a loop left turning hangs the main
 * process, and every later test with it.
 */
const NATIVE_METHODS = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWindow {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SystemParametersInfo(uint action, uint param, IntPtr value, uint winIni);
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
}
"@
`;

const KEYBOARD_SCRIPT = `param([string]$Hwnd)
${NATIVE_METHODS}
$handle = [IntPtr][long]$Hwnd

[void][NativeWindow]::PostMessage($handle, 0x0112, [IntPtr]0xF000, [IntPtr]0)
Start-Sleep -Milliseconds 500

for ($i = 0; $i -lt 60; $i++) {
  [void][NativeWindow]::PostMessage($handle, 0x0100, [IntPtr]0x27, [IntPtr]0)
  Start-Sleep -Milliseconds 15
}

[void][NativeWindow]::PostMessage($handle, 0x0100, [IntPtr]0x0D, [IntPtr]0)
Start-Sleep -Milliseconds 300
[void][NativeWindow]::PostMessage($handle, 0x0100, [IntPtr]0x1B, [IntPtr]0)
`;

const MOUSE_SCRIPT = `param([string]$Hwnd, [int]$Steps)
${NATIVE_METHODS}
$handle = [IntPtr][long]$Hwnd
$point = New-Object NativeWindow+POINT

# SPI_SETDRAGFULLWINDOWS. Off, Windows draws a rubber band through the drag and
# applies the size once on release, so the window never resizes while the mouse
# moves and there is no continuous phase to test. A runner has it off.
$enabled = [NativeWindow]::SystemParametersInfo(0x0025, 1, [IntPtr]::Zero, 2)
Write-Output "dragfullwindows $enabled"

# Windows warps the cursor to the border it attaches to, so where it lands is
# read back rather than guessed at.
[void][NativeWindow]::PostMessage($handle, 0x0112, [IntPtr]0xF002, [IntPtr]0)
Start-Sleep -Milliseconds 500

[void][NativeWindow]::GetCursorPos([ref]$point)
Write-Output "cursor-at-border $($point.X),$($point.Y)"

$startX = $point.X
$startY = $point.Y

for ($i = 1; $i -le $Steps; $i++) {
  $moved = [NativeWindow]::SetCursorPos($startX + ($i * 8), $startY)
  if ($i -eq 1) { Write-Output "setcursorpos $moved" }
  Start-Sleep -Milliseconds 25
}

[void][NativeWindow]::GetCursorPos([ref]$point)
Write-Output "cursor-final $($point.X),$($point.Y)"

[void][NativeWindow]::PostMessage($handle, 0x0100, [IntPtr]0x0D, [IntPtr]0)
Start-Sleep -Milliseconds 300
[void][NativeWindow]::PostMessage($handle, 0x0100, [IntPtr]0x1B, [IntPtr]0)
`;

/** Resolves with whatever the script printed, rather than rejecting on a non-zero exit. */
function runPowerShell(scriptPath: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; error: string }>((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
      { timeout: 120_000 },
      (error, stdout, stderr) => {
        resolve({ stdout, stderr, error: error ? error.message : "" });
      },
    );
  });
}

async function writeScript(name: string, contents: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "meru-native-"));
  const scriptPath = path.join(directory, name);

  await writeFile(scriptPath, contents, "utf8");

  return scriptPath;
}

/**
 * Puts the window at a known size and starts recording, then hands back the
 * window's `HWND` for a gesture to be aimed at.
 *
 * The recording listener is registered after the app's own, and `EventEmitter`
 * calls them in that order, so every sample is taken once the app has already
 * had its chance to lay the views out. A sample that does not fill the window is
 * therefore the app failing to keep up rather than the test reading too early.
 */
async function startRecording() {
  return meru.app.evaluate(({ BrowserWindow }, startSize) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    window.setBounds(startSize);

    const samples: { name: string; content: number[]; view: number[] | null }[] = [];

    (globalThis as unknown as { __samples: typeof samples }).__samples = samples;

    const record = (name: string) => () => {
      const content = window.getContentBounds();
      const view = window.contentView.children[0]?.getBounds();

      samples.push({
        name,
        content: [content.width, content.height],
        view: view ? [view.x, view.y, view.width, view.height] : null,
      });
    };

    window.on("will-resize", record("will-resize"));
    window.on("resize", record("resize"));
    window.on("resized", record("resized"));

    const handle = window.getNativeWindowHandle();

    // Returned as a string: an HWND is pointer-sized, and a BigInt does not
    // survive the trip back out of the main process.
    return handle.length >= 8 ? handle.readBigInt64LE().toString() : String(handle.readUInt32LE());
  }, START_SIZE);
}

function readSamples() {
  return meru.app.evaluate(
    () =>
      (
        globalThis as unknown as {
          __samples: { name: string; content: number[]; view: number[] | null }[];
        }
      ).__samples,
  );
}

function readLayout() {
  return meru.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    return {
      contentBounds: window?.getContentBounds(),
      views: window?.contentView.children.map((child) => child.getBounds()),
    };
  });
}

/**
 * Collects what a failure would need explaining and prints it only if one
 * happens. These numbers are the difference between "the app did not keep up"
 * and "the runner stopped resizing continuously", and a failure here is read
 * from the job log of a machine nobody can look at — but a passing run has
 * nothing to say and was saying it six times.
 */
function createDiagnostics() {
  const lines: string[] = [];

  return {
    record(line: string) {
      lines.push(line);
    },
    async whileReporting(assertions: () => Promise<void> | void) {
      try {
        await assertions();
      } catch (error) {
        for (const line of lines) {
          console.log(`[e2e] ${line}`);
        }

        throw error;
      }
    },
  };
}

/*
 * At file scope rather than in a hook. `useApp` registers its own `beforeEach`
 * when it is called above, and hooks run in registration order, so skipping from
 * inside one launched the packaged app and waited for its renderer before
 * deciding not to use it — twice per non-Windows job, every run.
 */
test.skip(process.platform !== "win32", "the sizing modal loop is a Windows message loop");

test("the account view follows the window through a native drag-resize", async () => {
  const diagnostics = createDiagnostics();

  const handle = await startRecording();

  const scriptPath = await writeScript("drag.ps1", MOUSE_SCRIPT);

  /*
   * The whole gesture runs with nothing read back in between. The modal loop is
   * Windows' own rather than Chromium's, so while it turns the main process may
   * service nothing at all, and an `evaluate` issued mid-loop can simply never
   * return.
   */
  const { stdout, stderr, error } = await runPowerShell(scriptPath, [handle, "40"]);

  diagnostics.record(`drag stdout: ${stdout.trim() || "(none)"}`);

  // Unconditional, unlike the rest. A script that failed to compile its P/Invoke
  // stub is an environment fault rather than a test result, and it would
  // otherwise be invisible on a run that somehow still passed.
  if (stderr.trim() || error) {
    console.log(`[e2e] drag stderr: ${stderr.trim() || "(none)"}`);
    console.log(`[e2e] drag error: ${error || "(none)"}`);
  }

  const samples = await readSamples();
  const layout = await readLayout();

  const counts = samples.reduce<Record<string, number>>((totals, sample) => {
    totals[sample.name] = (totals[sample.name] ?? 0) + 1;

    return totals;
  }, {});

  diagnostics.record(`events: ${JSON.stringify(counts)}`);
  diagnostics.record(`final: ${JSON.stringify(layout)}`);

  await diagnostics.whileReporting(async () => {
    /*
     * Asserted before anything about the view, because a gesture that did not
     * happen would make every assertion below pass on nothing. `will-resize` comes
     * from `WM_SIZING`, which arrives only inside the modal loop, and the width has
     * to have actually moved.
     */
    expect(
      counts["will-resize"] ?? 0,
      "the window never entered the sizing modal loop",
    ).toBeGreaterThan(0);
    expect(layout.contentBounds?.width, "the drag did not widen the window").toBeGreaterThan(
      START_SIZE.width,
    );

    /*
     * The guard that stops the assertion below passing on nothing. A drag that
     * resizes once is a drag Windows drew as a rubber band and applied on release,
     * and a view has no continuous phase to lag through — which is the whole of
     * what this test is for. `SPI_SETDRAGFULLWINDOWS` is set before the gesture for
     * exactly that reason, and this is what says it took.
     */
    expect(
      counts.resize ?? 0,
      "the window did not resize continuously, so the drag says nothing about a view keeping up",
    ).toBeGreaterThan(5);

    /*
     * Every `resize` during the drag, not only the state it settled at. A view
     * that lags the window is wrong for the whole gesture and right at the end of
     * it, which is exactly what the report describes and exactly what asserting on
     * the final state alone would miss.
     */
    const lagging = samples
      .filter((sample) => sample.name === "resize")
      .filter((sample) => {
        const [contentWidth, contentHeight] = sample.content;
        const view = sample.view;

        if (!view || contentWidth === undefined || contentHeight === undefined) {
          return true;
        }

        const [x, y, width, height] = view as [number, number, number, number];

        return x + width !== contentWidth || y + height !== contentHeight;
      });

    diagnostics.record(`lagging samples: ${JSON.stringify(lagging.slice(0, 8))}`);

    expect(
      lagging.length,
      `the account view did not fill the window on ${lagging.length} of ${counts.resize ?? 0} resizes during the drag`,
    ).toBe(0);
  });
});

test("the account view follows the window through a keyboard resize", async () => {
  const diagnostics = createDiagnostics();

  const handle = await startRecording();

  const scriptPath = await writeScript("size.ps1", KEYBOARD_SCRIPT);

  const { stdout, stderr, error } = await runPowerShell(scriptPath, [handle]);

  diagnostics.record(`keyboard stdout: ${stdout.trim() || "(none)"}`);

  // Unconditional, unlike the rest. A script that failed to compile its P/Invoke
  // stub is an environment fault rather than a test result, and it would
  // otherwise be invisible on a run that somehow still passed.
  if (stderr.trim() || error) {
    console.log(`[e2e] keyboard stderr: ${stderr.trim() || "(none)"}`);
    console.log(`[e2e] keyboard error: ${error || "(none)"}`);
  }

  const samples = await readSamples();
  const layout = await readLayout();

  const willResize = samples.filter((sample) => sample.name === "will-resize").length;

  diagnostics.record(`will-resize: ${willResize}, total: ${samples.length}`);
  diagnostics.record(`final: ${JSON.stringify(layout)}`);

  await diagnostics.whileReporting(() => {
    expect(willResize, "the window never entered the sizing modal loop").toBeGreaterThan(0);

    const [view] = layout.views ?? [];

    expect({
      right: (layout.contentBounds?.width ?? 0) - ((view?.x ?? 0) + (view?.width ?? 0)),
      bottom: (layout.contentBounds?.height ?? 0) - ((view?.y ?? 0) + (view?.height ?? 0)),
    }).toEqual({ right: 0, bottom: 0 });
  });
});
