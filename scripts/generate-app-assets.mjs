/**
 * Regenerates every launcher / notification / splash asset from two brand masters.
 *
 *   node scripts/generate-app-assets.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * Android does not use one icon file. It uses several, each with different and
 * fairly unforgiving geometry rules, and getting any of them wrong produces a
 * broken-looking icon that you only discover after a 20-minute EAS build. This
 * script encodes those rules once so the whole set can be rebuilt deterministically
 * whenever the brand artwork changes.
 *
 * THE THREE RULES THAT DRIVE EVERYTHING HERE
 * ------------------------------------------
 * 1. ADAPTIVE ICON SAFE ZONE (launcher).
 *    Android composites a 108x108dp foreground over a 108x108dp background, then
 *    masks the result to whatever shape the launcher wants (circle, squircle,
 *    teardrop...). Only the centre 72x72dp is guaranteed to survive — the outer
 *    ring is "bleed" that may or may not be shown. That is 66.6% of the canvas,
 *    so any artwork must be pre-shrunk into that centre region.
 *    STEADY's logo is a full-width wordmark, which without shrinking loses the
 *    leading "S" and the trailing dot entirely. Measured overflow: 142px on a
 *    1024 canvas. Hence SAFE_FRACTION below.
 *
 * 2. NOTIFICATION ICONS ARE ALPHA MASKS, NOT IMAGES.
 *    Since Android 5, the status-bar icon is drawn by taking the alpha channel
 *    and painting every opaque pixel a single flat colour. All RGB data is
 *    discarded. Ship a full-colour icon and you get a solid white blob — which
 *    is exactly what STEADY shipped, because app.json pointed the notification
 *    icon at the full-colour ./assets/icon.png.
 *    A wordmark also fails here for a different reason: at the real 24dp render
 *    size the letters collapse into an unreadable smear. So notifications get a
 *    dedicated compact "S." monogram instead of the wordmark.
 *
 * 3. THE ANDROID 12+ SPLASH IS CIRCLE-MASKED.
 *    android/app/src/main/res/values/styles.xml wires the splash through
 *    `windowSplashScreenAnimatedIcon`, the Android 12 SplashScreen API. The
 *    system draws that image inside a 240dp area but only reveals the inner
 *    160dp circle — again 2/3. A wide illustration with callout labels spread
 *    across it cannot survive; only a centred, roughly circular subject can.
 *    That is why the native splash is the bowl alone. The full bowl+callouts
 *    composition lives in the in-app splash React component instead, where it
 *    is real layout with real fonts and no mask.
 *
 * Masters (checked in under assets/store/, never overwritten by this script):
 *   steady-icon-1024.png — the STEADY wordmark logo, 1024x1024
 *   bowl-source.jpg      — the Welcome screen's bowl photo, bundled locally
 *                          because a native splash renders before JS starts and
 *                          therefore cannot fetch the remote Unsplash URL that
 *                          WelcomeScreen.tsx uses at runtime.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

const LOGO = p('assets/store/steady-icon-1024.png');
const BOWL = p('assets/store/bowl-source.jpg');

// Centre fraction of an adaptive-icon canvas that is guaranteed visible (72/108).
const SAFE_FRACTION = 72 / 108;

// The logo's own background gradient, sampled from the master's corners.
const NAVY_LIGHT = '#1b2337';
const NAVY_DARK = '#0b1120';

// Matches colors.bgPrimary, so the splash dissolves into the first real screen
// instead of flashing a different colour. The old value was #E6F4FE, a leftover
// from the Expo template that matched nothing in the app.
const SPLASH_BG = '#FAFAFA';

const circleMask = (size) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );

/** Measures the bounding box of the bright (wordmark) pixels in the master. */
async function measureContent(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum > 140) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cx = w / 2, cy = h / 2;
  const radius = Math.max(
    Math.hypot(minX - cx, minY - cy), Math.hypot(maxX - cx, minY - cy),
    Math.hypot(minX - cx, maxY - cy), Math.hypot(maxX - cx, maxY - cy),
  );
  return { w, h, minX, maxX, minY, maxY, radius };
}

/**
 * Extracts just the wordmark as white-on-transparent by thresholding luminance.
 * This is the same transform Android applies to a notification icon, done ahead
 * of time so we can control the result instead of discovering it on-device.
 */
