import { app } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'

const MAX_BACKUPS = 20

export function getClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function profilesDir() {
  return path.join(app.getPath('userData'), 'profiles')
}

function backupsDir() {
  return path.join(app.getPath('userData'), 'backups')
}

function stateFile() {
  return app.getPath('userData')
}

function statePath() {
  return path.join(stateFile(), 'state.json')
}

export function getBackupsDir() {
  return backupsDir()
}

export async function ensureBackupsDir() {
  await fsp.mkdir(backupsDir(), { recursive: true })
  return backupsDir()
}

async function ensureDirs() {
  await fsp.mkdir(profilesDir(), { recursive: true })
  await fsp.mkdir(backupsDir(), { recursive: true })
}

export async function readState() {
  try {
    const raw = await fsp.readFile(statePath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return { activeProfileId: null }
  }
}

export async function writeState(state) {
  await fsp.mkdir(app.getPath('userData'), { recursive: true })
  await fsp.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8')
}

export async function getActiveProfileId() {
  const state = await readState()
  return state.activeProfileId || null
}

function validateContent(content) {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    throw new Error('配置内容必须是一个 JSON 对象（顶层不能是数组或标量值）')
  }
}

function profileFile(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9]+$/.test(id)) throw new Error('非法的配置 ID')
  return path.join(profilesDir(), `${id}.json`)
}

export async function listProfiles() {
  await ensureDirs()
  const files = await fsp.readdir(profilesDir())
  const profiles = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = await fsp.readFile(path.join(profilesDir(), f), 'utf8')
      const p = JSON.parse(raw)
      if (p && p.id && p.name && typeof p.content === 'object') profiles.push(p)
    } catch {
      // 跳过损坏的配置文件
    }
  }
  profiles.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  return profiles
}

async function readProfile(id) {
  const raw = await fsp.readFile(profileFile(id), 'utf8')
  const p = JSON.parse(raw)
  if (!p || !p.id) throw new Error('配置文件已损坏')
  return p
}

async function saveProfile(p) {
  await ensureDirs()
  await fsp.writeFile(profileFile(p.id), JSON.stringify(p, null, 2), 'utf8')
}

export async function createProfile({ name, content } = {}) {
  const n = String(name || '').trim()
  if (!n) throw new Error('配置名称不能为空')
  validateContent(content)
  const now = Date.now()
  const p = {
    id: randomUUID().replace(/-/g, ''),
    name: n,
    content,
    createdAt: now,
    updatedAt: now
  }
  await saveProfile(p)
  return p
}

export async function updateProfile(id, patch = {}) {
  const p = await readProfile(id)
  if (patch.name !== undefined) {
    const n = String(patch.name).trim()
    if (!n) throw new Error('配置名称不能为空')
    p.name = n
  }
  if (patch.content !== undefined) {
    validateContent(patch.content)
    p.content = patch.content
  }
  p.updatedAt = Date.now()
  await saveProfile(p)
  return p
}

export async function duplicateProfile(id) {
  const p = await readProfile(id)
  return createProfile({ name: `${p.name} 副本`, content: p.content })
}

export async function deleteProfile(id) {
  const activeId = await getActiveProfileId()
  await fsp.rm(profileFile(id), { force: true })
  if (activeId === id) await writeState({ activeProfileId: null })
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}'
}

export async function readSettingsFile() {
  try {
    return await fsp.readFile(getClaudeSettingsPath(), 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
}

function backupName(d) {
  const pad = (x) => String(x).padStart(2, '0')
  return `settings-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`
}

export async function backupSettings() {
  const raw = await readSettingsFile()
  if (raw === null) return null
  await ensureDirs()
  const name = backupName(new Date())
  await fsp.writeFile(path.join(backupsDir(), name), raw, 'utf8')
  const files = (await fsp.readdir(backupsDir()))
    .filter((f) => /^settings-\d{8}-\d{6}\.json$/.test(f))
    .sort()
  while (files.length > MAX_BACKUPS) {
    await fsp.rm(path.join(backupsDir(), files.shift()), { force: true })
  }
  return name
}

export async function switchProfile(id) {
  const p = await readProfile(id)
  validateContent(p.content)
  await backupSettings()
  await fsp.mkdir(path.dirname(getClaudeSettingsPath()), { recursive: true })
  await fsp.writeFile(getClaudeSettingsPath(), JSON.stringify(p.content, null, 2) + '\n', 'utf8')
  const state = await readState()
  const history = Array.isArray(state.switchHistory) ? state.switchHistory : []
  history.push({ profileId: id, at: Date.now() })
  await writeState({ ...state, activeProfileId: id, switchHistory: history.slice(-2000) })
  return p
}

export async function rewriteActive() {
  const activeId = await getActiveProfileId()
  if (!activeId) throw new Error('当前没有激活的配置')
  return switchProfile(activeId)
}

export async function adoptFileIntoActiveProfile() {
  const activeId = await getActiveProfileId()
  if (!activeId) throw new Error('当前没有激活的配置')
  const raw = await readSettingsFile()
  if (raw === null) throw new Error('settings.json 不存在')
  let content
  try {
    content = JSON.parse(raw)
  } catch (e) {
    throw new Error('settings.json 不是合法 JSON，无法导入：' + e.message)
  }
  validateContent(content)
  return updateProfile(activeId, { content })
}

export async function importCurrentProfile(name) {
  const raw = await readSettingsFile()
  if (raw === null) throw new Error('未找到 settings.json，无法导入')
  let content
  try {
    content = JSON.parse(raw)
  } catch (e) {
    throw new Error('settings.json 不是合法 JSON，无法导入：' + e.message)
  }
  validateContent(content)
  return createProfile({ name: name || '我的配置', content })
}

export async function getStatus() {
  const [profiles, activeId, raw] = await Promise.all([
    listProfiles(),
    getActiveProfileId(),
    readSettingsFile()
  ])
  const activeProfile = activeId ? profiles.find((p) => p.id === activeId) || null : null
  let activeMatchesFile = null
  if (!activeProfile) {
    activeMatchesFile = null
  } else if (raw === null) {
    activeMatchesFile = false
  } else {
    try {
      activeMatchesFile = canonicalize(activeProfile.content) === canonicalize(JSON.parse(raw))
    } catch {
      activeMatchesFile = false
    }
  }
  return {
    settingsPath: getClaudeSettingsPath(),
    settingsExists: raw !== null,
    activeProfileId: activeId,
    activeMatchesFile
  }
}

export async function listBackups() {
  await ensureDirs()
  const files = (await fsp.readdir(backupsDir()))
    .filter((f) => /^settings-\d{8}-\d{6}\.json$/.test(f))
    .sort()
    .reverse()
  const out = []
  for (const f of files) {
    const m = f.match(/^settings-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/)
    const stat = await fsp.stat(path.join(backupsDir(), f))
    out.push({
      filename: f,
      timestamp: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`,
      size: stat.size
    })
  }
  return out
}

export async function restoreBackup(filename) {
  if (!/^settings-\d{8}-\d{6}\.json$/.test(String(filename))) throw new Error('非法的备份文件名')
  const raw = await fsp.readFile(path.join(backupsDir(), filename), 'utf8')
  const content = JSON.parse(raw)
  validateContent(content)
  await backupSettings()
  await fsp.writeFile(getClaudeSettingsPath(), JSON.stringify(content, null, 2) + '\n', 'utf8')
}
