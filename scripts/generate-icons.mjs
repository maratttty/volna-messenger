// Generates PWA icon PNGs from the branded SVG source.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src  = path.join(root, 'public', 'freeword-icon.svg');
const pub  = path.join(root, 'public');

const svg = readFileSync(src);

const icons = [
  { name: 'pwa-512x512.png',           size: 512 },
  { name: 'pwa-192x192.png',           size: 192 },
  { name: 'apple-touch-icon.png',      size: 180 },
  { name: 'pwa-maskable-512x512.png',  size: 512 },
  { name: 'pwa-maskable-192x192.png',  size: 192 },
];

for (const { name, size } of icons) {
  await sharp(svg).resize(size, size).toFile(path.join(pub, name));
  console.log(`✓ ${name}`);
}

// Also replace favicon.svg reference with a small ICO-like favicon
await sharp(svg).resize(32, 32).toFile(path.join(pub, 'favicon-32.png'));
console.log('✓ favicon-32.png');

console.log('\nAll icons generated.');
