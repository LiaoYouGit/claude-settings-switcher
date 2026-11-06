import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import * as store from './store'

const CACHE_TTL = 15000
const cacheMap = new Map()

export function claudeProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects')
}

function trim1(v) {
  const s = v.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

export function formatTokens(n) {
  if (!n || n < 1000) return String(Math.round(n || 0))
  if (n < 1e6) return trim1(n / 1e3) + 'K'
  if (n < 1e9) return trim1(n / 1e6) + 'M'
  return trim1(n / 1e9) + 'B'
}

// 本地时区区间：offset 0 = 当前周期，负数往前翻
function rangeFor(period, offset) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  if (period === 'month') {
    return {
      start: new Date(y, m + offset, 1).getTime(),
      end: new Date(y, m + offset + 1, 1).getTime()
    }
  }
  if (period === 'year') {
    return {
      start: new Date(y + offset, 0, 1).getTime(),
      end: new Date(y + offset + 1, 0, 1).getTime()
    }
  }
  return {
    start: new Date(y, m, d + offset).getTime(),
    end: new Date(y, m, d + offset + 1).getTime()
  }
}

function emptyStats() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, sum: 0 }
}

function add(dst, u) {
  dst.input += u.input
  dst.output += u.output
  dst.cacheWrite += u.cacheWrite
  dst.cacheRead += u.cacheRead
  dst.sum = dst.input + dst.output + dst.cacheWrite + dst.cacheRead
}

// 同一条 API 响应会以多条 JSONL 记录写入（流式分块），usage 相同，取各字段最大值
function mergeMax(dst, src) {
  for (const k of ['input', 'output', 'cacheWrite', 'cacheRead']) {
    if (src[k] > dst[k]) dst[k] = src[k]
  }
}

async function walkJsonl(dir, since, out, depth) {
  if (depth > 6) return
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walkJsonl(full, since, out, depth + 1)
    } else if (e.isFile() && e.name.endsWith('.jsonl')) {
      try {
        const st = await fsp.stat(full)
        if (st.mtimeMs >= since) out.push(full)
      } catch {
        // 忽略无法 stat 的文件
      }
    }
  }
}

function pickUsage(u) {
  const cc = Number(u.cache_creation_input_tokens) || 0
  let cacheObj = 0
  if (u.cache_creation && typeof u.cache_creation === 'object') {
    cacheObj =
      (Number(u.cache_creation.ephemeral_5m_input_tokens) || 0) +
      (Number(u.cache_creation.ephemeral_1h_input_tokens) || 0)
  }
  return {
    input: Number(u.input_tokens) || 0,
    output: Number(u.output_tokens) || 0,
    cacheWrite: cc > 0 ? cc : cacheObj,
    cacheRead: Number(u.cache_read_input_tokens) || 0
  }
}

export async function getUsage({ period = 'day', offset = 0, force = false } = {}) {
  if (!['day', 'month', 'year'].includes(period)) period = 'day'
  offset = Number(offset)
  offset = Number.isFinite(offset) ? Math.max(-3650, Math.min(0, Math.trunc(offset))) : 0

  const key = `${period}:${offset}`
  const now = Date.now()
  const hit = cacheMap.get(key)
  if (!force && hit && now - hit.at < CACHE_TTL) return hit.data

  const range = rangeFor(period, offset)
  const files = []
  await walkJsonl(claudeProjectsDir(), range.start, files, 0)

  const state = await store.readState()
  const history = Array.isArray(state.switchHistory) ? state.switchHistory : []

  const perId = new Map()
  for (const f of files) {
    let content
    try {
      content = await fsp.readFile(f, 'utf8')
    } catch {
      continue
    }
    if (!content.includes('"usage"')) continue
    for (const line of content.split('\n')) {
      if (line.length < 50 || !line.includes('"usage"')) continue
      let e
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      if (!e || e.type !== 'assistant' || !e.message || !e.message.usage) continue
      const ts = Date.parse(e.timestamp)
      if (!Number.isFinite(ts) || ts < range.start || ts >= range.end) continue
      const id = e.message.id
      const usage = pickUsage(e.message.usage)
      const prev = perId.get(id)
      if (prev) {
        mergeMax(prev.usage, usage)
      } else {
        perId.set(id, { usage, ts })
      }
    }
  }

  const totals = emptyStats()
  const unattributed = emptyStats()
  const byProfile = {}
  for (const { usage, ts } of perId.values()) {
    // 归因：取时间戳之前最近一次切换记录指向的配置
    let pid = null
    for (const h of history) {
      if (h.at <= ts) pid = h.profileId
      else break
    }
    add(totals, usage)
    if (!pid) {
      add(unattributed, usage)
    } else {
      let bucket = byProfile[pid]
      if (!bucket) {
        bucket = emptyStats()
        byProfile[pid] = bucket
      }
      add(bucket, usage)
    }
  }
  totals.messages = perId.size

  const data = {
    period,
    offset,
    rangeStart: range.start,
    rangeEnd: range.end,
    totals,
    unattributed,
    byProfile,
    generatedAt: now
  }
  cacheMap.set(key, { at: now, data })
  if (cacheMap.size > 50) {
    cacheMap.delete(cacheMap.keys().next().value)
  }
  return data
}
