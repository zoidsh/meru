import { allowlist } from "../../shared/channels/define.ts";
import type { Allowlist } from "../../shared/channels/define.ts";
import {
  contentSurfaces,
  namesContentSurface,
} from "../../shared/channels/surfaces.ts";
import type { ContentSurfaceName } from "../../shared/channels/surfaces.ts";

/** The channels the surface allows, or none at all unless main named this preload's surface on the command line. */
export const contentAllowlist = (
  argv: readonly string[],
  name: ContentSurfaceName
): Allowlist =>
  namesContentSurface(argv, name)
    ? allowlist(contentSurfaces[name])
    : allowlist();
