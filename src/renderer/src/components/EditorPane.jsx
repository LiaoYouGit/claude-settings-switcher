import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'

export default function EditorPane({
  profile,
  active,
  text,
  error,
  dirty,
  busy,
  onChangeText,
  onSave,
  onFormat,
  onSwitch,
  onRename,
  onDuplicate,
  onDelete
}) {
  return (
    <div className="editor-pane">
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <span className="profile-title">{profile.name}</span>
          {active && <span className="badge">生效中</span>}
          {dirty && (
            <span className="dirty-dot" title="有未保存的修改">
              ●
            </span>
          )}
        </div>
        <div className="toolbar-right">
          {error && (
            <span className="json-error" title={error}>
              JSON 错误
            </span>
          )}
          <button className="btn ghost" onClick={onRename}>
            重命名
          </button>
          <button className="btn ghost" onClick={onDuplicate}>
            创建副本
          </button>
          <button className="btn ghost danger" onClick={onDelete}>
            删除
          </button>
          <button className="btn ghost" onClick={onFormat} disabled={!!error}>
            格式化
          </button>
          <button className="btn primary" onClick={onSave} disabled={!!error || busy || !dirty} title="Ctrl+S">
            保存
          </button>
          <button
            className="btn switch"
            onClick={onSwitch}
            disabled={busy}
            title="写入 ~/.claude/settings.json 并设为生效配置（会先自动备份）；已运行的 Claude Code 需重启后生效"
          >
            {active ? '重新写入' : '激活此配置'}
          </button>
        </div>
      </div>
      <div className="editor-wrap">
        <CodeMirror
          value={text}
          height="100%"
          theme={oneDark}
          extensions={[json()]}
          onChange={onChangeText}
          basicSetup={{
            foldGutter: true,
            highlightActiveLine: true,
            autocompletion: false
          }}
        />
      </div>
      {error && <div className="error-bar">{error}</div>}
    </div>
  )
}
