// Stands in for Lingui's msg until the interface is translated: call sites keep the tagged form Lingui extracts, so the swap touches no entry.
export type Message = string;

export const msg = (
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
): Message => String.raw({ raw: strings }, ...values);
