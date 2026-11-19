// Electron 메인 프로세스: 창, 화면과 주고받는 기능(IPC), 최근 저장소·앱 설정, 파일 저장 창
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as repo from './repo'
import * as updater from './updater'
import { git } from './git'
import {
  allowDir, allowRepo, checkBool, checkDir, checkFile, checkFiles, checkFolderName, checkInt, checkMessage, checkName,
  checkObject, checkOneOf, checkOptionalFile, checkOptionalRef, checkPattern, checkRef, checkRefs, checkRepo, checkSha,
  checkShas, checkText, checkUrl,
} from './guard'
import { fixRefKinds } from '../shared/parse'
import { resolveLang, setLang, t, tk } from '../shared/i18n'
import {
  API_METHODS, type Api, type AppSettings, type CommitOptions, type DiffOptions, type FlowConfig, type Identity,
  type RebaseStep, type RepoInfo, type SshKey,
} from '../shared/types'

const DEV_URL = process.env.VITE_DEV_SERVER_URL
let win: BrowserWindow | null = null

// 테스트(scripts/e2e.mjs)는 설정 폴더를 따로 써서 사용자의 최근 저장소 목록·설정을 건드리지 않는다
if (process.env.BRANCHLY_USER_DATA) app.setPath('userData', process.env.BRANCHLY_USER_DATA)
// 테마 강제 (화면 확인용): BRANCHLY_THEME=dark|light. 없으면 앱 설정 → Windows 설정
const FORCED_THEME = process.env.BRANCHLY_THEME === 'dark' || process.env.BRANCHLY_THEME === 'light' ? process.env.BRANCHLY_THEME : null

// 한 번에 하나만 켠다. 이미 켜져 있으면 그 창을 앞으로 가져오고(폴더를 넘겼으면 새 탭으로 열게 전달) 이 프로세스는 끝낸다.
// 둘이 같이 켜져 있으면 업데이트 설치가 중간에 막히고(제어판 버전이 안 바뀐 적 있음) 설정 파일도 서로 덮어쓴다.
// 잠금은 설정 폴더 기준이라 BRANCHLY_USER_DATA를 따로 주는 테스트는 따로 켜진다.
const firstInstance = app.requestSingleInstanceLock()
if (!firstInstance) app.quit()
const pendingOpen: string[] = []
app.on('second-instance', (_e, argv) => {
  const dir = dirFromArgs(argv.slice(app.isPackaged ? 1 : 2))
  if (dir) pendingOpen.push(dir)
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})

// ───────── 최근 저장소 ─────────

const dataFile = (name: string) => path.join(app.getPath('userData'), name)

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(name: string, value: unknown) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(dataFile(name), JSON.stringify(value, null, 2))
}

function readRecent(): RepoInfo[] {
  const list = readJson<RepoInfo[]>('recent.json', [])
  return Array.isArray(list) ? list.filter((r) => r && typeof r.path === 'string' && fs.existsSync(r.path)) : []
}

async function open(dir: string): Promise<RepoInfo> {
  const info = await repo.resolveRepo(dir)
  allowRepo(info.path)
  writeJson('recent.json', [info, ...readRecent().filter((r) => path.resolve(r.path) !== info.path)].slice(0, 20))
  return info
}

/** 실행할 때 넘긴 폴더 (branchly C:\work\repo), 테스트는 BRANCHLY_OPEN */
function startupDir(): string | null {
  if (process.env.BRANCHLY_OPEN) return process.env.BRANCHLY_OPEN
  return dirFromArgs(process.argv.slice(app.isPackaged ? 1 : 2))
}

/** 명령줄에서 폴더 하나 (옵션·'.'은 건너뜀) */
function dirFromArgs(args: string[]): string | null {
  const dir = args.find((a) => !a.startsWith('-') && a !== '.' && fs.existsSync(a) && fs.statSync(a).isDirectory())
  return dir ? path.resolve(dir) : null
}

// ───────── 앱 설정 ─────────

const DEFAULT_SETTINGS: AppSettings = { theme: 'system', editor: '', diffFontSize: 12, sideBySide: false, ignoreWhitespace: false, zoom: 0, autoUpdate: true, language: 'auto' }

