import { useEffect, useState } from 'react'

function Overlay({ children, onClose }) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose()
      }}
    >
      {children}
    </div>
  )
}

export function ConfirmModal({ title, message, danger, confirmText, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        <div className="modal-message">{message}</div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className={`btn ${danger ? 'danger-solid' : 'primary'}`} onClick={confirm} disabled={busy}>
            {confirmText || '确定'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export function InputModal({ title, label, initial, placeholder, onSubmit, onClose }) {
  const [value, setValue] = useState(initial || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!value.trim()) {
      setError('名称不能为空')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value.trim())
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        <label className="modal-label">{label}</label>
        <input
          className="modal-input"
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) submit()
          }}
        />
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            确定
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export function BackupsModal({ onClose, onToast }) {
  const [backups, setBackups] = useState(null)
  const [confirming, setConfirming] = useState(null)

  const load = () => {
    window.api
      .listBackups()
      .then(setBackups)
      .catch((e) => {
        setBackups([])
        onToast(e.message, 'err')
      })
  }

  useEffect(load, [])

  const restore = async (filename) => {
    try {
      await window.api.restoreBackup(filename)
      onToast('已恢复该备份，settings.json 已更新')
      load()
    } catch (e) {
      onToast(e.message, 'err')
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="modal modal-wide">
        <div className="modal-title">备份记录</div>
        <div className="modal-desc">
          每次切换配置前，当前的 settings.json 会自动备份到这里（最多保留 20 份）。
        </div>
        <div className="backup-list">
          {backups === null ? (
            <div className="list-loading">加载中…</div>
          ) : backups.length === 0 ? (
            <div className="list-loading">暂无备份</div>
          ) : (
            backups.map((b) => (
              <div key={b.filename} className="backup-item">
                <span className="backup-time">{b.timestamp}</span>
                <span className="backup-size">{(b.size / 1024).toFixed(1)} KB</span>
                <button className="btn ghost small" onClick={() => setConfirming(b)}>
                  恢复
                </button>
              </div>
            ))
          )}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => window.api.openBackups().catch((e) => onToast(e.message, 'err'))}>
            打开备份目录
          </button>
          <button className="btn primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      {confirming && (
        <ConfirmModal
          title="恢复备份"
          message={`将把 ${confirming.timestamp} 的备份内容写入 settings.json（当前文件会先自动备份）。确定恢复？`}
          confirmText="恢复"
          onConfirm={async () => {
            await restore(confirming.filename)
          }}
          onClose={() => setConfirming(null)}
        />
      )}
    </Overlay>
  )
}
