// 자동 업데이트 (electron-updater, generic 방식): 업데이트 주소 폴더의 latest.yml을 보고 새 버전을 받아 둔다.
// 받은 뒤에는 "다시 시작해서 설치" 또는 앱을 끌 때 조용히 설치된다.
// 주소: 설치 파일에 박힌 주소(package.json build.publish → resources/app-update.yml, GitHub 릴리스).
// 시험할 때만 환경 변수 BRANCHLY_UPDATE_URL로 바꿀 수 있다(예: npm run serve-updates의 http://127.0.0.1:8765/).
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import fs from 'node:fs'
import path from 'node:path'
import type { UpdateStatus } from '../shared/types'
import { t } from '../shared/i18n'

/** 아직 정하지 않은 기본 주소 (package.json build.publish의 자리 표시) */
const PLACEHOLDER = 'example.invalid'
const EVERY = 4 * 60 * 60 * 1000

let settings: () => { autoUpdate: boolean } = () => ({ autoUpdate: false })
let status: UpdateStatus = {
  current: app.getVersion(),
  state: 'idle',
  message: null,
  newVersion: null,
  progress: null,
  checkedAt: null,
}
let timer: NodeJS.Timeout | undefined

/** https는 어디든, http는 이 PC·사내망(사설 IP, 점 없는 서버 이름)만. 아이디·비밀번호가 든 주소는 거부 */
export function validUpdateUrl(u: string): boolean {
  let x: URL
  try {
    x = new URL(u)
  } catch {
    return false
  }
  if (x.username || x.password) return false
  if (x.protocol === 'https:') return true
  if (x.protocol !== 'http:') return false
  const h = x.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^10\./.test(h) || /^192\.168\./.test(h)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || !h.includes('.')
}

const withSlash = (u: string) => (u.endsWith('/') ? u : u + '/')

function log(level: string, msg: unknown) {
  try {
    const file = path.join(app.getPath('userData'), 'update.log')
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.rmSync(file)
    fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${msg instanceof Error ? msg.message : String(msg)}\n`)
  } catch {
    // 기록 못 해도 그만
  }
}

/** 설치 파일에 박힌 기본 주소 (resources/app-update.yml의 url) */
function defaultUrl(): string {
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8')
    return yml.match(/^url:\s*(\S+)/m)?.[1]?.replace(/^['"]|['"]$/g, '') ?? ''
  } catch {
    return ''
  }
}

function effectiveUrl(): string {
  const test = process.env.BRANCHLY_UPDATE_URL?.trim()
  return test && validUpdateUrl(test) ? test : defaultUrl()
}

function disabledReason(url: string): string | null {
  if (!app.isPackaged) return t('개발 버전에서는 자동 업데이트를 하지 않아요 (설치 파일로 설치한 앱에서 동작해요)')
  if (process.env.PORTABLE_EXECUTABLE_DIR) return t('포터블 exe는 자동 업데이트가 안 돼요. 설치 파일로 설치해 주세요')
  if (!url || url.includes(PLACEHOLDER)) return t('업데이트 주소를 아직 정하지 않았어요')
  if (!validUpdateUrl(url)) return t('쓸 수 없는 업데이트 주소예요 (https 또는 사내망 http만)')
  return null
}

export function getStatus(): UpdateStatus {
  const url = effectiveUrl()
  const reason = disabledReason(url)
  if (reason && status.state !== 'downloading' && status.state !== 'ready') {
    return { ...status, state: 'disabled', message: reason }
  }
  if (!reason && status.state === 'disabled') status = { ...status, state: 'idle', message: null }
  return { ...status }
}

export async function check(): Promise<UpdateStatus> {
  const url = effectiveUrl()
  const reason = disabledReason(url)
  if (reason) return getStatus()
  if (status.state === 'downloading' || status.state === 'ready' || status.state === 'checking') return getStatus()
  autoUpdater.setFeedURL({ provider: 'generic', url: withSlash(url) })
  status = { ...status, state: 'checking', message: null }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    status = { ...status, state: 'error', message: shortError(e), checkedAt: Date.now() }
  }
  return getStatus()
}

export function install(): void {
  if (status.state !== 'ready') throw new Error(t('받아 둔 새 버전이 없어요'))
  log('info', t('설치하고 다시 시작: {version}', { version: String(status.newVersion) }))
  // 조용히 설치하고(isSilent) 끝나면 다시 켠다(isForceRunAfter)
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}

/** 설정이 바뀌면(주소·자동 확인) 다시 맞춘다 */
export function settingsChanged(): void {
  if (status.state === 'error' || status.state === 'latest') status = { ...status, state: 'idle', message: null }
  schedule()
}

function shortError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i.test(m)) return t('업데이트 서버에 연결하지 못했어요')
  if (/404/.test(m)) return t('업데이트 주소에 latest.yml이 없어요')
  return m.split('\n')[0].slice(0, 300)
}

function schedule() {
  clearInterval(timer)
  if (!settings().autoUpdate || disabledReason(effectiveUrl())) return
  timer = setInterval(() => void check(), EVERY)
}

export function initUpdater(getSettings: typeof settings): void {
  settings = getSettings
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.disableWebInstaller = true // 웹 설치 파일은 안 씀 (경고 끄기)
  autoUpdater.logger = {
    info: (m: unknown) => log('info', m),
    warn: (m: unknown) => log('warn', m),
    error: (m: unknown) => log('error', m),
    debug: () => {},
  }
  autoUpdater.on('checking-for-update', () => {
    status = { ...status, state: 'checking', message: null }
  })
  autoUpdater.on('update-not-available', () => {
    status = { ...status, state: 'latest', newVersion: null, progress: null, checkedAt: Date.now() }
  })
  autoUpdater.on('update-available', (info) => {
    status = { ...status, state: 'downloading', newVersion: info.version, progress: 0, checkedAt: Date.now() }
  })
  autoUpdater.on('download-progress', (p) => {
    status = { ...status, state: 'downloading', progress: Math.round(p.percent) }
  })
  autoUpdater.on('update-downloaded', (info) => {
    status = { ...status, state: 'ready', newVersion: info.version, progress: 100 }
    log('info', t('받기 끝: {version} (다시 시작하거나 앱을 끄면 설치)', { version: info.version }))
  })
  autoUpdater.on('error', (e) => {
    status = { ...status, state: 'error', message: shortError(e), checkedAt: Date.now() }
  })
  if (settings().autoUpdate && !disabledReason(effectiveUrl())) setTimeout(() => void check(), 8000)
  schedule()
}
