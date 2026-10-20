const fs = require("node:fs");
const path = require("node:path");

/*
 * A distinctive rising chirp rather than one of Meru's own sounds, so that
 * "was that the probe or the system default?" is answerable by ear without
 * knowing what Meru's sounds are, and so the probe stays text-only.
 */
const RATE = 44100;
const SECONDS = 0.6;
const samples = Math.floor(RATE * SECONDS);
const pcm = Buffer.alloc(samples * 2);

for (let i = 0; i < samples; i++) {
  const t = i / RATE;
  const progress = t / SECONDS;
  const frequency = 440 + 660 * progress;
  const envelope = Math.min(1, progress * 20) * (1 - progress) ** 0.6;
  const value = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.7;
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const wav = Buffer.concat([header, pcm]);

fs.mkdirSync(path.join(__dirname, "sounds"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "chirp.wav"), wav);
fs.writeFileSync(path.join(__dirname, "sounds", "chirp.wav"), wav);

console.log(`wrote chirp.wav (${wav.length} bytes) to the probe root and sounds/`);
