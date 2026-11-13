import type { Ids } from "../../core/ports.ts";

export const fakeIds = (prefix = "id"): Ids => {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}${count}`;
  };
};
