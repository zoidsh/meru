import { describe, expect, it } from "vitest";

import meetCall from "./fixtures/meet-call.html?raw";
import { toggleMeet } from "./meet.ts";

const pressed = () => {
  const presses: string[] = [];
  for (const button of document.querySelectorAll("button[data-is-muted]")) {
    button.addEventListener("click", () => {
      presses.push(button.getAttribute("aria-label") ?? "");
    });
  }
  return presses;
};

describe(toggleMeet, () => {
  it("presses the microphone first and the camera second, as Meet orders them", () => {
    document.body.innerHTML = meetCall;
    const presses = pressed();

    toggleMeet(document, "microphone");
    toggleMeet(document, "camera");

    expect(presses).toStrictEqual(["Turn off microphone", "Turn off camera"]);
  });

  it("does nothing on a page that shows neither", () => {
    document.body.innerHTML = "<div></div>";

    expect(() => {
      toggleMeet(document, "camera");
    }).not.toThrow();
  });
});
