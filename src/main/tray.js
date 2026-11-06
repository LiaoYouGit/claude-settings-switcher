import { Menu, Tray, nativeImage, app, BrowserWindow } from 'electron'
import path from 'node:path'
import * as store from './store'
import * as usage from './usage'

let tray = null
let customIconDataUrl = null

function defaultIcon() {
  return nativeImage.createFromPath(path.join(app.getAppPath(), 'resources', 'tray-default.png'))
}

export function showMainWindow() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function balloon(title, content) {
  try {
    if (tray) tray.displayBalloon({ title, content, noSound: true })
  } catch {
    // 通知失败不影响主流程
  }
}

async function switchFromTray(id) {
  try {
    const p = await store.switchProfile(id)
    await updateTray()
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) win.webContents.send('state-changed')
    balloon('配置已切换', `当前生效：${p.name}（已运行的 Claude Code 需重启后生效）`)
  } catch (e) {
    balloon('切换失败', (e && e.message) || String(e))
  }
}

export async function updateTray() {
  if (!tray) return
  const [profiles, activeId] = await Promise.all([store.listProfiles(), store.getActiveProfileId()])
  const active = profiles.find((p) => p.id === activeId) || null

  let todayLine = ''
  try {
    const u = await usage.getUsage({ period: 'day', offset: 0 })
    const s = active ? u.byProfile[active.id] : null
    todayLine = ` · 今日 ${usage.formatTokens(s ? s.sum : 0)} tokens`
  } catch {
    // 统计失败不影响托盘
  }

  const template = [
    { label: active ? `当前生效：${active.name}${todayLine}` : '当前没有生效配置', enabled: false },
    { type: 'separator' },
    ...profiles.map((p) => ({
      label: p.name,
      type: 'radio',
      checked: p.id === activeId,
      click: () => switchFromTray(p.id)
    })),
    ...(profiles.length ? [{ type: 'separator' }] : []),
    { label: '显示主窗口', click: showMainWindow },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.setToolTip(active ? `Claude 配置切换器 — 当前生效：${active.name}${todayLine}` : 'Claude 配置切换器 — 无生效配置')

  if (!active) {
    customIconDataUrl = null
    tray.setImage(defaultIcon())
  } else if (customIconDataUrl) {
    tray.setImage(nativeImage.createFromDataURL(customIconDataUrl))
  } else {
    tray.setImage(defaultIcon())
  }
}

export function createTray() {
  tray = new Tray(defaultIcon())
  tray.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && win.isVisible()) win.hide()
    else showMainWindow()
  })
  updateTray()
  return tray
}

export function setCustomIcon(dataUrl) {
  if (
    typeof dataUrl !== 'string' ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) ||
    dataUrl.length > 200000
  ) {
    throw new Error('非法的图标数据')
  }
  customIconDataUrl = dataUrl
  if (tray) tray.setImage(nativeImage.createFromDataURL(dataUrl))
}

export async function showHideHintOnce() {
  try {
    const state = await store.readState()
    if (state.hideHintShown) return
    await store.writeState({ ...state, hideHintShown: true })
    balloon('仍在运行', '已驻留系统托盘：右键图标可切换配置，单击图标可打开主窗口。')
  } catch {
    // 提示失败不影响主流程
  }
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
