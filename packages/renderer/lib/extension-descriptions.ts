import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { BITWARDEN_EXTENSION_ID, ONEPASSWORD_EXTENSION_ID } from "@meru/shared/extensions";

/**
 * Translated here rather than in `@meru/shared/extensions`, which end-to-end
 * tests and the download script import without the Lingui transform.
 */
// lingui-set comment="Description of a password manager extension in Settings. Google Account is Google's name for the account, so use Google's own word for it in that language"
export const extensionDescriptions: Record<string, MessageDescriptor> = {
  [ONEPASSWORD_EXTENSION_ID]: msg`Fills and generates passwords and passkeys for your Google Account. Needs the 1Password desktop app, connected to Meru.`,
  [BITWARDEN_EXTENSION_ID]: msg`Fills and generates passwords and passkeys for your Google Account. Unlocking with biometrics needs the Bitwarden desktop app.`,
};
// lingui-reset
