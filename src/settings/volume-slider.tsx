import { useState } from "react";

import { Slider } from "#ui/slider.tsx";

// The shared Slider draws a thumb for each value of an array, so one value
// goes in as an array of one.
const single = (value: number | readonly number[]) =>
  typeof value === "number" ? value : (value[0] ?? 1);

/**
 * The volume, written only once a drag or a key press is committed. It shows
 * the value being dragged until main sends back a new one.
 */
export const VolumeSlider = ({
  labelId,
  volume,
  disabled,
  onCommit,
}: {
  labelId: string;
  volume: number;
  disabled: boolean;
  onCommit: (volume: number) => void;
}) => {
  const [moving, setMoving] = useState<number>();
  const [sent, setSent] = useState(volume);

  if (sent !== volume) {
    setSent(volume);
    setMoving(undefined);
  }

  // The Slider fills its container, and the row's control column is only as
  // wide as its content, so the width is set on a box around it, as tall as
  // the label's line.
  return (
    <div className="flex h-5 w-32 items-center">
      <Slider
        aria-labelledby={labelId}
        min={0.05}
        max={1}
        step={0.05}
        format={{ style: "percent" }}
        value={[moving ?? volume]}
        disabled={disabled}
        onValueChange={(value) => {
          setMoving(single(value));
        }}
        onValueCommitted={(value) => {
          onCommit(single(value));
        }}
      />
    </div>
  );
};
