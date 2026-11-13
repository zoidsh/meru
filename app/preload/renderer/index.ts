import { allowlist } from "../../shared/channels/define.ts";
import {
  rendererSurface,
  TEST_SURFACE_ARGUMENT,
  testSurface,
} from "../../shared/channels/surfaces.ts";
import { exposeBridge } from "./bridge.ts";

exposeBridge(
  process.platform,
  allowlist(
    process.argv.includes(TEST_SURFACE_ARGUMENT) ? testSurface : rendererSurface
  )
);
