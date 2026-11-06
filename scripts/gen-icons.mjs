// 一次性脚本：生成托盘默认图标和应用图标（纯 Node，无依赖）
// 用法：node scripts/gen-icons.mjs
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const resDir = path.join(root, 'resources')
fs.mkdirSync(resDir, { recursive: true })

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size * 4; x++) raw[y * (size * 4 + 1) + 1 + x] = pixels[y * size * 4 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const ORANGE = [232, 130, 60]
const WHITE = [255, 255, 255]

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function sdRing(px, py, cx, cy, rMid, halfThick) {
  return Math.abs(Math.hypot(px - cx, py - cy) - rMid) - halfThick
}

// 设计稿 256x256：圆角方块 + 电源符号（圆环 + 竖条）
function render(size) {
  const px = new Uint8Array(size * size * 4)
  const s = size / 256
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / s
      const dy = (y + 0.5) / s
      const bg = -sdRoundRect(dx, dy, 128, 128, 128, 128, 56)
      const ring = -sdRing(dx, dy, 128, 140, 60, 15)
      const bar = -sdRoundRect(dx, dy, 128, 116, 14, 44, 14)
      const glyph = Math.max(ring, bar)
      const aBg = Math.max(0, Math.min(1, bg + 0.5))
      const aGly = Math.max(0, Math.min(1, glyph + 0.5))
      const i = (y * size + x) * 4
      px[i] = Math.round(ORANGE[0] * (1 - aGly) + WHITE[0] * aGly)
      px[i + 1] = Math.round(ORANGE[1] * (1 - aGly) + WHITE[1] * aGly)
      px[i + 2] = Math.round(ORANGE[2] * (1 - aGly) + WHITE[2] * aGly)
      px[i + 3] = Math.round(aBg * 255)
    }
  }
  return encodePNG(size, px)
}

fs.writeFileSync(path.join(resDir, 'tray-default.png'), render(32))
fs.writeFileSync(path.join(resDir, 'icon.png'), render(256))
console.log('icons generated:', resDir)
