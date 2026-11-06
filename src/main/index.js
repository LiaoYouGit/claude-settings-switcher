import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import * as store from './store'
import * as trayModule from './tray'
import * as usage from './usage'

app.setName('claude-settings-switcher')

let mainWindow = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  trayModule.showMainWindow()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    title: 'Claude 配置切换器',
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#131417',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 最小化 / 关闭时驻留系统托盘（SwitchHosts 模式）
  const hideToTray = () => {
    mainWindow.hide()
    trayModule.showHideHintOnce()
  }
  mainWindow.on('minimize', (e) => {
    e.preventDefault()
    hideToTray()
  })
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      hideToTray()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, payload) => {
    try {
      return { ok: true, data: await fn(payload) }
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) }
    }
  })
}

function registerIpc() {
  handle('app:getStatus', () => store.getStatus())
  handle('profiles:list', () => store.listProfiles())
  handle('profiles:create', async (p) => {
    const r = await store.createProfile(p)
    trayModule.updateTray()
    return r
  })
  handle('profiles:update', async ({ id, name, content }) => {
    const r = await store.updateProfile(id, { name, content })
    trayModule.updateTray()
    return r
  })
  handle('profiles:duplicate', async (id) => {
    const r = await store.duplicateProfile(id)
    trayModule.updateTray()
    return r
  })
  handle('profiles:delete', async (id) => {
    const r = await store.deleteProfile(id)
    trayModule.updateTray()
    return r
  })
  handle('profiles:switch', async (id) => {
    const r = await store.switchProfile(id)
    trayModule.updateTray()
    return r
  })
  handle('profiles:importCurrent', async (name) => {
    const r = await store.importCurrentProfile(name)
    trayModule.updateTray()
    return r
  })
  handle('profiles:rewriteActive', () => store.rewriteActive())
  handle('profiles:adoptFile', () => store.adoptFileIntoActiveProfile())
  handle('backups:list', () => store.listBackups())
  handle('backups:restore', (filename) => store.restoreBackup(filename))
  handle('shell:revealSettings', () => {
    shell.showItemInFolder(store.getClaudeSettingsPath())
    return true
  })
  handle('shell:openBackups', async () => {
    const dir = await store.ensureBackupsDir()
    const err = await shell.openPath(dir)
    if (err) throw new Error(err)
    return true
  })
  handle('tray:setIcon', (dataUrl) => {
    trayModule.setCustomIcon(dataUrl)
    return true
  })
  handle('usage:get', (arg) => usage.getUsage(arg || {}))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  trayModule.createTray()
  // 定时刷新托盘上的今日用量
  const trayTimer = setInterval(() => {
    trayModule.updateTray().catch(() => {})
  }, 5 * 60 * 1000)
  trayTimer.unref()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  trayModule.destroyTray()
})
