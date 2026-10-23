import { ipc } from "@meru/shared/renderer/ipc";
import { navigate } from "wouter/use-hash-location";
import { playNotificationSound } from "./notifications";

ipc.renderer.on("navigate", (_event, to) => {
  navigate(to);
});

/*
 * A view in front of the page takes the keys, but the page keeps its focused
 * element, and with it the focus ring. Main says when that has happened.
 */
ipc.renderer.on("window.blurFocusedElement", () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
});

ipc.renderer.on("taskbar.setOverlayIcon", (_event, unreadCount) => {
  const canvas = document.createElement("canvas");

  const radius = 8;
  const size = radius * 2;
  const fontSize = size;

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#F0413A";
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fill();
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- a CSS font
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "white";

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- a count cap drawn into a small icon, not a sentence
  const text = unreadCount > 999 ? "1k+" : unreadCount.toString();

  const fontWidth = ctx.measureText(text).width;
  const fontScale = (Math.cos(Math.atan(fontSize / fontWidth)) * radius * 1.33) / fontWidth;

  ctx.setTransform(fontScale, 0, 0, fontScale, radius, radius);
  ctx.fillText(text, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ipc.main.send("taskbar.setOverlayIcon", canvas.toDataURL());
});

ipc.renderer.on("notifications.playSound", (_event, { sound, volume }) => {
  playNotificationSound({ sound, volume });
});
