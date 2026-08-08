/**
 * Run this script with Node.js to generate extension icon PNGs.
 * Usage: node generate-icons.js
 *
 * Creates minimal valid PNG files (solid dark blue squares).
 * Replace with proper icons later via the generate-icons.html page.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = (() => {
  // Try to use canvas package if available, otherwise create minimal PNGs
  try {
    return require('canvas');
  } catch {
    return null;
  }
})();

function createMinimalPng(size) {
  // Create a minimal valid 1x1 PNG and scale conceptually
  // This creates a tiny valid PNG with IHDR + IDAT + IEND
  // For a proper icon, use the HTML generator or canvas package

  const width = size;
  const height = size;

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk — raw pixel data (uncompressed via zlib stored block)
  // Color: #1E2735 (BasePaint dark blue)
  const rawRow = Buffer.alloc(1 + width * 3); // filter byte + RGB per pixel
  rawRow[0] = 0; // no filter
  for (let x = 0; x < width; x++) {
    rawRow[1 + x * 3] = 0x1e; // R
    rawRow[2 + x * 3] = 0x27; // G
    rawRow[3 + x * 3] = 0x35; // B
  }

  // Repeat for all rows
  const allRows = Buffer.concat(Array(height).fill(rawRow));

  // Wrap in zlib (deflate stored block — no compression)
  const zlibData = createStoredZlib(allRows);
  const idat = createChunk('IDAT', zlibData);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createStoredZlib(data) {
  // Zlib header (no compression)
  const header = Buffer.from([0x78, 0x01]);

  // Split into stored blocks (max 65535 bytes each)
  const blocks = [];
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockSize = Math.min(remaining, 65535);
    const isLast = offset + blockSize >= data.length;

    const blockHeader = Buffer.alloc(5);
    blockHeader[0] = isLast ? 0x01 : 0x00;
    blockHeader.writeUInt16LE(blockSize, 1);
    blockHeader.writeUInt16LE(blockSize ^ 0xffff, 3);

    blocks.push(blockHeader);
    blocks.push(data.slice(offset, offset + blockSize));
    offset += blockSize;
  }

  // Adler-32 checksum
  const adler = adler32(data);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(adler, 0);

  return Buffer.concat([header, ...blocks, checksum]);
}

// CRC-32 implementation
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Adler-32 implementation
function adler32(buf) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Generate icons
const iconsDir = __dirname;
for (const size of [16, 48, 128]) {
  const png = createMinimalPng(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
}

console.log('\nDone! Replace these with proper icons using icons/generate-icons.html');
