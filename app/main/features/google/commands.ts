import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const googleCommands = defineCommands(
  "google",
  {
    toggleMeetMicrophone: {
      label: msg`Toggle Meet microphone`,
      shortcut: { default: "CommandOrControl+Shift+1" },
    },
    toggleMeetCamera: {
      label: msg`Toggle Meet camera`,
      shortcut: { default: "CommandOrControl+Shift+2" },
    },
  },
  { label: msg`Google Meet`, order: 46 }
);
