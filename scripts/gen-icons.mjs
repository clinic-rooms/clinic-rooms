// Regenerate all PWA/OG raster icons from public/icon.svg (uses Next's bundled sharp)
import sharp from "sharp";
import { readFileSync } from "fs";

const svg = readFileSync("public/icon.svg");

await sharp(svg).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(svg).resize(512, 512).png().toFile("public/icon-512.png");

// apple-touch-icon: iOS rounds corners itself, so render square (no rounded rect)
const flat = Buffer.from(readFileSync("public/icon.svg", "utf8").replace('rx="112"', 'rx="0"'));
await sharp(flat).resize(180, 180).png().toFile("public/apple-touch-icon.png");

// maskable: keep the icon within the 80% safe zone over a full-bleed background
const inner = await sharp(svg).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0d9488" } })
  .composite([{ input: inner, top: 51, left: 51 }])
  .png()
  .toFile("public/icon-maskable-512.png");

// favicon.ico-sized png (browsers accept png favicons)
await sharp(svg).resize(48, 48).png().toFile("public/favicon.png");

// Open Graph / WhatsApp share card: 1200x630 teal background with the door centered
const ogBg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
     <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#0d9488"/>
     </linearGradient></defs>
     <rect width="1200" height="630" fill="url(#g)"/>
   </svg>`
);
const ogIcon = await sharp(
  Buffer.from(readFileSync("public/icon.svg", "utf8").replace('fill="url(#bg)"', 'fill="none"'))
)
  .resize(360, 360)
  .png()
  .toBuffer();
await sharp(ogBg)
  .composite([{ input: ogIcon, top: 135, left: 420 }])
  .png()
  .toFile("public/og.png");

console.log("icons + og image generated");
