#!/usr/bin/env node
/**
 * scripts/build-brand-assets.mjs
 *
 * UNB Premium — Automated Brand Assets Generator
 *
 * Sourced from: public/brand/logo-circle.png (original artwork is kept untouched).
 * Generates:
 *   1. Derivative circle images: 64, 96, 128, 192, 256, 512 px (PNG + WebP)
 *   2. Favicons: favicon.ico (16/32/48 multi-size) and favicon-*.png
 *   3. PWA Icons: apple-touch-icon.png (180), icon-192.png, icon-512.png (maskable)
 *   4. Email Logo: public/brand/logo-email.png (2x composite with circle + default palette ribbon)
 *   5. Open Graph: public/brand/og-image.png (1200x630 composite)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const BRAND_DIR = path.join(ROOT, 'public', 'brand');
const PUBLIC_DIR = path.join(ROOT, 'public');

const SOURCE_CIRCLE = path.join(BRAND_DIR, 'logo-circle.png');

if (!fs.existsSync(SOURCE_CIRCLE)) {
  console.error(`❌ Source circle image not found at: ${SOURCE_CIRCLE}`);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// ICO File Builder Helper
// -----------------------------------------------------------------------------
function createIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4);

  const entrySize = 16;
  let offset = 6 + count * entrySize;
  const entries = [];

  for (const img of images) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color palette (0 = no palette)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset
    offset += img.buffer.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...images.map((img) => img.buffer)]);
}

// -----------------------------------------------------------------------------
// SVG Ribbon Generator (for static email and OG composites in Palette A)
// -----------------------------------------------------------------------------
function generateRibbonSvg(width, height, text = 'PREMIUM') {
  const notch = Math.round(width * 0.08); // 8% notch
  const strokeInner = Math.max(1, Math.round(height * 0.035));
  const insetX = Math.round(width * 0.025);
  const insetY = Math.round(height * 0.09);
  const fontSize = Math.round(height * 0.46);
  const textY = Math.round(height * 0.67);
  const letterSpacing = Math.round(width * 0.016);

  // Outer polygon points (notched / dovetail ends)
  const outerPoints = `0,0 ${width},0 ${width - notch},${height / 2} ${width},${height} 0,${height} ${notch},${height / 2}`;

  // Inner border polygon points
  const innerPoints = `${insetX},${insetY} ${width - insetX},${insetY} ${width - notch - insetX * 0.5},${height / 2} ${width - insetX},${height - insetY} ${insetX},${height - insetY} ${notch + insetX * 0.5},${height / 2}`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <!-- Outer Plate -->
      <polygon points="${outerPoints}" fill="#1B2A41" stroke="#8A6A2B" stroke-width="1" />
      <!-- Inner Double Border -->
      <polygon points="${innerPoints}" fill="none" stroke="#B98A3E" stroke-width="${strokeInner}" />
      <!-- Live Text -->
      <text
        x="${width / 2}"
        y="${textY}"
        font-family="Georgia, 'Cormorant Garamond', 'Times New Roman', serif"
        font-size="${fontSize}"
        font-weight="600"
        letter-spacing="${letterSpacing}"
        fill="#FBF8F2"
        text-anchor="middle"
      >${text}</text>
    </svg>
  `.trim();
}

// -----------------------------------------------------------------------------
// Main Build Task
// -----------------------------------------------------------------------------
async function buildBrandAssets() {
  console.log('🎨 UNB Premium — Building Brand Assets from logo-circle.png ...\n');

  // 1. Derivative Circle Sizes (PNG + WebP)
  // sharp.kernel.lanczos3 ensures fine Urdu calligraphy strokes stay ultra-sharp
  const sizes = [64, 96, 128, 192, 256, 512];
  for (const s of sizes) {
    const pngPath = path.join(BRAND_DIR, `logo-circle-${s}.png`);
    const webpPath = path.join(BRAND_DIR, `logo-circle-${s}.webp`);

    await sharp(SOURCE_CIRCLE)
      .resize(s, s, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(pngPath);

    await sharp(SOURCE_CIRCLE)
      .resize(s, s, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 100, lossless: true })
      .toFile(webpPath);

    console.log(`  ✓ Generated circle ${s}x${s} (PNG & WebP, lanczos3 lossless)`);
  }

  // 2. Favicons (16, 32, 48) & favicon.ico
  const fav16 = await sharp(SOURCE_CIRCLE)
    .resize(16, 16, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  const fav32 = await sharp(SOURCE_CIRCLE)
    .resize(32, 32, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  const fav48 = await sharp(SOURCE_CIRCLE)
    .resize(48, 48, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  await sharp(SOURCE_CIRCLE)
    .resize(16, 16, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(BRAND_DIR, 'logo-circle-16.png'));
  await sharp(SOURCE_CIRCLE)
    .resize(32, 32, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(BRAND_DIR, 'logo-circle-32.png'));
  await sharp(SOURCE_CIRCLE)
    .resize(48, 48, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(BRAND_DIR, 'logo-circle-48.png'));

  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: fav16 },
    { width: 32, height: 32, buffer: fav32 },
    { width: 48, height: 48, buffer: fav48 },
  ]);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuffer);
  // Also write to src/app/favicon.ico so Next.js metadata uses the updated asset
  if (fs.existsSync(path.join(ROOT, 'src', 'app', 'favicon.ico'))) {
    fs.writeFileSync(path.join(ROOT, 'src', 'app', 'favicon.ico'), icoBuffer);
  }
  console.log('  ✓ Generated multi-size favicon.ico (16, 32, 48, lanczos3)');

  // 3. Apple Touch Icon (180x180) & PWA Icons (192, 512)
  // Maskable icon requires safe-zone padding (~80% content diameter on #FBF8F2 background)
  const appleTouchCircle = await sharp(SOURCE_CIRCLE)
    .resize(156, 156, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  await sharp({
    create: { width: 180, height: 180, channels: 4, background: '#FBF8F2' },
  })
    .composite([{ input: appleTouchCircle, top: 12, left: 12 }])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('  ✓ Generated apple-touch-icon.png (180x180)');

  const pwa192Circle = await sharp(SOURCE_CIRCLE)
    .resize(152, 152, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  await sharp({
    create: { width: 192, height: 192, channels: 4, background: '#FBF8F2' },
  })
    .composite([{ input: pwa192Circle, top: 20, left: 20 }])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
  console.log('  ✓ Generated icon-192.png (192x192 maskable)');

  const pwa512Circle = await sharp(SOURCE_CIRCLE)
    .resize(410, 410, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: '#FBF8F2' },
  })
    .composite([{ input: pwa512Circle, top: 51, left: 51 }])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
  console.log('  ✓ Generated icon-512.png (512x512 maskable)');

  // 4. Email Pre-rendered Logo (public/brand/logo-email.png)
  // 400x260 canvas @ 2x (displays at 200x130 in email)
  const emailCanvasW = 400;
  const emailCanvasH = 260;
  const emailCircleSize = 200;
  const emailRibbonW = 160;
  const emailRibbonH = 46;

  const emailCircle = await sharp(SOURCE_CIRCLE)
    .resize(emailCircleSize, emailCircleSize, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  const emailRibbon = Buffer.from(generateRibbonSvg(emailRibbonW, emailRibbonH, 'PREMIUM'));

  const emailCircleX = Math.round((emailCanvasW - emailCircleSize) / 2);
  const emailCircleY = 16;
  const emailRibbonX = Math.round((emailCanvasW - emailRibbonW) / 2);
  // Ribbon overlaps bottom of circle by ~16%
  const emailRibbonY = Math.round(emailCircleY + emailCircleSize - emailRibbonH * 0.65);

  await sharp({
    create: {
      width: emailCanvasW,
      height: emailCanvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: emailCircle, top: emailCircleY, left: emailCircleX },
      { input: emailRibbon, top: emailRibbonY, left: emailRibbonX },
    ])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(BRAND_DIR, 'logo-email.png'));
  console.log('  ✓ Generated logo-email.png (400x260 @ 2x)');

  // 5. Open Graph Card (public/brand/og-image.png - 1200x630)
  const ogW = 1200;
  const ogH = 630;
  const ogCircleSize = 260;
  const ogRibbonW = 208;
  const ogRibbonH = 58;

  const ogCircle = await sharp(SOURCE_CIRCLE)
    .resize(ogCircleSize, ogCircleSize, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  const ogRibbon = Buffer.from(generateRibbonSvg(ogRibbonW, ogRibbonH, 'PREMIUM'));

  const ogCircleX = Math.round((ogW - ogCircleSize) / 2);
  const ogCircleY = 70;
  const ogRibbonX = Math.round((ogW - ogRibbonW) / 2);
  const ogRibbonY = Math.round(ogCircleY + ogCircleSize - ogRibbonH * 0.65);

  // Background frame with elegant double border and brand text
  const ogOverlaySvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${ogW}" height="${ogH}" viewBox="0 0 ${ogW} ${ogH}">
      <!-- Outer Frame -->
      <rect x="24" y="24" width="${ogW - 48}" height="${ogH - 48}" rx="20" fill="none" stroke="#E8E1D3" stroke-width="2" />
      <rect x="36" y="36" width="${ogW - 72}" height="${ogH - 72}" rx="14" fill="none" stroke="#B98A3E" stroke-width="1" stroke-opacity="0.4" />
      
      <!-- Brand Subtitle & Mission -->
      <text
        x="${ogW / 2}"
        y="${ogRibbonY + ogRibbonH + 64}"
        font-family="Georgia, 'Cormorant Garamond', 'Times New Roman', serif"
        font-size="44"
        font-weight="700"
        fill="#1B2A41"
        text-anchor="middle"
        letter-spacing="1"
      >URDU NOVEL BANK</text>

      <text
        x="${ogW / 2}"
        y="${ogRibbonY + ogRibbonH + 115}"
        font-family="'Gulzar', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif"
        font-size="28"
        font-weight="500"
        fill="#8A6A2B"
        text-anchor="middle"
        direction="rtl"
      >معیاری اردو فکشن اور ناولز کی خود مختار ڈیجیٹل مارکیٹ پلیس</text>

      <text
        x="${ogW / 2}"
        y="${ogRibbonY + ogRibbonH + 170}"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="16"
        font-weight="600"
        letter-spacing="2"
        fill="#5F6673"
        text-anchor="middle"
      >100% DIRECT READER-TO-WRITER PAYMENTS  •  JAZZCASH  •  EASYPAISA  •  RAAST</text>
    </svg>
  `.trim();

  await sharp({
    create: { width: ogW, height: ogH, channels: 4, background: '#FBF8F2' },
  })
    .composite([
      { input: Buffer.from(ogOverlaySvg), top: 0, left: 0 },
      { input: ogCircle, top: ogCircleY, left: ogCircleX },
      { input: ogRibbon, top: ogRibbonY, left: ogRibbonX },
    ])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(BRAND_DIR, 'og-image.png'));

  // Also write to public/og-image.jpg for backward compatibility
  await sharp(path.join(BRAND_DIR, 'og-image.png'))
    .jpeg({ quality: 95 })
    .toFile(path.join(PUBLIC_DIR, 'og-image.jpg'));

  console.log('  ✓ Generated og-image.png & og-image.jpg (1200x630, quality 100)');

  console.log('\n✅ All brand assets generated successfully!');
}

buildBrandAssets().catch((err) => {
  console.error('❌ Build brand assets failed:', err);
  process.exit(1);
});
