/*
 * A Wayland compositor for the tests that need one, on Linux: sway on its
 * headless backend, drawing in software, with no X server beside it.
 *
 * Each test gets a sway of its own in a runtime directory of its own, because
 * that directory is where every Wayland client looks for the compositor's
 * socket, and one shared by the workers would hand each app every other
 * worker's windows and focus. The socket's name is read from the directory
 * rather than assumed, since sway takes the first free `wayland-N` it finds.
 *
 * Headless, sway has no input devices, and a seat without a pointer offers
 * clients no `wl_pointer`, so `swaymsg seat … cursor` would move a cursor no
 * app can feel. Each sway is given a virtual pointer before the app starts,
 * through the protocol wtype's virtual keyboard has a twin in, and the seat
 * commands then reach the app through it.
 *
 * Without sway or wtype the tests that need them skip locally and fail under
 * CI, so CI cannot lose them unseen.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { ms } from "@meru/shared/ms";
import { test } from "@playwright/test";
import { killTree } from "./process-tree";
import { onceSpawned } from "./window-manager";

const execFileAsync = promisify(execFile);

const START_TIMEOUT = ms("10s");

const COMMAND_TIMEOUT = ms("10s");

const POLL_INTERVAL = ms("100ms");

// What a failure prints of sway's own output.
const OUTPUT_LINES_KEPT = 100;

const REQUIRED_COMMANDS = ["sway", "swaymsg", "wtype"];

const SWAY_CONFIG = ["output HEADLESS-1 resolution 1600x1000", "xwayland disable", ""].join("\n");

/** What a compositor of the test's own takes over from the worker's environment. */
const DISPLAY_VARIABLES = ["DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "SWAYSOCK"] as const;

type Rect = { x: number; y: number; width: number; height: number };

export type SwayView = {
  app_id: string | null;
  shell: string;
  visible: boolean;
  /** Where the view sits in the layout, borders and all, in logical pixels. */
  rect: Rect;
  /** Where the client's surface sits inside `rect`. */
  window_rect: Rect;
};

type SwayNode = Partial<SwayView> & {
  type: string;
  nodes?: SwayNode[];
  floating_nodes?: SwayNode[];
};

export type Sway = {
  /** Runs `swaymsg` against this test's sway, and resolves with what it printed. */
  swaymsg(...args: string[]): Promise<string>;
  /** Every toplevel in sway's tree. */
  readViews(): Promise<SwayView[]>;
  /** The name of the seat input goes through. */
  readSeat(): Promise<string>;
  /** Types `text` with wtype, into whatever surface has the keyboard focus. */
  type(text: string): Promise<void>;
};

function findMissingCommands() {
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);

  return REQUIRED_COMMANDS.filter(
    (command) => !directories.some((directory) => existsSync(path.join(directory, command))),
  );
}

function collectViews(node: SwayNode): SwayView[] {
  return [
    ...(node.shell ? [node as SwayView] : []),
    ...[...(node.nodes ?? []), ...(node.floating_nodes ?? [])].flatMap(collectViews),
  ];
}

function captureOutput(child: ChildProcess, output: string[]) {
  const onData = (chunk: Buffer) => {
    output.push(...chunk.toString().split("\n").filter(Boolean));

    output.splice(0, Math.max(0, output.length - OUTPUT_LINES_KEPT));
  };

  child.stdout?.on("data", onData);

  child.stderr?.on("data", onData);
}

/**
 * Resolves with the names sway gave its two sockets once both exist and the
 * IPC one answers.
 */
async function waitForSockets(sway: ChildProcess, runtimeDir: string, output: string[]) {
  const giveUpAt = Date.now() + START_TIMEOUT;

  for (;;) {
    const entries = await readdir(runtimeDir);

    const waylandDisplay = entries.find((entry) => /^wayland-\d+$/.test(entry));

    const ipcSocket = entries.find((entry) => /^sway-ipc\..+\.sock$/.test(entry));

    if (waylandDisplay && ipcSocket) {
      const swaysock = path.join(runtimeDir, ipcSocket);

      const answered = await execFileAsync("swaymsg", ["-t", "get_version"], {
        env: { ...process.env, SWAYSOCK: swaysock },
        timeout: COMMAND_TIMEOUT,
      }).then(
        () => true,
        () => false,
      );

      if (answered) {
        return { waylandDisplay, swaysock };
      }
    }

    if (sway.exitCode !== null || sway.signalCode !== null) {
      throw new Error(
        `sway exited with ${sway.exitCode ?? sway.signalCode} before it was listening:\n${output.join("\n")}`,
      );
    }

    if (Date.now() > giveUpAt) {
      throw new Error(
        `sway was not listening within ${START_TIMEOUT}ms; ${runtimeDir} held ${JSON.stringify(entries)}:\n${output.join("\n")}`,
      );
    }

    await delay(POLL_INTERVAL);
  }
}