function normalizeSettings(v: unknown): AppSettings {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  const theme = o.theme === 'light' || o.theme === 'dark' ? o.theme : 'system'
  const size = typeof o.diffFontSize === 'number' ? Math.round(o.diffFontSize) : DEFAULT_SETTINGS.diffFontSize
  return {
    theme,
    editor: typeof o.editor === 'string' ? o.editor.trim().slice(0, 1000) : '',
    diffFontSize: Math.min(20, Math.max(10, size)),
    sideBySide: o.sideBySide === true,
    ignoreWhitespace: o.ignoreWhitespace === true,
    zoom: typeof o.zoom === 'number' && o.zoom >= 0.8 && o.zoom <= 1.75 ? Math.round(o.zoom * 100) / 100 : 0,
    autoUpdate: o.autoUpdate !== false,
    language: o.language === 'ko' || o.language === 'en' ? o.language : 'auto',
  }
}

const readSettings = () => normalizeSettings(readJson('settings.json', DEFAULT_SETTINGS))

function applyTheme(s: AppSettings) {
  nativeTheme.themeSource = FORCED_THEME ?? s.theme
}

// ───────── 화면 배율 ─────────
// 자동: 화면은 1440px 너비 기준으로 짰다. 창을 키우면(최대화·전체 화면) 늘어난 너비의 절반만큼만 키운다
// (1920px ≈ 115%, 최대 125%). 너비만큼 다 키우면(1920px = 135%) 너무 크다는 의견이 있었음.

const BASE_WIDTH = 1440
const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5, 1.75]
let zoomSetting = 0

const autoZoom = (width: number) => Math.min(1.25, Math.max(1, Math.round((1 + (width / BASE_WIDTH - 1) * 0.5) * 20) / 20))

function applyZoom() {
  if (!win || win.isDestroyed()) return
  win.webContents.setZoomFactor(zoomSetting > 0 ? zoomSetting : autoZoom(win.getContentBounds().width))
}

function setZoom(z: number) {
  const next = normalizeSettings({ ...readSettings(), zoom: z })
  writeJson('settings.json', next)
  zoomSetting = next.zoom
  applyZoom()
}

/** Ctrl + = / - 는 한 단계씩, Ctrl + 0 은 자동으로 */
function zoomStep(dir: 1 | -1) {
  if (!win) return
  const cur = win.webContents.getZoomFactor()
  const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1] : [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.001) ?? ZOOM_STEPS[0]
  setZoom(next)
}

// ───────── 바깥 프로그램 ─────────

/** 셸 없이 실행. 실행 파일을 못 찾으면 오류로 알려 준다 */
function launch(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false })
    child.once('error', (e) => reject(new Error(t('실행할 수 없습니다: {cmd} ({error})', { cmd, error: e.message }))))
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

async function gitInstallDir(): Promise<string | null> {
  try {
    // 예: C:/Program Files/Git/mingw64/libexec/git-core → C:/Program Files/Git
    const exec = (await git(os.homedir(), ['--exec-path'])).stdout.trim()
    const dir = path.resolve(exec, '..', '..', '..')
    return fs.existsSync(path.join(dir, 'git-bash.exe')) || fs.existsSync(path.join(dir, 'usr', 'bin')) ? dir : null
  } catch {
    return null
  }
}

async function openTerminal(dir: string) {
  if (process.platform === 'win32') {
    const gitDir = await gitInstallDir()
    const bash = gitDir ? path.join(gitDir, 'git-bash.exe') : ''
    if (bash && fs.existsSync(bash)) return launch(bash, [`--cd=${dir}`], dir)
    return launch('cmd.exe', ['/c', 'start', 'cmd.exe', '/k'], dir)
  }
  if (process.platform === 'darwin') return launch('open', ['-a', 'Terminal', dir])
  return launch('x-terminal-emulator', [], dir)
}

const SSH_DIR = () => path.join(os.homedir(), '.ssh')

function sshKeys(): SshKey[] {
  const dir = SSH_DIR()
  if (!fs.existsSync(dir)) return []
  const keys: SshKey[] = []
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.pub')) continue
    const line = fs.readFileSync(path.join(dir, f), 'utf8').trim().split(/\r?\n/)[0] ?? ''
    const [type, , ...comment] = line.split(/\s+/)
    if (!type || !type.startsWith('ssh-') && !type.startsWith('ecdsa-')) continue
    keys.push({ file: path.join(dir, f.slice(0, -4)), type, comment: comment.join(' '), publicKey: line })
  }
  return keys
}

