import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { mountSettings } from "../../testing.tsx";
import { NumberControl, TextControl } from "./controls.tsx";

const mounted: (() => void)[] = [];

const field = () => document.querySelector("input");

// React tracks an input's value through its own setter, so the value is set past it for the change to reach onChange.
const type = (text: string) => {
  act(() => {
    const input = field();
    if (input === null) {
      return;
    }
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const pause = () => {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
};

const blur = () => {
  act(() => {
    field()?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
};

const shown = () => ({
  invalid: field()?.getAttribute("aria-invalid"),
  value: field()?.value,
});

const mountNumber = () => {
  const written: unknown[] = [];
  const page = mountSettings(
    <NumberControl
      disabled={false}
      id="hours"
      label="Hours"
      max={24}
      min={1}
      onChange={(value) => {
        written.push(value);
      }}
      schema={z.number().int().min(1).max(24)}
      step={1}
      value={4}
    />,
    []
  );
  mounted.push(page.unmount);
  return written;
};

const mountText = () => {
  const written: unknown[] = [];
  const page = mountSettings(
    <TextControl
      disabled={false}
      id="name"
      label="Name"
      onChange={(value) => {
        written.push(value);
      }}
      schema={z.string().trim().min(1)}
      value="Work"
    />,
    []
  );
  mounted.push(page.unmount);
  return written;
};

describe(NumberControl, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    vi.useRealTimers();
  });

  it("marks a number out of bounds or none at all, says what it takes, and writes nothing", () => {
    vi.useFakeTimers();
    const written = mountNumber();
    type("30");
    pause();
    const out = { ...shown(), hint: document.querySelector("p")?.textContent };
    type("");
    pause();
    expect({ empty: shown(), out, written }).toStrictEqual({
      empty: { invalid: "true", value: "" },
      out: {
        hint: "Enter a number from 1 to 24",
        invalid: "true",
        value: "30",
      },
      written: [],
    });
  });

  it("puts the value in force back on blur after invalid input, and writes a valid one once typing pauses", () => {
    vi.useFakeTimers();
    const written = mountNumber();
    type("0");
    blur();
    const reverted = shown();
    type("6");
    pause();
    expect({ reverted, written }).toStrictEqual({
      reverted: { invalid: "false", value: "4" },
      written: [6],
    });
  });
});

describe(TextControl, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    vi.useRealTimers();
  });

  it("marks text the schema refuses, writes nothing, and puts the value in force back on blur", () => {
    vi.useFakeTimers();
    const written = mountText();
    type("  ");
    pause();
    const refused = shown();
    blur();
    expect({ refused, reverted: shown(), written }).toStrictEqual({
      refused: { invalid: "true", value: "  " },
      reverted: { invalid: "false", value: "Work" },
      written: [],
    });
  });

  it("writes typed text at once on blur rather than waiting for the pause", () => {
    vi.useFakeTimers();
    const written = mountText();
    type("Office");
    blur();
    expect(written).toStrictEqual(["Office"]);
  });
});
