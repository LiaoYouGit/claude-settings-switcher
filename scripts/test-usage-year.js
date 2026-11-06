const fs = require('fs')
const path = require('path')
const os = require('os')
const now = new Date()
const since = new Date(now.getFullYear(), 0, 1).getTime()
const t0 = Date.now()
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
const t1 = Date.now()
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
    const s = { i: e.message.usage.input_tokens || 0, o: e.message.usage.output_tokens || 0, cw: e.message.usage.cache_creation_input_tokens || 0, cr: e.message.usage.cache_read_input_tokens || 0 }
    const p = perId.get(e.message.id)
    if (p) {
      for (const k of ['i', 'o', 'cw', 'cr']) if (s[k] > p[k]) p[k] = s[k]
    } else perId.set(e.message.id, s)
  }
}
const t2 = Date.now()
let sum = 0
for (const p of perId.values()) sum += p.i + p.o + p.cw + p.cr
console.log(`今年: ${files.length} 个文件, 去重后 ${perId.size} 条, 合计 ${sum} tokens`)
console.log(`扫描+解析耗时: ${t2 - t0}ms (walk ${t1 - t0}ms)`)