async function generateSshKey(comment: string, passphrase: string): Promise<SshKey> {
  const dir = SSH_DIR()
  fs.mkdirSync(dir, { recursive: true })
  let file = path.join(dir, 'id_ed25519')
  for (let n = 1; fs.existsSync(file) || fs.existsSync(file + '.pub'); n++) file = path.join(dir, `id_ed25519_${n}`)
  const args = ['-q', '-t', 'ed25519', '-C', comment, '-N', passphrase, '-f', file]
  const candidates = ['ssh-keygen']
  const gitDir = await gitInstallDir()
  if (gitDir) candidates.push(path.join(gitDir, 'usr', 'bin', 'ssh-keygen.exe'))
  let lastErr = ''
  for (const exe of candidates) {
    const r = await new Promise<{ code: number; err: string }>((resolve) => {
      const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.on('data', (b: Buffer) => (err += b.toString('utf8')))
      child.once('error', (e) => resolve({ code: -1, err: e.message }))
      child.once('close', (code) => resolve({ code: code ?? -1, err }))
    })
    if (r.code === 0) {
      const key = sshKeys().find((k) => k.file === file)
      if (key) return key
    }
    lastErr = r.err
  }
  throw new Error(t('SSH 키를 만들지 못했습니다. OpenSSH(ssh-keygen)가 필요합니다. {error}', { error: lastErr.trim() }))
}

async function saveAs(title: string, defaultName: string, filters: Electron.FileFilter[]): Promise<string | null> {
  const r = await dialog.showSaveDialog(win!, { title, defaultPath: path.join(app.getPath('downloads'), defaultName), filters })
  return r.canceled || !r.filePath ? null : r.filePath
}

const short = (sha: string) => sha.slice(0, 7)

// ───────── 값 검사 (객체 모양) ─────────

const diffOpts = (v: unknown): DiffOptions => ({ ignoreWhitespace: checkObject(v ?? {}).ignoreWhitespace === true })

function commitOpts(v: unknown): CommitOptions {
  const o = checkObject(v)
  return { amend: o.amend === true, signoff: o.signoff === true, noVerify: o.noVerify === true, push: o.push === true }
}

function rebaseSteps(v: unknown): RebaseStep[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 2000) throw new Error(t('잘못된 리베이스 목록'))
  return v.map((s) => {
    const o = checkObject(s)
    return {
      action: checkOneOf(o.action, ['pick', 'reword', 'squash', 'fixup', 'drop'] as const),
      sha: checkSha(o.sha),
      subject: checkText(o.subject ?? '', 10_000),
      message: checkText(o.message ?? ''),
    }
  })
}

const prefix = (v: unknown) => {
  const s = checkText(v, 100).trim()
  if (!/^[\p{L}\p{N}._/-]*$/u.test(s) || s.startsWith('-')) throw new Error(t('쓸 수 없는 접두사: {prefix}', { prefix: s }))
  return s
}

function flowCfg(v: unknown): FlowConfig {
  const o = checkObject(v)
  return {
    initialized: true,
    master: checkRef(o.master),
    develop: checkRef(o.develop),
    feature: prefix(o.feature),
    release: prefix(o.release),
    hotfix: prefix(o.hotfix),
    versionTag: prefix(o.versionTag ?? ''),
  }
}

function identityOf(v: unknown): Identity {
  const o = checkObject(v)
  const name = checkText(o.name ?? '', 200)
  const email = checkText(o.email ?? '', 200)
  if (/[\r\n<>]/.test(name) || /[\r\n<>\s]/.test(email)) throw new Error(t('이름·이메일에 쓸 수 없는 글자가 있습니다'))
  return { name, email }
}

const optRemote = (v: unknown) => (v === null || v === undefined || v === '' ? null : checkName(v, tk('원격 이름')))

// ───────── IPC ─────────

type Handlers = { [K in keyof Api]: (...args: unknown[]) => ReturnType<Api[K]> }

