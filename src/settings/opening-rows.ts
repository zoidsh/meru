/**
 * Why a row under Open Google apps in Meru is disabled: `pro` on the free
 * version, which outranks `turn-on-first` while the switch is off; nothing
 * while it can be used.
 */
export const dependentRow = ({
  inMeru,
  needsPro,
}: {
  inMeru: boolean;
  needsPro: boolean;
}): "pro" | "turn-on-first" | undefined => {
  if (needsPro) {
    return "pro";
  }

  return inMeru ? undefined : "turn-on-first";
};
