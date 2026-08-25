import { ipc } from "@meru/shared/renderer/ipc";
import { navigate } from "wouter/use-hash-location";
import { playNotificationSound } from "./notifications";

ipc.renderer.on("navigate", (_event, to) => {
  navigate(to);
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
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "white";

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

/*
 * The account views are laid out by the main process from the window's content
 * bounds, and Windows can change those without the window bounds moving, which
 * is the one case Electron's `resize` does not cover: it is gated on the window
 * bounds. Maximizing is where it shows. Chromium asks the system for the
 * auto-hide taskbar edges asynchronously, reserves two pixels along each while
 * it waits, then recalculates the frame once the answer arrives — the content
 * area grows by those two pixels with no window resize behind it, and anything
 * laid out on the event is short by them for good.
 *
 * This page fills the content area, so its own resize is that missing signal,
 * and it says nothing about the size: the main process re-reads the bounds
 * itself, which keeps one source of truth and stays right whatever the page's
 * zoom is doing. Laying out again is idempotent, so the resizes this shares
 * with the window's own event cost a second pass and change nothing.
 */
window.addEventListener("resize", () => {
  ipc.main.send("window.contentResized");
});
