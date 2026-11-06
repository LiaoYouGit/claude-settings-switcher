import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import EmptyState from './components/EmptyState'
import { ConfirmModal, InputModal, BackupsModal } from './components/Modals'
import { UsageModal } from './components/UsageModal'
import { pretty, renderTrayIcon, formatTokens } from './utils'

let toastTimer = null

export default function App() {
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState([])
  const [status, setStatus] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editorText, setEditorText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
  const [usage, setUsage] = useState(null)
  const [busy, setBusy] = useState(false)
  const saveRef = useRef(null)

  const showToast = (msg, type = 'ok') => {
    clearTimeout(toastTimer)
    setToast({ msg, type })
    toastTimer = setTimeout(() => setToast(null), 2800)
  }

  const selected = profiles.find((p) => p.id === selectedId) || null
  const activeId = status ? status.activeProfileId : null

  const parseError = useMemo(() => {
    if (!editorText.trim()) return '配置内容为空'
    try {
      JSON.parse(editorText)
      return null
    } catch (e) {
      return e.message
    }
  }, [editorText])

  const dirty = editorText !== savedText

  const refresh = useCallback(async () => {
    const [list, st] = await Promise.all([window.api.listProfiles(), window.api.getStatus()])
    setProfiles(list)
    setStatus(st)
    return { list, st }
  }, [])

  useEffect(() => {
    refresh()
      .catch((e) => showToast(e.message, 'err'))
      .finally(() => setLoading(false))
  }, [refresh])

  // 选中配置变化时，把该配置载入编辑器
  useEffect(() => {
    if (!selectedId) {
      setEditorText('')
      setSavedText('')
      return
    }
    const p = profiles.find((x) => x.id === selectedId)
    if (!p) {
      setSelectedId(null)
      return
    }
    const text = pretty(p.content)
    setEditorText(text)
    setSavedText(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const loadIntoEditor = (id, list) => {
    const p = (list || profiles).find((x) => x.id === id)
    if (!p) return
    const text = pretty(p.content)
    setEditorText(text)
    setSavedText(text)
  }

  const save = async () => {
    if (!selected || parseError || busy) return false
    setBusy(true)
    try {
      const content = JSON.parse(editorText)
      await window.api.updateProfile({ id: selected.id, content })
      const { list } = await refresh()
      loadIntoEditor(selected.id, list)
      showToast('已保存')
      return true
    } catch (e) {
      showToast(e.message, 'err')
      return false
    } finally {
      setBusy(false)
    }
  }
  saveRef.current = save

  // Ctrl/Cmd + S 保存
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (saveRef.current) saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 主进程（托盘菜单）发起切换后，同步刷新界面
  const loadUsage = useCallback(async () => {
    try {
      setUsage(await window.api.getUsage({ period: 'day', offset: 0 }))
    } catch {
      // 忽略统计失败
    }
  }, [])

  useEffect(() => {
    const off = window.api.onStateChanged(() => {
      refresh().catch(() => {})
      loadUsage()
    })
    return off
  }, [refresh, loadUsage])

  // 今日用量：首次加载 + 每 30 秒刷新
  useEffect(() => {
    loadUsage()
    const t = setInterval(loadUsage, 30000)
    return () => clearInterval(t)
  }, [loadUsage])

  // 当前配置变化时，生成对应首字母图标推送给托盘
  const activeProfile = activeId ? profiles.find((p) => p.id === activeId) : null
  const activeKey = activeProfile ? `${activeProfile.id}:${activeProfile.name}` : 'none'
  useEffect(() => {
    if (!activeProfile) return
    try {
      window.api.setTrayIcon(renderTrayIcon(activeProfile.name)).catch(() => {})
    } catch {
      // canvas 异常时保留默认图标
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  const doSwitch = async (id) => {
    if (busy) return
    const target = profiles.find((p) => p.id === id)
    setBusy(true)
    try {
      await window.api.switchProfile(id)
      await refresh()
      showToast(`已激活「${target ? target.name : '配置'}」，settings.json 已写入（已运行的 Claude Code 需重启后生效）`)
    } catch (e) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const requestSwitch = (id) => {
    const switchingSelected = id === selectedId
    if (switchingSelected && dirty) {
      if (parseError) {
        showToast('编辑器内容不是合法 JSON，无法保存并激活', 'err')
        return
      }
      setModal({
        type: 'confirm',
        title: '保存并激活',
        message: '当前配置有未保存的修改，保存并激活？切换时会自动备份现有 settings.json。',
        confirmText: '保存并激活',
        onConfirm: async () => {
          const ok = await save()
          if (ok) await doSwitch(id)
        }
      })
      return
    }
    if (!switchingSelected && dirty) {
      setModal({
        type: 'confirm',
        title: '未保存的修改',
        message: '当前编辑器中有未保存的修改，切换后将丢弃这些修改。',
        confirmText: '丢弃并切换',
        danger: true,
        onConfirm: async () => {
          await doSwitch(id)
        }
      })
      return
    }
    doSwitch(id)
  }

  const openCreate = () => {
    setModal({
      type: 'input',
      title: '新建配置',
      label: '配置名称',
      initial: '',
      placeholder: '例如：公司代理 / 家用直连',
      onSubmit: async (name) => {
        const p = await window.api.createProfile({ name, content: {} })
        await refresh()
        setSelectedId(p.id)
        showToast(`已创建「${p.name}」`)
      }
    })
  }

  const openImport = () => {
    setModal({
      type: 'input',
      title: '导入当前配置',
      label: '配置名称',
      initial: '我的配置',
      placeholder: '为当前 settings.json 内容创建一个配置',
      onSubmit: async (name) => {
        const p = await window.api.importCurrent(name)
        await refresh()
        setSelectedId(p.id)
        showToast(`已导入「${p.name}」`)
      }
    })
  }

  const openRename = (p) => {
    setModal({
      type: 'input',
      title: '重命名配置',
      label: '配置名称',
      initial: p.name,
      onSubmit: async (name) => {
        await window.api.updateProfile({ id: p.id, name })
        await refresh()
      }
    })
  }

  const requestDuplicate = async (p) => {
    try {
      const np = await window.api.duplicateProfile(p.id)
      await refresh()
      showToast(`已创建副本「${np.name}」`)
    } catch (e) {
      showToast(e.message, 'err')
    }
  }

  const requestDelete = (p) => {
    const isActive = activeId === p.id
    setModal({
      type: 'confirm',
      title: '删除配置',
      danger: true,
      confirmText: '删除',
      message: isActive
        ? `「${p.name}」当前处于激活状态。删除配置条目不会修改 settings.json 文件本身，确定删除？`
        : `确定删除「${p.name}」？此操作不可恢复。`,
      onConfirm: async () => {
        await window.api.deleteProfile(p.id)
        if (selectedId === p.id) setSelectedId(null)
        await refresh()
        showToast('已删除')
      }
    })
  }

  const rewriteActive = async () => {
    setBusy(true)
    try {
      await window.api.rewriteActive()
      await refresh()
      showToast('已用激活配置覆盖 settings.json')
    } catch (e) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const adoptFile = async () => {
    setBusy(true)
    try {
      const updated = await window.api.adoptFile()
      const { list } = await refresh()
      if (selectedId && updated && updated.id === selectedId) loadIntoEditor(selectedId, list)
      showToast('已把文件内容存入激活配置')
    } catch (e) {
      showToast(e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const format = () => {
    if (parseError) return
    setEditorText(pretty(JSON.parse(editorText)))
  }

  const mismatch = status && activeId && status.activeMatchesFile === false

  return (
    <div className="app">
      <Sidebar
        profiles={profiles}
        activeId={activeId}
        selectedId={selectedId}
        loading={loading}
        onSelect={setSelectedId}
        onSwitch={requestSwitch}
        onCreate={openCreate}
        onRename={openRename}
        onDuplicate={requestDuplicate}
        onDelete={requestDelete}
      />

      <main className="main">
        {mismatch && (
          <div className="banner">
            <span className="banner-icon">⚠</span>
            <span className="banner-text">
              激活配置与 settings.json 当前内容不一致（文件可能被外部修改过）
            </span>
            <button className="btn ghost small" onClick={rewriteActive} disabled={busy}>
              用激活配置覆盖文件
            </button>
            <button className="btn ghost small" onClick={adoptFile} disabled={busy}>
              把文件内容存入激活配置
            </button>
          </div>
        )}

        {profiles.length === 0 && !loading ? (
          <EmptyState
            settingsExists={status ? status.settingsExists : false}
            onImport={openImport}
            onCreate={openCreate}
          />
        ) : selected ? (
          <EditorPane
            key={selected.id}
            profile={selected}
            active={activeId === selected.id}
            text={editorText}
            error={parseError}
            dirty={dirty}
            busy={busy}
            onChangeText={setEditorText}
            onSave={save}
            onFormat={format}
            onSwitch={() => requestSwitch(selected.id)}
            onRename={() => openRename(selected)}
            onDuplicate={() => requestDuplicate(selected)}
            onDelete={() => requestDelete(selected)}
          />
        ) : (
          <div className="placeholder">
            <div className="placeholder-icon">⟨/⟩</div>
            <div>从左侧选择一个配置进行编辑</div>
          </div>
        )}

        <div className="statusbar">
          <span className="status-path" title={status ? status.settingsPath : ''}>
            {status ? status.settingsPath : '加载中…'}
          </span>
          {status && (
            <button className="icon-btn" title="在资源管理器中显示 settings.json" onClick={() => window.api.revealSettings()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}
          <div className="status-spacer" />
          {usage && usage.totals && (
            <button
              className="token-chip"
              title="点击查看今日用量明细"
              onClick={() => setUsageOpen(true)}
            >
              今日 {formatTokens(usage.totals.sum)} tokens
              {activeId && usage.byProfile[activeId]
                ? ` · 当前配置 ${formatTokens(usage.byProfile[activeId].sum)}`
                : ''}
            </button>
          )}
          {activeId && profiles.find((p) => p.id === activeId) && (
            <span className="status-active">
              生效中：<b>{profiles.find((p) => p.id === activeId).name}</b>
            </span>
          )}
          <button className="btn ghost small" onClick={() => setBackupsOpen(true)}>
            备份记录
          </button>
        </div>
      </main>

      {modal && modal.type === 'confirm' && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          danger={modal.danger}
          confirmText={modal.confirmText}
          onConfirm={modal.onConfirm}
          onClose={() => setModal(null)}
        />
      )}
      {modal && modal.type === 'input' && (
        <InputModal
          title={modal.title}
          label={modal.label}
          initial={modal.initial}
          placeholder={modal.placeholder}
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
        />
      )}
      {backupsOpen && <BackupsModal onClose={() => setBackupsOpen(false)} onToast={showToast} />}
      {usageOpen && (
        <UsageModal
          profiles={profiles}
          activeId={activeId}
          onClose={() => {
            setUsageOpen(false)
            loadUsage()
          }}
          onToast={showToast}
        />
      )}

      {toast && <div className={`toast ${toast.type === 'err' ? 'toast-err' : ''}`}>{toast.msg}</div>}
    </div>
  )
}
