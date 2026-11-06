import { contextBridge, ipcRenderer } from 'electron'

function call(channel, payload) {
  return ipcRenderer.invoke(channel, payload).then((r) => {
    if (!r || r.ok !== true) throw new Error((r && r.error) || '操作失败')
    return r.data
  })
}

contextBridge.exposeInMainWorld('api', {
  getStatus: () => call('app:getStatus'),
  listProfiles: () => call('profiles:list'),
  createProfile: (payload) => call('profiles:create', payload),
  updateProfile: (payload) => call('profiles:update', payload),
  duplicateProfile: (id) => call('profiles:duplicate', id),
  deleteProfile: (id) => call('profiles:delete', id),
  switchProfile: (id) => call('profiles:switch', id),
  importCurrent: (name) => call('profiles:importCurrent', name),
  rewriteActive: () => call('profiles:rewriteActive'),
  adoptFile: () => call('profiles:adoptFile'),
  listBackups: () => call('backups:list'),
  restoreBackup: (filename) => call('backups:restore', filename),
  revealSettings: () => call('shell:revealSettings'),
  openBackups: () => call('shell:openBackups'),
  setTrayIcon: (dataUrl) => call('tray:setIcon', dataUrl),
  getUsage: (opts) => call('usage:get', opts),
  onStateChanged: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('state-changed', listener)
    return () => ipcRenderer.removeListener('state-changed', listener)
  }
})
