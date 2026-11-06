const fs = require('fs')
const path = require('path')
const os = require('os')
const d = new Date()
d.setHours(0, 0, 0, 0)
const since = d.getTime()
const files = []
;(function walk(dir, depth) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const f = path.join(dir, e.name)
    if (e.isDirectory() && depth < 6) walk(f, depth + 1)
    else if (e.isFile() && e.name.endsWith('.jsonl')) {
      try {
        if (fs.statSync(f).mtimeMs >= since) files.push(f)
      } catch {}
    }
  }
})(path.join(os.homedir(), '.claude', 'projects'), 0)

const perId = new Map()
for (const f of files) {
  let c
  try {
    c = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  for (const line of c.split('\n')) {
    if (line.length < 50 || !line.includes('"usage"')) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (!e || e.type !== 'assistant' || !e.message || !e.message.usage) continue
    const ts = Date.parse(e.timestamp)
    if (!Number.isFinite(ts) || ts < since) continue
    const id = e.message.id
    const u = e.message.usage
    const s = { i: u.input_tokens || 0, o: u.output_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0 }
    const p = perId.get(id)
    if (p) {
      for (const k of ['i', 'o', 'cw', 'cr']) if (s[k] > p[k]) p[k] = s[k]
    } else perId.set(id, s)
  }
}
let ti = 0, to = 0, tcw = 0, tcr = 0
for (const p of perId.values()) {
  ti += p.i; to += p.o; tcw += p.cw; tcr += p.cr
}
console.log('files:', files.length, '| messages(去重后):', perId.size)
console.log('今日输入:', ti, '输出:', to, '缓存写:', tcw, '缓存读:', tcr, '合计:', ti + to + tcw + tcr)
