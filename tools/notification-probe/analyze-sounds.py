#!/usr/bin/env python3
"""Measure the loudness of sound files so Meru's can be matched against the platform's own.

    python3 analyze-sounds.py <file> [file ...]

Prints peak, full RMS and gated RMS in dBFS. Gated RMS ignores silence and is the
better proxy for how loud something actually seems; peak is what decides clipping.

Reads WAV and uncompressed AIFF/AIFF-C directly, at any bit depth, so macOS's own
/System/Library/Sounds can be measured next to Meru's .wav files on any machine.
Anything else is handed to afconvert, which only exists on macOS.
"""

import array
import math
import os
import struct
import subprocess
import sys
import tempfile
import wave


def read_extended(raw):
    """Decode the 80-bit IEEE 754 extended float AIFF stores its sample rate in."""
    exponent = struct.unpack(">H", raw[0:2])[0]
    high, low = struct.unpack(">LL", raw[2:10])

    sign = -1 if exponent & 0x8000 else 1
    exponent &= 0x7FFF

    if exponent == 0 and high == 0 and low == 0:
        return 0.0

    exponent -= 16383
    return sign * (high * 2.0 ** (exponent - 31) + low * 2.0 ** (exponent - 63))


def decode(raw, width, big_endian):
    """Signed PCM of any byte width to a list of ints."""
    usable = len(raw) - len(raw) % width

    if width in (2, 4):
        samples = array.array("h" if width == 2 else "i")
        samples.frombytes(raw[:usable])
        if big_endian != (sys.byteorder == "big"):
            samples.byteswap()
        return samples

    if width == 1:
        return array.array("b", raw[:usable])

    if width == 3:
        order = "big" if big_endian else "little"
        return [
            int.from_bytes(raw[i : i + 3], order, signed=True)
            for i in range(0, usable, 3)
        ]

    raise ValueError(f"unsupported sample width {width * 8}-bit")


def read_aiff(path):
    """Parse uncompressed AIFF and AIFF-C, which Python dropped in 3.13."""
    with open(path, "rb") as handle:
        data = handle.read()

    if data[0:4] != b"FORM" or data[8:12] not in (b"AIFF", b"AIFC"):
        raise ValueError("not an AIFF file")

    channels = rate = width = frames = None
    compression = b"NONE"
    sound = None
    offset = 12

    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        size = struct.unpack(">I", data[offset + 4 : offset + 8])[0]
        body = data[offset + 8 : offset + 8 + size]

        if chunk_id == b"COMM":
            channels, frames, bits = struct.unpack(">hIh", body[0:8])
            rate = int(read_extended(body[8:18]))
            width = (bits + 7) // 8
            if len(body) >= 22:
                compression = body[18:22]
        elif chunk_id == b"SSND":
            start = struct.unpack(">I", body[0:4])[0]
            sound = body[8 + start :]

        offset += 8 + size + (size % 2)

    if sound is None or channels is None:
        raise ValueError("missing COMM or SSND chunk")
    if compression not in (b"NONE", b"sowt", b"twos"):
        raise ValueError(f"compressed AIFF ({compression.decode('ascii', 'replace')})")

    # AIFF is big-endian; AIFF-C 'sowt' is the little-endian variant.
    return channels, rate, frames, width, decode(sound, width, compression != b"sowt")


def read_wav(path):
    with wave.open(path) as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.getnframes()
        raw = handle.readframes(frames)

    return channels, rate, frames, width, decode(raw, width, False)


def as_readable(path, workdir):
    if path.lower().endswith((".wav", ".aif", ".aiff", ".aifc")):
        return path

    out = os.path.join(workdir, os.path.basename(path) + ".wav")
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16", path, out],
        check=True,
        capture_output=True,
    )
    return out


def measure(path):
    reader = read_aiff if path.lower().endswith((".aif", ".aiff", ".aifc")) else read_wav
    channels, rate, frames, width, samples = reader(path)

    if not samples:
        raise ValueError("no samples")

    if channels > 1:
        mono = [
            sum(samples[i : i + channels]) / channels
            for i in range(0, len(samples) - channels + 1, channels)
        ]
    else:
        mono = samples

    full_scale = float(1 << (width * 8 - 1))

    peak = max(abs(s) for s in mono) / full_scale
    rms_full = math.sqrt(sum(s * s for s in mono) / len(mono)) / full_scale

    block = max(1, int(rate * 0.05))
    floor = peak * 0.003
    loud = []
    for i in range(0, max(1, len(mono) - block), block):
        chunk = mono[i : i + block]
        rms = math.sqrt(sum(s * s for s in chunk) / len(chunk)) / full_scale
        if rms > floor:
            loud.append(rms)

    rms_gated = math.sqrt(sum(r * r for r in loud) / len(loud)) if loud else rms_full

    return {
        "duration": frames / rate,
        "rate": rate,
        "channels": channels,
        "bits": width * 8,
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
                rows.append((os.path.basename(path), measure(as_readable(path, workdir))))
            except FileNotFoundError:
                print(f"  skipped {path}: not found", file=sys.stderr)
            except subprocess.CalledProcessError:
                print(f"  skipped {path}: afconvert could not read it", file=sys.stderr)
            except (ValueError, wave.Error, struct.error) as error:
                print(f"  skipped {path}: {error}", file=sys.stderr)

    if not rows:
        print("nothing measured", file=sys.stderr)
        return 1

    width = max(len(name) for name, _ in rows)
    print(
        f"\n{'file':<{width}} {'dur':>5} {'rate':>6} {'ch':>2} {'bits':>4} "
        f"{'peak':>7} {'rms':>7} {'gated':>7} {'active':>7}"
    )
    for name, m in sorted(rows, key=lambda row: db(row[1]["rms_gated"]), reverse=True):
        print(
            f"{name:<{width}} {m['duration']:>5.2f} {m['rate']:>6} {m['channels']:>2} "
            f"{m['bits']:>4} {db(m['peak']):>7.1f} {db(m['rms_full']):>7.1f} "
            f"{db(m['rms_gated']):>7.1f} {m['active']:>6.2f}s"
        )

    gated = [db(m["rms_gated"]) for _, m in rows]
    peaks = [db(m["peak"]) for _, m in rows]
    print(
        f"\nspread — gated {max(gated) - min(gated):.1f} dB, "
        f"peak {max(peaks) - min(peaks):.1f} dB"
    )

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
