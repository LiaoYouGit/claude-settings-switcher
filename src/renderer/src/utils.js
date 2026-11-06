export function pretty(content) {
  return JSON.stringify(content, null, 2)
}

export function formatTokens(n) {
  if (!n || n < 1000) return String(Math.round(n || 0))
  const trim1 = (v) => {
    const s = v.toFixed(1)
    return s.endsWith('.0') ? s.slice(0, -2) : s
  }
  if (n < 1e6) return trim1(n / 1e3) + 'K'
  if (n < 1e9) return trim1(n / 1e6) + 'M'
  return trim1(n / 1e9) + 'B'
}

// 用 canvas 生成托盘图标：橙色圆角底 + 当前配置名首字符
export function renderTrayIcon(name) {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, size, size, 7)
  } else {
    ctx.rect(0, 0, size, size)
  }
  ctx.fillStyle = '#e8823c'
  ctx.fill()
  const ch = (name || '').trim().charAt(0).toUpperCase() || '·'
  const isCJK = ch.charCodeAt(0) > 0x2e80
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${isCJK ? 19 : 22}px "Segoe UI", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, size / 2, size / 2 + 1)
  return canvas.toDataURL('image/png')
}

export function formatRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const dt = new Date(ts)
  const pad = (x) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
