import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { mountSettings, typeInto } from "../../testing.tsx";
import { NumberControl, TextControl } from "./controls.tsx";

const field = () => document.querySelector("input");

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
  mountSettings(
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
  return written;
};

const mountText = () => {
  const written: unknown[] = [];
  mountSettings(
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
  return written;
};

describe(NumberControl, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a number out of bounds or none at all, says what it takes, and writes nothing", () => {
    vi.useFakeTimers();
    const written = mountNumber();
    typeInto(field(), "30");
    pause();
    const out = { ...shown(), hint: document.querySelector("p")?.textContent };
    typeInto(field(), "");
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
    typeInto(field(), "0");
    blur();
    const reverted = shown();
    typeInto(field(), "6");
    pause();
    expect({ reverted, written }).toStrictEqual({
      reverted: { invalid: "false", value: "4" },
      written: [6],
    });
  });
});

describe(TextControl, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks text the schema refuses, writes nothing, and puts the value in force back on blur", () => {
    vi.useFakeTimers();
    const written = mountText();
    typeInto(field(), "  ");
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
    typeInto(field(), "Office");
    blur();
    expect(written).toStrictEqual(["Office"]);
  });
});
