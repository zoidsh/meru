#!/usr/bin/env python3
"""Measure the loudness of sound files so Meru's can be matched against the platform's own.

    python3 analyze-sounds.py <file> [file ...]

Prints peak, full RMS and gated RMS in dBFS. Gated RMS ignores silence and is the
better proxy for how loud something actually seems; peak is what decides clipping.

Anything that is not a 16-bit WAV is converted with afconvert, which ships with
macOS, so /System/Library/Sounds/*.aiff and the .caf files under
/System/Library/Audio/UISounds can be measured alongside Meru's .wav files.
"""

import array
import math
import os
import subprocess
import sys
import tempfile
import wave


def as_wav(path, workdir):
    if path.lower().endswith(".wav"):
        try:
            with wave.open(path) as w:
                if w.getsampwidth() == 2:
                    return path
        except wave.Error:
            pass

    out = os.path.join(workdir, os.path.basename(path) + ".wav")
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16", path, out],
        check=True,
        capture_output=True,
    )
    return out


def measure(path):
    with wave.open(path) as w:
        channels, width, rate, frames = (
            w.getnchannels(),
            w.getsampwidth(),
            w.getframerate(),
            w.getnframes(),
        )
        raw = w.readframes(frames)

    if width != 2:
        raise ValueError(f"{path}: expected 16-bit, got {width * 8}-bit")

    samples = array.array("h")
    samples.frombytes(raw)

    if channels > 1:
        mono = [
            sum(samples[i : i + channels]) / channels
            for i in range(0, len(samples), channels)
        ]
    else:
        mono = list(samples)

    if not mono:
        raise ValueError(f"{path}: no samples")

    peak = max(abs(s) for s in mono) / 32768.0
    rms_full = math.sqrt(sum(s * s for s in mono) / len(mono)) / 32768.0

    block = max(1, int(rate * 0.05))
    floor = peak * 0.003
    loud = []
    for i in range(0, max(1, len(mono) - block), block):
        chunk = mono[i : i + block]
        rms = math.sqrt(sum(s * s for s in chunk) / len(chunk))
        if rms / 32768.0 > floor:
            loud.append(rms)

    rms_gated = (
        math.sqrt(sum(r * r for r in loud) / len(loud)) / 32768.0 if loud else rms_full
    )

    return {
        "duration": frames / rate,
        "rate": rate,
        "channels": channels,
        "peak": peak,
        "rms_full": rms_full,
        "rms_gated": rms_gated,
        "active": len(loud) * 0.05,
    }


def db(value):
    return 20 * math.log10(value) if value > 0 else float("-inf")


def main(paths):
    if not paths:
        print(__doc__)
        return 1

    rows = []
    with tempfile.TemporaryDirectory() as workdir:
        for path in paths:
            try:
                rows.append((os.path.basename(path), measure(as_wav(path, workdir))))
            except FileNotFoundError:
                print(f"  skipped {path}: not found", file=sys.stderr)
            except subprocess.CalledProcessError:
                print(f"  skipped {path}: afconvert could not read it", file=sys.stderr)
            except (ValueError, wave.Error) as error:
                print(f"  skipped {path}: {error}", file=sys.stderr)

    if not rows:
        print("nothing measured", file=sys.stderr)
        return 1

    width = max(len(name) for name, _ in rows)
    print(
        f"{'file':<{width}} {'dur':>5} {'rate':>6} {'ch':>2} "
        f"{'peak':>7} {'rms':>7} {'gated':>7} {'active':>7}"
    )
    for name, m in rows:
        print(
            f"{name:<{width}} {m['duration']:>5.2f} {m['rate']:>6} {m['channels']:>2} "
            f"{db(m['peak']):>7.1f} {db(m['rms_full']):>7.1f} "
            f"{db(m['rms_gated']):>7.1f} {m['active']:>6.2f}s"
        )

    gated = [db(m["rms_gated"]) for _, m in rows]
    peaks = [db(m["peak"]) for _, m in rows]
    print(f"\nspread — gated {max(gated) - min(gated):.1f} dB, peak {max(peaks) - min(peaks):.1f} dB")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
