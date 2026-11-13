import type { Display, DisplayPort } from "../../core/ports.ts";

export const PRIMARY_DISPLAY: Display = {
  primary: true,
  workArea: { height: 1055, width: 1920, x: 0, y: 25 },
};

export class FakeDisplays implements DisplayPort {
  current: readonly Display[];

  constructor(displays: readonly Display[] = [PRIMARY_DISPLAY]) {
    this.current = displays;
  }

  readonly displays = (): readonly Display[] => this.current;
}