/** A Wayland request: the object, the opcode, and its arguments as the wire carries them. */
function encodeRequest(objectId: number, opcode: number, ...args: (number | string)[]) {
  const body = Buffer.concat(
    args.map((arg) => {
      if (typeof arg === "number") {
        const word = Buffer.alloc(4);

        word.writeUInt32LE(arg);

        return word;
      }

      const bytes = Buffer.from(`${arg}\0`);

      const length = Buffer.alloc(4);

      length.writeUInt32LE(bytes.length);

      return Buffer.concat([length, bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4)]);
    }),
  );

  const header = Buffer.alloc(8);

  header.writeUInt32LE(objectId);

  header.writeUInt32LE(((header.length + body.length) << 16) | opcode, 4);

  return Buffer.concat([header, body]);
}

// The object ids this client allocates, in the order it allocates them.
const DISPLAY_ID = 1;
const REGISTRY_ID = 2;
const GLOBALS_LISTED_ID = 3;
const MANAGER_ID = 4;
const POINTER_ID = 5;
const POINTER_ADDED_ID = 6;

const VIRTUAL_POINTER_MANAGER = "zwlr_virtual_pointer_manager_v1";

/**
 * Connects to the compositor and creates a virtual pointer on its default seat,
 * resolving once the compositor has processed that. The pointer lasts as long
 * as the connection does.
 */
function addVirtualPointer(socketPath: string) {
  const socket = createConnection(socketPath);

  return new Promise<Socket>((resolve, reject) => {
    const fail = (message: string) => {
      clearTimeout(timer);

      socket.destroy();

      reject(new Error(`Could not add a virtual pointer to sway: ${message}`));
    };

    const timer = setTimeout(() => {
      fail(`no answer within ${START_TIMEOUT}ms`);
    }, START_TIMEOUT);

    const globals = new Map<string, number>();

    let received = Buffer.alloc(0);

    function handleEvent(objectId: number, opcode: number, body: Buffer) {
      // wl_display.error, wl_registry.global and wl_callback.done are each opcode 0.
      if (opcode !== 0) {
        return;
      }

      if (objectId === DISPLAY_ID) {
        fail(`it sent protocol error ${body.readUInt32LE(4)}`);
      } else if (objectId === REGISTRY_ID) {
        const interfaceLength = body.readUInt32LE(4);

        globals.set(body.toString("utf8", 8, 8 + interfaceLength - 1), body.readUInt32LE(0));
      } else if (objectId === GLOBALS_LISTED_ID) {
        const managerName = globals.get(VIRTUAL_POINTER_MANAGER);

        if (managerName === undefined) {
          fail(`it offers no ${VIRTUAL_POINTER_MANAGER}`);

          return;
        }

        socket.write(
          Buffer.concat([
            encodeRequest(REGISTRY_ID, 0, managerName, VIRTUAL_POINTER_MANAGER, 1, MANAGER_ID),
            // A null seat is the compositor's default one.
            encodeRequest(MANAGER_ID, 0, 0, POINTER_ID),
            encodeRequest(DISPLAY_ID, 0, POINTER_ADDED_ID),
          ]),
        );
      } else if (objectId === POINTER_ADDED_ID) {
        clearTimeout(timer);

        resolve(socket);
      }
    }

    socket.on("data", (chunk: Buffer) => {
      received = Buffer.concat([received, chunk]);

      while (received.length >= 8) {
        const sizeAndOpcode = received.readUInt32LE(4);

        const size = sizeAndOpcode >>> 16;

        if (received.length < size) {
          return;
        }

        handleEvent(received.readUInt32LE(0), sizeAndOpcode & 0xffff, received.subarray(8, size));

        received = received.subarray(size);
      }
    });

    socket.on("error", (error) => fail(error.message));

    // wl_display.get_registry, then wl_display.sync to learn when every global has been listed.
    socket.write(
      Buffer.concat([
        encodeRequest(DISPLAY_ID, 1, REGISTRY_ID),
        encodeRequest(DISPLAY_ID, 0, GLOBALS_LISTED_ID),
      ]),
    );
  });
}

type Running = {
  sway: ChildProcess;
  pointer?: Socket;
  runtimeDir: string;
  env: NodeJS.ProcessEnv;
  output: string[];
};

