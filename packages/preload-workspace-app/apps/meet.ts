import { ipc } from "@meru/shared/renderer/ipc";
import { $$ } from "select-dom";

function toggleMuteButton(button: "microphone" | "camera") {
  const muteButtons = $$("button[data-is-muted]");

  if (button === "microphone" && muteButtons[0]) {
    muteButtons[0].click();
  } else if (button === "camera" && muteButtons[1]) {
    muteButtons[1].click();
  }
}

export function initMeetPreload() {
  ipc.renderer.on("googleMeet.toggleMicrophone", () => {
    toggleMuteButton("microphone");
  });

  ipc.renderer.on("googleMeet.toggleCamera", () => {
    toggleMuteButton("camera");
  });
}
