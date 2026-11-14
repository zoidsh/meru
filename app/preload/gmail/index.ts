import { namesContentSurface } from "../../shared/channels/surfaces.ts";
import { startGmail } from "./app.ts";
import { gmailBridge } from "./bridge.ts";

if (namesContentSurface(process.argv, "gmail")) {
  startGmail({
    bridge: gmailBridge,
    document,
    location: {
      href: () => window.location.href,
      setHash: (hash) => {
        window.location.hash = hash;
      },
    },
  });
}
