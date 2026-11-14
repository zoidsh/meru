import type { BadgePort } from "../../core/ports.ts";

export class FakeBadge implements BadgePort {
  /** What the icon shows now. */
  total = 0;

  readonly set = (total: number) => {
    this.total = total;
  };
}