const handlers: Handlers = {
  // 저장소 열기·만들기
  pickRepo: async () => {
    const r = await dialog.showOpenDialog(win!, { title: t('저장소 폴더 열기'), properties: ['openDirectory'] })
    if (r.canceled || r.filePaths.length === 0) return null
    return open(r.filePaths[0])
  },
  openRepo: async (dir) => {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error(t('잘못된 경로'))
    return open(dir)
  },
  recentRepos: async () => readRecent(),
  forgetRepo: async (dir) => {
    writeJson('recent.json', readRecent().filter((r) => r.path !== dir))
  },
  startupRepo: async () => startupDir(),
  takePendingOpen: async () => pendingOpen.splice(0),
  pickFolder: async (title) => {
    const r = await dialog.showOpenDialog(win!, { title: checkText(title ?? t('폴더 고르기'), 200), properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || r.filePaths.length === 0) return null
    allowDir(r.filePaths[0])
    return path.resolve(r.filePaths[0])
  },
  cloneRepo: async (url, parent, name, branch, recursive) => {
    const info = await repo.clone(checkUrl(url), checkDir(parent), checkFolderName(name), checkOptionalRef(branch), recursive === true)
    return open(info.path)
  },
  initRepo: async (dir) => {
    const info = await repo.init(checkDir(dir))
    return open(info.path)
  },

  // 읽기
  status: async (r) => repo.status(checkRepo(r)),
  log: async (r, q) => {
    const dir = checkRepo(r)
    const o = checkObject(q)
    const search = o.search ? checkObject(o.search) : null
    const query = {
      limit: checkInt(o.limit, 1, 20000),
      scope: checkOneOf(o.scope, ['all', 'local', 'current'] as const),
      search: search ? { mode: checkOneOf(search.mode, ['message', 'author', 'file', 'content', 'sha'] as const), text: checkText(search.text, 500) } : undefined,
    }
    const [commits, names] = await Promise.all([repo.log(dir, query), repo.remoteNames(dir)])
    return commits.map((c) => ({ ...c, refs: fixRefKinds(c.refs, names) }))
  },
  branches: async (r) => repo.branches(checkRepo(r)),
  stashes: async (r) => repo.stashes(checkRepo(r)),
  remotes: async (r) => repo.remotes(checkRepo(r)),
  submodules: async (r) => repo.submodules(checkRepo(r)),
  commitDetail: async (r, sha) => repo.commitDetail(checkRepo(r), checkSha(sha)),
  diffWorking: async (r, file, kind, o) =>
    repo.diffWorking(checkRepo(r), checkFile(file), checkOneOf(kind, ['staged', 'unstaged', 'untracked'] as const), diffOpts(o)),
  diffCommit: async (r, sha, file, o) => repo.diffCommit(checkRepo(r), checkSha(sha), checkFile(file), diffOpts(o)),
  diffRange: async (r, from, to) => repo.diffRange(checkRepo(r), checkRef(from), checkRef(to)),
  diffRangeFile: async (r, from, to, file, o) => repo.diffRangeFile(checkRepo(r), checkRef(from), checkRef(to), checkFile(file), diffOpts(o)),
  readWorkingFile: async (r, file) => repo.readWorkingFile(checkRepo(r), checkFile(file)),
  imagePreview: async (r, rev, file) => repo.imagePreview(checkRepo(r), checkOptionalRef(rev), checkFile(file)),
  blame: async (r, file, rev) => repo.blame(checkRepo(r), checkFile(file), checkOptionalRef(rev)),
  fileLog: async (r, file, limit) => repo.fileLog(checkRepo(r), checkFile(file), checkInt(limit, 1, 5000)),
  lastCommitMessage: async (r) => repo.lastCommitMessage(checkRepo(r)),
  recentMessages: async (r) => repo.recentMessages(checkRepo(r)),
  rebaseSteps: async (r, base) => repo.rebaseSteps(checkRepo(r), checkRef(base)),

  // 작업 사본
  stage: async (r, files) => repo.stage(checkRepo(r), checkFiles(files)),
  unstage: async (r, files) => repo.unstage(checkRepo(r), checkFiles(files)),
  applyPatch: async (r, patch, mode) => repo.applyPatch(checkRepo(r), checkText(patch, 50_000_000), checkOneOf(mode, ['stage', 'unstage', 'discard'] as const)),
  discard: async (r, files, untracked, includeStaged) => {
    const dir = checkRepo(r)
    await repo.discard(dir, checkFiles(files), checkBool(includeStaged))
    // 새 파일은 지우지 않고 휴지통으로 (되살릴 수 있게)
    for (const f of checkFiles(untracked)) await shell.trashItem(path.join(dir, f))
  },
  ignore: async (r, pattern) => repo.ignore(checkRepo(r), checkPattern(pattern)),
  untrack: async (r, files) => repo.untrack(checkRepo(r), checkFiles(files)),
  commit: async (r, message, o) => repo.commit(checkRepo(r), checkMessage(message), commitOpts(o)),
  resolveConflict: async (r, file, side) => repo.resolveConflict(checkRepo(r), checkFile(file), checkOneOf(side, ['ours', 'theirs', 'mark'] as const)),
  mergeTool: async (r, file) => repo.mergeTool(checkRepo(r), checkFile(file)),

  // 브랜치·커밋
  checkout: async (r, ref) => repo.checkout(checkRepo(r), checkRef(ref)),
  checkoutDetached: async (r, sha) => repo.checkoutDetached(checkRepo(r), checkSha(sha)),
  checkoutRemote: async (r, remoteBranch, local) => repo.checkoutRemote(checkRepo(r), checkRef(remoteBranch), checkRef(local)),
  createBranch: async (r, name, start, co) => repo.createBranch(checkRepo(r), checkRef(name), checkOptionalRef(start), checkBool(co)),
  renameBranch: async (r, from, to) => repo.renameBranch(checkRepo(r), checkRef(from), checkRef(to)),
  deleteBranch: async (r, name, force, remoteToo) => repo.deleteBranch(checkRepo(r), checkRef(name), checkBool(force), checkBool(remoteToo)),
  deleteRemoteBranch: async (r, name) => repo.deleteRemoteBranch(checkRepo(r), checkRef(name)),
  setUpstream: async (r, branch, upstream) => repo.setUpstream(checkRepo(r), checkRef(branch), checkOptionalRef(upstream)),
  merge: async (r, ref, o) => {
    const m = checkObject(o)
    return repo.merge(checkRepo(r), checkRef(ref), { noFF: m.noFF === true, squash: m.squash === true, message: checkText(m.message ?? '') })
  },
  rebase: async (r, onto) => repo.rebase(checkRepo(r), checkRef(onto)),
  interactiveRebase: async (r, base, steps) => repo.interactiveRebase(checkRepo(r), checkRef(base), rebaseSteps(steps)),
  cherryPick: async (r, shas) => repo.cherryPick(checkRepo(r), checkShas(shas)),
  revert: async (r, sha) => repo.revert(checkRepo(r), checkSha(sha)),
  reset: async (r, sha, mode) => repo.reset(checkRepo(r), checkRef(sha), checkOneOf(mode, ['soft', 'mixed', 'hard'] as const)),
  continueOperation: async (r) => repo.continueOperation(checkRepo(r)),
  abortOperation: async (r) => repo.abortOperation(checkRepo(r)),
  skipOperation: async (r) => repo.skipOperation(checkRepo(r)),

  // 태그·스태시
  createTag: async (r, name, sha, message, pushTo) =>
    repo.createTag(checkRepo(r), checkRef(name), checkRef(sha), checkText(message ?? ''), optRemote(pushTo)),
  deleteTag: async (r, name, remote) => repo.deleteTag(checkRepo(r), checkRef(name), optRemote(remote)),
  stashSave: async (r, message, keepIndex, untracked) =>
    repo.stashSave(checkRepo(r), checkText(message ?? '', 10_000), checkBool(keepIndex), checkBool(untracked)),
  stashApply: async (r, index, pop) => repo.stashApply(checkRepo(r), checkInt(index), checkBool(pop)),
  stashDrop: async (r, index) => repo.stashDrop(checkRepo(r), checkInt(index)),
  stashBranch: async (r, index, name) => repo.stashBranch(checkRepo(r), checkInt(index), checkRef(name)),

  // 원격
  fetch: async (r, o) => {
    const f = checkObject(o)
    return repo.fetch(checkRepo(r), { remote: optRemote(f.remote), prune: f.prune === true, tags: f.tags === true })
  },
  pull: async (r, o) => {
    const p = checkObject(o)
    return repo.pull(checkRepo(r), { remote: optRemote(p.remote), branch: checkOptionalRef(p.branch), rebase: p.rebase === true })
  },
  push: async (r, o) => {
    const p = checkObject(o)
    return repo.push(checkRepo(r), {
      remote: checkName(p.remote, tk('원격 이름')),
      branches: checkRefs(p.branches ?? []),
      tags: p.tags === true,
      force: p.force === true,
      setUpstream: p.setUpstream === true,
    })
  },
  remoteAdd: async (r, name, url) => repo.remoteAdd(checkRepo(r), checkName(name, tk('원격 이름')), checkUrl(url)),
  remoteSetUrl: async (r, name, url) => repo.remoteSetUrl(checkRepo(r), checkName(name, tk('원격 이름')), checkUrl(url)),
  remoteRename: async (r, from, to) => repo.remoteRename(checkRepo(r), checkName(from, tk('원격 이름')), checkName(to, tk('원격 이름'))),
  remoteRemove: async (r, name) => repo.remoteRemove(checkRepo(r), checkName(name, tk('원격 이름'))),

  // 패치·내보내기
  createPatch: async (r, shas) => {
    const dir = checkRepo(r)
    const list = checkShas(shas)
    const file = await saveAs(t('패치 만들기'), list.length === 1 ? `${short(list[0])}.patch` : `${short(list[0])}-${t('외{n}개', { n: list.length - 1 })}.patch`, [{ name: t('패치'), extensions: ['patch', 'diff'] }])
    if (!file) return null
    fs.writeFileSync(file, await repo.formatPatch(dir, list))
    return file
  },
  applyPatchFile: async (r) => {
    const dir = checkRepo(r)
    const res = await dialog.showOpenDialog(win!, { title: t('패치 적용'), properties: ['openFile'], filters: [{ name: t('패치'), extensions: ['patch', 'diff'] }, { name: t('모든 파일'), extensions: ['*'] }] })
    if (res.canceled || res.filePaths.length === 0) return null
    return repo.applyPatchFile(dir, res.filePaths[0])
  },
  archive: async (r, sha) => {
    const dir = checkRepo(r)
    const s = checkSha(sha)
    const file = await saveAs(t('압축 파일로 내보내기'), `${path.basename(dir)}-${short(s)}.zip`, [{ name: 'ZIP', extensions: ['zip'] }])
    if (!file) return null
    await repo.archive(dir, s, file)
    return file
  },
  saveFileAtRevision: async (r, sha, file) => {
    const dir = checkRepo(r)
    const s = checkSha(sha)
    const f = checkFile(file)
    const ext = path.extname(f)
    const out = await saveAs(t('이 버전으로 저장'), `${path.basename(f, ext)}@${short(s)}${ext}`, [{ name: t('모든 파일'), extensions: ['*'] }])
    if (!out) return null
    fs.writeFileSync(out, await repo.fileAtRevision(dir, s, f))
    return out
  },

  // 저장소 설정
  readGitignore: async (r) => repo.readGitignore(checkRepo(r)),
  writeGitignore: async (r, text) => repo.writeGitignore(checkRepo(r), checkText(text, 1_000_000)),
  identity: async (r) => repo.identity(r === null ? null : checkRepo(r)),
  setIdentity: async (r, id) => repo.setIdentity(r === null ? null : checkRepo(r), identityOf(id)),
  flowConfig: async (r) => repo.flowConfig(checkRepo(r)),
  flowInit: async (r, c) => repo.flowInit(checkRepo(r), flowCfg(c)),
  flowStart: async (r, type, name) => repo.flowStart(checkRepo(r), checkOneOf(type, ['feature', 'release', 'hotfix'] as const), checkRef(name)),
  flowFinish: async (r, type, name, tagMessage, keep) =>
    repo.flowFinish(checkRepo(r), checkOneOf(type, ['feature', 'release', 'hotfix'] as const), checkRef(name), checkText(tagMessage ?? ''), checkBool(keep)),
  submoduleUpdate: async (r, sub) => repo.submoduleUpdate(checkRepo(r), checkOptionalFile(sub)),
  submoduleAdd: async (r, url, sub) => repo.submoduleAdd(checkRepo(r), checkUrl(url), checkFile(sub)),
  lfsInfo: async (r) => repo.lfsInfo(checkRepo(r)),
  lfsTrack: async (r, pattern, track) => repo.lfsTrack(checkRepo(r), checkPattern(pattern), checkBool(track)),

  // 앱
  settings: async () => readSettings(),
  saveSettings: async (s) => {
    const next = normalizeSettings(s)
    writeJson('settings.json', next)
    applyTheme(next)
    setLang(resolveLang(next.language, app.getLocale()))
    zoomSetting = next.zoom
    applyZoom()
    updater.settingsChanged()
    return next
  },
  sshKeys: async () => sshKeys(),
  generateSshKey: async (comment, passphrase) => {
    const c = checkText(comment ?? '', 200)
    const p = checkText(passphrase ?? '', 500)
    if (/[\r\n]/.test(c + p)) throw new Error(t('줄바꿈은 쓸 수 없습니다'))
    return generateSshKey(c, p)
  },
  showInFolder: async (r, file) => {
    const dir = checkRepo(r)
    const f = checkOptionalFile(file)
    if (f) shell.showItemInFolder(path.join(dir, f))
    else {
      const err = await shell.openPath(dir)
      if (err) throw new Error(err)
    }
  },
  openFile: async (r, file) => {
    const full = path.join(checkRepo(r), checkFile(file))
    const editor = readSettings().editor
    if (editor) return launch(editor, [full])
    const err = await shell.openPath(full)
    if (err) throw new Error(err)
  },
  openTerminal: async (r) => openTerminal(checkRepo(r)),
  updateStatus: async () => updater.getStatus(),
  checkForUpdates: async () => updater.check(),
  installUpdate: async () => updater.install(),
  openUrl: async (url) => {
    if (typeof url !== 'string' || !/^https?:\/\/[^\s]+$/i.test(url) || url.length > 4000) throw new Error(t('열 수 없는 주소'))
    await shell.openExternal(url)
  },
}

/** 우리 화면에서 온 요청인지 확인 (다른 페이지가 실수로 열려도 기능을 못 쓰게) */
function fromApp(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  return DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://')
}

/** 채널 이름 = 메서드 이름. 오류는 메시지만 깔끔하게 화면으로 ({ok:false, error}) */
function registerIpc() {
  for (const name of API_METHODS) {
    const fn = handlers[name] as (...args: unknown[]) => Promise<unknown>
    ipcMain.handle(name, async (e, ...args) => {
      if (!fromApp(e)) return { ok: false, error: t('허용되지 않은 요청') }
      try {
        return { ok: true, data: await fn(...args) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  }
}

// ───────── 창 ─────────

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Branchly',
    // 설치본은 exe에 박힌 아이콘을 쓰고, 개발 중에는 build/icon.png
    ...(!app.isPackaged && fs.existsSync(path.join(app.getAppPath(), 'build', 'icon.png')) ? { icon: path.join(app.getAppPath(), 'build', 'icon.png') } : {}),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14161b' : '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win?.show())

  // 창 크기가 바뀌면(최대화·전체 화면 포함) 자동 배율 다시 계산
  let t: NodeJS.Timeout | undefined
  win.on('resize', () => {
    clearTimeout(t)
    t = setTimeout(applyZoom, 60)
  })
  win.webContents.on('did-finish-load', applyZoom)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return
    if (input.key === '=' || input.key === '+') zoomStep(1)
    else if (input.key === '-' || input.key === '_') zoomStep(-1)
    else if (input.key === '0') setZoom(0)
    else return
    e.preventDefault()
  })

  // 앱 화면 밖으로 이동 금지, 외부 링크(http/https)는 기본 브라우저로
  win.webContents.on('will-navigate', (e, url) => {
    if (DEV_URL ? !url.startsWith(DEV_URL) : !url.startsWith('file://')) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

/** Git이 없으면(설치 파일로 처음 깐 PC 등) 설치 안내. 앱은 그대로 열린다 */
async function checkGit() {
  try {
    await git(os.homedir(), ['--version'])
  } catch {
    const r = await dialog.showMessageBox(win!, {
      type: 'warning',
      title: t('Git이 필요해요'),
      message: t('Git이 설치돼 있지 않아요'),
      detail: t('Branchly는 이 PC에 설치된 Git으로 동작해요. Git for Windows를 설치한 뒤 Branchly를 다시 켜 주세요.'),
      buttons: [t('Git 설치 페이지 열기'), t('닫기')],
      defaultId: 0,
      cancelId: 1,
    })
    if (r.response === 0) void shell.openExternal('https://git-scm.com/download/win')
  }
}

app.whenReady().then(() => {
  if (!firstInstance) return
  const s = readSettings()
  setLang(resolveLang(s.language, app.getLocale()))
  applyTheme(s)
  zoomSetting = s.zoom
  registerIpc()
  createWindow()
  win!.once('ready-to-show', () => void checkGit())
  updater.initUpdater(() => readSettings())
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
