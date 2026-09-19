#!/usr/bin/env python3
"""Write format variants of one sound, to find which property macOS rejects.

    python3 make-variants.py <source.wav> <output-dir>

macOS substitutes an unrelated system sound for a notification sound it cannot
use, and says nothing about why. Meru's sounds differ from a file known to work
in three ways at once — 48 kHz against 44.1, stereo against mono, and two
seconds against under one — so each is varied on its own here and fired with
`--sound=<name>` to see which one matters.
"""

import array
import os
import sys
import wave

VARIANTS = ("t-mono48", "t-441", "t-mono441", "t-short")


def read(path):
    with wave.open(path) as handle:
        channels = handle.getnchannels()
        rate = handle.getframerate()
        frames = handle.getnframes()
        raw = handle.readframes(frames)

    samples = array.array("h")
    samples.frombytes(raw)
    return channels, rate, samples


def write(path, channels, rate, samples):
    with wave.open(path, "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.tobytes())


def to_mono(channels, samples):
    if channels == 1:
        return samples
    return array.array(
        "h",
        (
            int(sum(samples[i : i + channels]) / channels)
            for i in range(0, len(samples) - channels + 1, channels)
        ),
    )


def resample(samples, channels, source_rate, target_rate):
    """Linear interpolation, which is plenty for telling a format apart."""
    frames = len(samples) // channels
    target_frames = int(frames * target_rate / source_rate)
    out = array.array("h", bytes(2 * target_frames * channels))

    for frame in range(target_frames):
        position = frame * source_rate / target_rate
        left = int(position)
        right = min(left + 1, frames - 1)
        weight = position - left
        for channel in range(channels):
            a = samples[left * channels + channel]
            b = samples[right * channels + channel]
            out[frame * channels + channel] = int(a + (b - a) * weight)

    return out


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 1

    source, out_dir = argv
    os.makedirs(out_dir, exist_ok=True)
    channels, rate, samples = read(source)
    print(f"source: {channels}ch {rate}Hz {len(samples) // channels} frames")

    mono = to_mono(channels, samples)

    written = {
        "t-mono48": (1, rate, mono),
        "t-441": (channels, 44100, resample(samples, channels, rate, 44100)),
        "t-mono441": (1, 44100, resample(mono, 1, rate, 44100)),
        "t-short": (channels, rate, samples[: int(0.6 * rate) * channels]),
    }

    for name in VARIANTS:
        ch, r, data = written[name]
        path = os.path.join(out_dir, f"{name}.wav")
        write(path, ch, r, data)
        print(f"  {name:<11} {ch}ch {r}Hz {len(data) // ch} frames -> {path}")

    print("\nCopy them into the probe's Resources and fire each:")
    print('  cp <output-dir>/t-*.wav "dist/mac-arm64/Meru Probe.app/Contents/Resources/"')
    for name in VARIANTS:
        print(f'  "dist/mac-arm64/Meru Probe.app/Contents/MacOS/Meru Probe" --sound={name}')

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
