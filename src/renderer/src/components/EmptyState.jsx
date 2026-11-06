export default function EmptyState({ settingsExists, onImport, onCreate }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      </div>
      <div className="empty-title">还没有任何配置</div>
      <div className="empty-desc">
        创建多个 Claude Code 的 settings.json 配置方案，一键切换，任意时刻只有一份生效。
      </div>
      <div className="empty-actions">
        <button className="btn primary" onClick={onImport} disabled={!settingsExists}>
          导入当前 settings.json
        </button>
        <button className="btn" onClick={onCreate}>
          新建空白配置
        </button>
      </div>
      {!settingsExists && (
        <div className="empty-warn">未找到 ~/.claude/settings.json，可先新建空白配置</div>
      )}
    </div>
  )
}
