import { useCallback, useEffect, useState } from 'react'
import { formatTokens } from '../utils'

const PERIODS = [
  { key: 'day', label: '日' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' }
]

const pad2 = (x) => String(x).padStart(2, '0')

function periodLabel(period, offset) {
  const now = new Date()
  if (period === 'day') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const s = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    return offset === 0 ? `${s}（今天）` : s
  }
  if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const s = `${d.getFullYear()}年${d.getMonth() + 1}月`
    return offset === 0 ? `${s}（本月）` : s
  }
  const s = `${now.getFullYear() + offset}年`
  return offset === 0 ? `${s}（今年）` : s
}

function StatsRow({ name, active, dim, stats, total }) {
  const pct = total > 0 ? (stats.sum / total) * 100 : 0
  return (
    <div className={`usage-row ${active ? 'usage-row-active' : ''} ${dim ? 'usage-row-dim' : ''}`}>
      <div className="usage-row-head">
        <span className="usage-row-name">
          {name}
          {active && <span className="badge">生效中</span>}
        </span>
        <span className="usage-row-sum">
          {formatTokens(stats.sum)} <i>tokens</i>
        </span>
      </div>
      <div className="usage-bar">
        <div className="usage-bar-fill" style={{ width: `${Math.max(pct, stats.sum > 0 ? 1.5 : 0)}%` }} />
      </div>
      <div className="usage-row-detail">
        输入 {formatTokens(stats.input)} · 输出 {formatTokens(stats.output)} · 缓存写{' '}
        {formatTokens(stats.cacheWrite)} · 缓存读 {formatTokens(stats.cacheRead)}
      </div>
    </div>
  )
}

export function UsageModal({ profiles, activeId, onClose, onToast }) {
  const [period, setPeriod] = useState('day')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    (force) => {
      setLoading(true)
      return window.api
        .getUsage({ period, offset, force })
        .then((d) => {
          setData(d)
          setLoading(false)
        })
        .catch((e) => {
          onToast(e.message, 'err')
          setLoading(false)
        })
    },
    [period, offset]
  )

  useEffect(() => {
    load(false)
  }, [load])

  // 打开期间自动刷新当前选择
  useEffect(() => {
    const t = setInterval(() => load(false), 15000)
    return () => clearInterval(t)
  }, [load])

  let rows = []
  let total = 0
  if (data) {
    total = data.totals.sum
    const known = new Set(profiles.map((p) => p.id))
    for (const p of profiles) {
      const s = data.byProfile[p.id]
      if (s) rows.push({ name: p.name, active: p.id === activeId, stats: s })
    }
    for (const pid of Object.keys(data.byProfile)) {
      if (!known.has(pid)) rows.push({ name: '已删除的配置', active: false, stats: data.byProfile[pid] })
    }
    if (data.unattributed.sum > 0) {
      rows.push({
        name: '未归因（切换记录之前的用量）',
        active: false,
        dim: true,
        stats: data.unattributed
      })
    }
    rows.sort((a, b) => b.stats.sum - a.stats.sum)
  }

  const t = data ? data.totals : null
  const updated = data ? new Date(data.generatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : ''

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-title">Token 用量统计</div>

        <div className="usage-nav">
          <div className="usage-tabs">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`usage-tab ${period === p.key ? 'on' : ''}`}
                onClick={() => {
                  setPeriod(p.key)
                  setOffset(0)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="icon-btn" title="上一周期" disabled={offset <= -3650} onClick={() => setOffset((o) => o - 1)}>
            ◀
          </button>
          <span className="usage-range">{periodLabel(period, offset)}</span>
          <button className="icon-btn" title="下一周期" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}>
            ▶
          </button>
          {loading && <span className="usage-loading">统计中…</span>}
        </div>

        {t && (!loading || total > 0) ? (
          <>
            <div className="usage-total">
              <span className="usage-total-num">{formatTokens(t.sum)}</span>
              <span className="usage-total-unit">tokens</span>
              <span className="usage-total-sub">
                {t.messages != null ? `共 ${t.messages} 条响应 · ` : ''}
                输入 {formatTokens(t.input)} · 输出 {formatTokens(t.output)} · 缓存写{' '}
                {formatTokens(t.cacheWrite)} · 缓存读 {formatTokens(t.cacheRead)}
              </span>
            </div>
            <div className="usage-list">
              {rows.length === 0 ? (
                <div className="list-loading">该时间段还没有记录</div>
              ) : (
                rows.map((r, i) => (
                  <StatsRow key={i} name={r.name} active={r.active} dim={r.dim} stats={r.stats} total={total} />
                ))
              )}
            </div>
            <div className="usage-note">
              按「本工具的切换记录」归因到各配置；数据来自 ~/.claude/projects 会话日志。Claude Code
              官方 /cost 口径（含价格）可能与此略有差异。更新于 {updated}
            </div>
          </>
        ) : (
          <div className="list-loading">统计中…</div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => load(true)}>
            刷新
          </button>
          <button className="btn primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
