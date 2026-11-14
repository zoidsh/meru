import { wireName } from "../../shared/channels/define.ts";
import { stage } from "../../shared/channels/stage.ts";
import { dragBridge } from "./bridge.ts";

const move = wireName(stage.dragTo);
const end = wireName(stage.endDrag);
const cancel = wireName(stage.cancelDrag);

// The preload's world sees the page's DOM events, so the data: page needs no script of its own.
window.addEventListener("pointermove", (event) => {
  dragBridge.send(move, {
    buttons: event.buttons,
    x: event.clientX,
    y: event.clientY,
  });
});

const release = (event: PointerEvent) => {
  dragBridge.send(end, { x: event.clientX, y: event.clientY });
};

window.addEventListener("pointerup", release);
// A press on the overlay means the release that should have ended the drag went elsewhere.
window.addEventListener("pointerdown", release);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    dragBridge.send(cancel, {});
  }
});
