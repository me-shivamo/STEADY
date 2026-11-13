// Contract between the NATIVE splash (app.json → expo-splash-screen config
// plugin → generated Android/iOS resources) and the React splash
// (src/components/common/AnimatedSplash.tsx).
//
// TASKS.md item 2: on a real phone the user saw two splash screens — the native
// one showing the bowl, then AnimatedSplash drawing the bowl again with text.
// The fix is that the native splash is EMPTY (#FAFAFA, no image) and
// AnimatedSplash's first frame is the same empty #FAFAFA, so the handover is
// invisible and only the branded splash is ever seen.
//
// Nothing in the app reads app.json at runtime, so nothing else would notice
// if someone points the splash back at an image or changes one of the two
// colours. These tests do.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { colors } from '../../src/theme/colors';

const ROOT = path.resolve(__dirname, '../..');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));

function splashPluginConfig(): Record<string, any> {
  const entry = (appJson.expo.plugins as unknown[]).find(
    (p): p is [string, Record<string, any>] => Array.isArray(p) && p[0] === 'expo-splash-screen',
  );
  if (!entry) throw new Error('expo-splash-screen plugin with options not found in app.json');
  return entry[1];
}

/**
 * Minimal PNG decoder for 8-bit RGBA, non-interlaced — enough to answer "is
 * every pixel fully transparent?" without adding an image dependency. Throws
 * on any other PNG flavour so a future asset swap fails loudly rather than
 * being silently skipped.
 */
function maxAlpha(file: string): number {
  const buf = fs.readFileSync(file);
  if (buf.toString('latin1', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = data.subarray(8, 13);
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`${file}: expected 8-bit RGBA non-interlaced PNG`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  let prev = Buffer.alloc(stride);
  let max = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + pred) & 0xff;
    }
    for (let i = 3; i < stride; i += bpp) max = Math.max(max, line[i]);
    prev = line;
  }
  return max;
}

describe('native splash ↔ AnimatedSplash contract (TASKS.md item 2)', () => {
  it('native splash background is the same colour AnimatedSplash paints', () => {
    expect(splashPluginConfig().backgroundColor.toUpperCase()).toBe(colors.bgPrimary.toUpperCase());
  });

  it('native splash image is fully transparent, so no artwork shows before AnimatedSplash', () => {
    const image = splashPluginConfig().image;
    expect(typeof image).toBe('string');
    expect(maxAlpha(path.join(ROOT, image))).toBe(0);
  });

  it('has no platform/dark override that could bring an image or another colour back', () => {
    const cfg = splashPluginConfig();
    // Any of these would take precedence over the top-level image/backgroundColor
    // on one platform or theme. If one is ever needed, extend the checks above to it.
    expect(cfg.android).toBeUndefined();
    expect(cfg.ios).toBeUndefined();
    expect(cfg.dark).toBeUndefined();
    expect(appJson.expo.splash).toBeUndefined();
    expect(appJson.expo.android?.splash).toBeUndefined();
    expect(appJson.expo.ios?.splash).toBeUndefined();
  });
});
