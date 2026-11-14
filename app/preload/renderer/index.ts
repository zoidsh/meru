import { platformOf } from "../../core/records/platform.ts";
import { allowlist } from "../../shared/channels/define.ts";
import { surfaceOf } from "../../shared/channels/surfaces.ts";
import { exposeBridge } from "./bridge.ts";

exposeBridge(platformOf(process.platform), allowlist(surfaceOf(process.argv)));
