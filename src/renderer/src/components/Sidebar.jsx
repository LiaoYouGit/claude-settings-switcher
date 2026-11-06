import { formatRelative } from '../utils'

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

export default function Sidebar({
  profiles,
  activeId,
  selectedId,
  loading,
  onSelect,
  onSwitch,
  onCreate,
  onRename,
  onDuplicate,
  onDelete
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="app-title">Claude 配置切换器</div>
        <div className="app-subtitle">settings.json 多配置管理</div>
      </div>
      <button className="btn new-profile" onClick={onCreate}>
        ＋ 新建配置
      </button>
      <div className="profile-list">
        {loading ? (
          <div className="list-loading">加载中…</div>
        ) : (
          profiles.map((p) => {
            const isActive = p.id === activeId
            const isSelected = p.id === selectedId
            return (
              <div
                key={p.id}
                className={`profile-item ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                onClick={() => onSelect(p.id)}
              >
                <button
                  className={`radio ${isActive ? 'on' : ''}`}
                  title={isActive ? '当前生效配置' : '点击激活此配置'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSwitch(p.id)
                  }}
                />
                <div className="profile-meta">
                  <div className="profile-name">
                    {p.name}
                    {isActive && <span className="badge">生效中</span>}
                  </div>
                  <div className="profile-time">{formatRelative(p.updatedAt)}更新</div>
                </div>
                <div className="item-actions">
                  <button
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRename(p)
                    }}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    title="创建副本"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDuplicate(p)
                    }}
                  >
                    <CopyIcon />
                  </button>
                  <button
                    className="danger"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(p)
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="sidebar-footer">
        与 SwitchHosts 相同的工作方式：所有配置中只有一份会写入 settings.json
      </div>
    </aside>
  )
}
