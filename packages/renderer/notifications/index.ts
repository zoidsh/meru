import { ipc } from "@meru/renderer-lib/ipc";
import type { NotificationSound } from "@meru/shared/types";
import bell from "./sounds/bell.wav?inline";
import bubble from "./sounds/bubble.wav?inline";
import longPop from "./sounds/long-pop.wav?inline";
import magicMarimba from "./sounds/magic-marimba.wav?inline";
import magicRing from "./sounds/magic-ring.wav?inline";
import retroGame from "./sounds/retro-game.wav?inline";

const SOUNDS: Record<NotificationSound, string> = {
	bell,
	bubble,
	"long-pop": longPop,
	"magic-marimba": magicMarimba,
	"magic-ring": magicRing,
	"retro-game": retroGame,
};

ipc.renderer.on("notifications.playSound", (_event, sound) => {
	new Audio(SOUNDS[sound]).play();
});
