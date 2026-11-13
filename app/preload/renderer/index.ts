import { allowlist } from "../../shared/channels/define.ts";
import { rendererSurface } from "../../shared/channels/surfaces.ts";
import { exposeBridge } from "./bridge.ts";

exposeBridge(process.platform, allowlist(rendererSurface));