/**
 * Gives every test in the file a headless sway of its own on Linux, and skips
 * the file elsewhere. Call it before `useApp`, since hooks run in the order they
 * were registered and the app has to launch onto this compositor.
 *
 * The compositor reaches the app through `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`
 * and `SWAYSOCK` in the worker's environment, which every launch copies, with
 * `DISPLAY` removed so the app has no X server to fall back on. A worker runs
 * one test at a time, so setting them for the length of a test reaches only
 * that test's app.
 *
 * Taken down as the next test starts, or after the file, rather than after its
 * test, for the reason `useWindowManagerDisplay` gives.
 */
export function useSwayDisplay(): Sway {
  test.skip(process.platform !== "linux", "Wayland is Linux's alone");

  const missingCommands = findMissingCommands();

  const missingMessage = `A headless Wayland compositor needs ${missingCommands.join(", ")} on PATH, from the sway and wtype packages`;

  test.skip(missingCommands.length > 0 && !process.env.CI, missingMessage);

  test.beforeAll(() => {
    if (missingCommands.length > 0) {
      throw new Error(missingMessage);
    }
  });

  const sharedEnv = Object.fromEntries(DISPLAY_VARIABLES.map((name) => [name, process.env[name]]));

  let running: Running | undefined;

  function current() {
    if (!running) {
      throw new Error("sway has not been started yet");
    }

    return running;
  }

  async function takeDown() {
    for (const [name, value] of Object.entries(sharedEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    if (!running) {
      return;
    }

    const { sway, pointer, runtimeDir } = running;

    running = undefined;

    pointer?.destroy();

    await killTree(sway);

    await rm(runtimeDir, { recursive: true, force: true });
  }

  test.beforeEach(async () => {
    await takeDown();

    const runtimeDir = await mkdtemp(path.join(tmpdir(), "meru-e2e-sway-"));

    const configPath = path.join(runtimeDir, "config");

    await writeFile(configPath, SWAY_CONFIG);

    const swayEnv: NodeJS.ProcessEnv = { ...process.env };

    for (const name of DISPLAY_VARIABLES) {
      delete swayEnv[name];
    }

    Object.assign(swayEnv, {
      XDG_RUNTIME_DIR: runtimeDir,
      WLR_BACKENDS: "headless",
      WLR_LIBINPUT_NO_DEVICES: "1",
      WLR_RENDERER: "pixman",
    });

    const sway = spawn("sway", ["--config", configPath], {
      env: swayEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output: string[] = [];

    captureOutput(sway, output);

    running = { sway, runtimeDir, env: {}, output };

    let displayEnv: Record<string, string>;

    try {
      await onceSpawned(sway);

      const { waylandDisplay, swaysock } = await waitForSockets(sway, runtimeDir, output);

      displayEnv = {
        XDG_RUNTIME_DIR: runtimeDir,
        WAYLAND_DISPLAY: waylandDisplay,
        SWAYSOCK: swaysock,
      };

      running.env = { ...swayEnv, ...displayEnv };

      running.pointer = await addVirtualPointer(path.join(runtimeDir, waylandDisplay));
    } catch (error) {
      await takeDown();

      throw error;
    }

    Object.assign(process.env, displayEnv);

    delete process.env.DISPLAY;
  });

  // Registered before the app's own, so it runs while the app is still up.
  // oxlint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (!running || testInfo.status === testInfo.expectedStatus) {
      return;
    }

    const views = await sway.readViews().catch((error: Error) => `unreadable: ${error.message}`);

    console.log(`[e2e] sway's views: ${JSON.stringify(views)}`);

    console.log(`[e2e] sway's output:\n${running.output.join("\n")}`);
  });

  test.afterAll(takeDown);

  const sway: Sway = {
    async swaymsg(...args) {
      const { stdout } = await execFileAsync("swaymsg", args, {
        env: current().env,
        timeout: COMMAND_TIMEOUT,
      });

      return stdout;
    },
    async readViews() {
      return collectViews(JSON.parse(await sway.swaymsg("-t", "get_tree")) as SwayNode);
    },
    async readSeat() {
      const [seat] = JSON.parse(await sway.swaymsg("-t", "get_seats")) as { name: string }[];

      if (!seat) {
        throw new Error("sway reports no seat");
      }

      return seat.name;
    },
    async type(text) {
      /*
       * Every wtype run is a new virtual keyboard the seat switches to, and the
       * app can lose the first key after that switch: under three workers it
       * lost four first letters in five runs, whatever the keymap. A Shift
       * press and release goes first, which types nothing whether it lands or
       * not, and after it every character arrived in 27 runs of 27.
       */
      await execFileAsync("wtype", ["-k", "Shift_L", text], {
        env: current().env,
        timeout: COMMAND_TIMEOUT,
      });
    },
  };

  return sway;
}
