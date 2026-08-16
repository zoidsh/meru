import type { ChromeNamespace } from "../lib/chrome";
import { createNoopEvent } from "../lib/event";
import { createNoopMethod } from "../lib/method";

/**
 * The one window every query answers with. An embedder promoting this namespace
 * maps it onto its own windows; until then extensions only need a stable id
 * that is neither `WINDOW_ID_NONE` nor `WINDOW_ID_CURRENT`.
 */
const WINDOW_ID = 1;

function createWindow() {
  return {
    id: WINDOW_ID,
    focused: true,
    incognito: false,
    alwaysOnTop: false,
    state: "normal",
    type: "normal",
    top: 0,
    left: 0,
    width: 1280,
    height: 800,
    tabs: [],
  };
}

export function createWindows(): ChromeNamespace {
  return {
    WINDOW_ID_NONE: -1,
    WINDOW_ID_CURRENT: -2,

    get: createNoopMethod(createWindow),
    getCurrent: createNoopMethod(createWindow),
    getLastFocused: createNoopMethod(createWindow),
    getAll: createNoopMethod(() => [createWindow()]),
    create: createNoopMethod(createWindow),
    update: createNoopMethod(createWindow),
    remove: createNoopMethod(() => undefined),

    onCreated: createNoopEvent(),
    onRemoved: createNoopEvent(),
    onFocusChanged: createNoopEvent(),
    onBoundsChanged: createNoopEvent(),
  };
}
