// Generates simple PNG app icons (green rounded square + leaf) without any image library.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const bg = [27, 94, 32], leaf = [165, 214, 167], stem = [232, 245, 233]
  const r = size * 0.22
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4
      // rounded square mask
      const dx = Math.max(r - x, x - (size - 1 - r), 0), dy = Math.max(r - y, y - (size - 1 - r), 0)
      const inside = dx * dx + dy * dy <= r * r
      let col = inside ? bg : [0, 0, 0], a = inside ? 255 : 0
      const nx = x / size, ny = y / size
      // stem
      if (inside && Math.abs(nx - 0.5) < 0.035 && ny > 0.45 && ny < 0.82) col = stem
      // two leaves (ellipses)
      const ell = (cx, cy, rx, ry, rot) => {
        const px = nx - cx, py = ny - cy
        const c = Math.cos(rot), s = Math.sin(rot)
        const u = px * c + py * s, v = -px * s + py * c
        return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1
      }
      if (inside && (ell(0.36, 0.42, 0.17, 0.08, -0.7) || ell(0.64, 0.36, 0.17, 0.08, 0.7))) col = leaf
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s))
console.log('icons written')
