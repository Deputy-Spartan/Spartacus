// Draws the plugin icon as a PNG (Elgato needs PNG for the main icon): the
// Spartacus helmet in steel blue on a dark rounded tile. No image libraries,
// just a tiny rasterizer and Node's zlib.
import { deflateSync } from "node:zlib";

function crc32(buf) {
  let c;
  const table = (crc32.t ??= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Inside tests, in a 64x64 design space.
const inRounded = (x, y, s) => {
  const r = 12;
  const cx = Math.min(Math.max(x, r), s - r);
  const cy = Math.min(Math.max(y, r), s - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
// The helmet: a dome with cheek guards, a visor slot, and a crest stripe.
function helmet(x, y) {
  const dome = (x - 32) ** 2 / 18 ** 2 + (y - 28) ** 2 / 20 ** 2 <= 1 && y <= 40;
  const cheeks = y > 38 && y < 56 && ((x > 16 && x < 28) || (x > 36 && x < 48)) && Math.abs(x - 32) < 17 - (y - 38) * 0.15;
  const visor = y > 30 && y < 38 && x > 24 && x < 40;
  const crest = x > 30 && x < 34 && y > 6 && y < 30;
  if (crest) return "crest";
  if (visor) return "visor";
  return dome || cheeks ? "metal" : null;
}

export function iconPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 4; // 4x4 samples per pixel, for smooth edges
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const x = ((px + (sx + 0.5) / S) / size) * 64;
          const y = ((py + (sy + 0.5) / S) / size) * 64;
          if (!inRounded(x, y, 64)) continue;
          let c = [28, 29, 32];
          const h = helmet(x, y);
          if (h === "metal") {
            const t = (x + y) / 128; // light top-left to darker bottom-right
            c = [Math.round(159 - 65 * t), Math.round(182 - 55 * t), Math.round(211 - 45 * t)];
          } else if (h === "visor") c = [18, 19, 22];
          else if (h === "crest") c = [217, 227, 239];
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      const n = S * S;
      const i = py * (size * 4 + 1) + 1 + px * 4;
      const cover = a / n;
      raw[i] = cover ? Math.round(r / (a / 255)) : 0;
      raw[i + 1] = cover ? Math.round(g / (a / 255)) : 0;
      raw[i + 2] = cover ? Math.round(b / (a / 255)) : 0;
      raw[i + 3] = Math.round(cover);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