async function silhouette(file, size) {
  const { data, info } = await sharp(file).removeAlpha().resize(size, size).raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const lum = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
    const on = lum > 140;
    out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255;
    out[i * 4 + 3] = on ? 255 : 0;
  }
  return sharp(out, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

async function main() {
  const S = 1024;
  const content = await measureContent(LOGO);
  const safeRadius = S * (SAFE_FRACTION / 2);
  // Shrink so the furthest content pixel lands just inside the safe circle.
  const fit = (safeRadius / content.radius) * 0.95;
  console.log(
    `logo content radius ${Math.round(content.radius)}px vs safe ${Math.round(safeRadius)}px ` +
    `-> scaling foreground to ${(fit * 100).toFixed(1)}%`,
  );

  // ---- 1. iOS / base icon -------------------------------------------------
  // iOS applies a squircle whose corner radius only eats the corners; the
  // horizontal centre band where the wordmark sits stays fully visible, so the
  // master goes in untouched and full-bleed.
  await sharp(LOGO).resize(S, S).png().toFile(p('assets/icon.png'));

  // ---- 2. Android adaptive foreground ------------------------------------
  // Transparent outside the artwork: the background layer supplies the colour.
  const fgArt = await sharp(LOGO).resize(Math.round(S * fit), Math.round(S * fit)).toBuffer();
  await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fgArt, gravity: 'center' }])
    .png().toFile(p('assets/android-icon-foreground.png'));

  // ---- 3. Android adaptive background ------------------------------------
  // Full-bleed navy gradient so the outer bleed ring never shows a hard edge,
  // whatever mask shape the launcher picks.
  const bgSvg = Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<radialGradient id="g" cx="32%" cy="24%" r="95%">` +
    `<stop offset="0%" stop-color="${NAVY_LIGHT}"/><stop offset="100%" stop-color="${NAVY_DARK}"/>` +
    `</radialGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/></svg>`,
  );
  await sharp(bgSvg).png().toFile(p('assets/android-icon-background.png'));

  // ---- 4. Android 13+ themed (monochrome) icon ---------------------------
  // Same alpha-mask rule as notifications, but rendered at launcher size where
  // the wordmark is still legible — so this one keeps the wordmark.
  const monoSize = 1024;
  const mono = await silhouette(LOGO, Math.round(monoSize * fit));
  await sharp({ create: { width: monoSize, height: monoSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mono, gravity: 'center' }])
    .png().toFile(p('assets/android-icon-monochrome.png'));

  // ---- 5. Notification icon ----------------------------------------------
  // A compact "S." monogram: the wordmark is unreadable at 24dp, but the
  // monogram survives down to mdpi while still echoing the logo's trailing dot.
  const N = 96;
  const notif = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 512 512">` +
    `<text x="236" y="262" font-family="DejaVu Sans,Helvetica,Arial,sans-serif" font-size="340" ` +
    `font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central">S</text>` +
    `<circle cx="424" cy="372" r="40" fill="#fff"/></svg>`,
  );
  await sharp(notif).png().toFile(p('assets/notification-icon.png'));

  // ---- 6. Web favicon -----------------------------------------------------
  await sharp(LOGO).resize(48, 48).png().toFile(p('assets/favicon.png'));

  // ---- 7. Splash ----------------------------------------------------------
  // Circular bowl with the same white ring the Welcome screen draws, sized to
  // sit inside the Android 12 splash mask. Transparent surround so the plugin's
  // backgroundColor shows through.
  const SP = 1024;
  const bowlD = Math.round(SP * SAFE_FRACTION * 0.92);
  const ring = 14;
  const bowl = await sharp(BOWL).resize(bowlD, bowlD, { fit: 'cover' })
    .composite([{ input: circleMask(bowlD), blend: 'dest-in' }]).png().toBuffer();
  const ringSvg = Buffer.from(
    `<svg width="${SP}" height="${SP}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${SP / 2}" cy="${SP / 2}" r="${bowlD / 2 + ring / 2}" fill="none" stroke="#FFFFFF" stroke-width="${ring}"/></svg>`,
  );
  await sharp({ create: { width: SP, height: SP, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: bowl, gravity: 'center' }, { input: ringSvg }])
    .png().toFile(p('assets/splash-icon.png'));

  console.log('wrote icon / adaptive fg+bg / monochrome / notification / favicon / splash');
  console.log(`splash background should be ${SPLASH_BG} (matches colors.bgPrimary)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
