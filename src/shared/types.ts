// 메인 프로세스(git)와 화면이 같이 쓰는 데이터 모양

export type RefKind = 'head' | 'branch' | 'remote' | 'tag'

export interface Ref {
  kind: RefKind
  name: string
}

export interface Commit {
  sha: string
  parents: string[]
  author: string
  email: string
  /** 작성 시각 (유닉스 초) */
  time: number
  refs: Ref[]
  subject: string
}

/** 변경 종류: M 수정, A 추가, D 삭제, R 이름 바꿈, C 복사, T 형식 바뀜, U 충돌, ? 새 파일(추적 안 함) */
export type ChangeKind = 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?'

export interface FileChange {
  path: string
  /** 이름을 바꾼 경우 원래 경로 */
  origPath?: string
  kind: ChangeKind
}

export type OperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

/** 진행 중인 작업 (충돌로 멈춘 병합·리베이스 등) */
export interface Operation {
  kind: OperationKind
  /** 병합 메시지 첫 줄, 리베이스 대상 등 */
  detail: string
  step: number | null
  total: number | null
}

export interface Status {
  branch: string | null
  /** HEAD 커밋 (밖에서 커밋·체크아웃했는지 알아채는 데 씀) */
  head: string | null
  detached: boolean
  /** 커밋이 하나도 없는 새 저장소 */
  unborn: boolean
  upstream: string | null
  ahead: number
  behind: number
  staged: FileChange[]
  unstaged: FileChange[]
  conflicted: FileChange[]
  operation: Operation | null
}

export interface Branch {
  name: string
  current: boolean
  upstream: string | null
  sha: string
  /** 추적 브랜치보다 앞섬/뒤처짐 */
  ahead: number
  behind: number
  gone: boolean
}

export interface Branches {
  local: Branch[]
  remote: { name: string; sha: string }[]
  tags: { name: string; sha: string; annotated: boolean }[]
}

export interface Stash {
  index: number
  sha: string
  message: string
  time: number
}

export interface Remote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface Submodule {
  path: string
  sha: string
  state: 'ok' | 'uninitialized' | 'modified' | 'conflict'
}

export interface CommitDetail {
  sha: string
  parents: string[]
  author: string
  email: string
  time: number
  subject: string
  body: string
  files: FileChange[]
}

export interface BlameLine {
  line: number
  sha: string
  author: string
  time: number
  summary: string
  text: string
}

export interface RepoInfo {
  path: string
  name: string
}

export interface FileContent {
  text: string | null
  binary: boolean
  tooLarge: boolean
  size: number
}

export type DiffKind = 'staged' | 'unstaged' | 'untracked'
export type SearchMode = 'message' | 'author' | 'file' | 'content' | 'sha'
export type LogScope = 'all' | 'local' | 'current'

export interface LogQuery {
  limit: number
  scope: LogScope
  search?: { mode: SearchMode; text: string }
}

export interface DiffOptions {
  ignoreWhitespace: boolean
}

export interface CommitOptions {
  amend: boolean
  signoff: boolean
  noVerify: boolean
  /** 커밋 뒤 바로 올리기 */
  push: boolean
}

export interface MergeOptions {
  noFF: boolean
  squash: boolean
  message: string
}

export type ResetMode = 'soft' | 'mixed' | 'hard'

export interface FetchOptions {
  /** null = 모든 원격 */
  remote: string | null
  prune: boolean
  tags: boolean
  /** 자동 Fetch: 로그인 창을 띄우지 않고 조용히(실패해도 넘어감) */
  background?: boolean
}

export interface PullOptions {
  remote: string | null
  branch: string | null
  rebase: boolean
}

export interface PushOptions {
  remote: string
  branches: string[]
  tags: boolean
  force: boolean
  setUpstream: boolean
}

export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

export interface RebaseStep {
  action: RebaseAction
  sha: string
  subject: string
  /** 원래 전체 메시지 (화면이 받음) / 바꿀 메시지 (reword) */
  message: string
}

export type FlowType = 'feature' | 'release' | 'hotfix'

export interface FlowConfig {
  initialized: boolean
  master: string
  develop: string
  feature: string
  release: string
  hotfix: string
  versionTag: string
}

export interface LfsInfo {
  installed: boolean
  patterns: string[]
}

export interface Identity {
  name: string
  email: string
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark'
  /** 외부 편집기 실행 파일 (비우면 Windows 기본 프로그램) */
  editor: string
  diffFontSize: number
  sideBySide: boolean
  ignoreWhitespace: boolean
  /** 화면 배율. 0 = 자동(창 너비에 맞춰 키움), 그 밖에는 고정 배율(0.8~1.75) */
  zoom: number
  /** 켤 때·4시간마다 새 버전 확인 */
  autoUpdate: boolean
  /** 화면 언어. auto = Windows 언어(한국어가 아니면 영어) */
  language: 'auto' | 'ko' | 'en'
  /** 원격 자동 Fetch 간격(분). 0 = 끔 */
  autoFetchMinutes: number
  /** 변경 내용 코드 색칠 */
  syntaxHighlight: boolean
}

export type UpdateState = 'disabled' | 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error'

export interface UpdateStatus {
  current: string
  state: UpdateState
  /** disabled·error일 때 이유 */
  message: string | null
  newVersion: string | null
  /** 받는 중 0~100 */
  progress: number | null
  checkedAt: number | null
}

export interface SshKey {
  file: string
  type: string
  comment: string
  publicKey: string
}

/** 충돌이 날 수 있는 작업의 결과: 충돌이면 화면이 충돌 해결로 안내 */
export interface OpResult {
  conflicts: boolean
  output: string
}

export type ConflictSide = 'ours' | 'theirs' | 'mark'
export type PatchMode = 'stage' | 'unstage' | 'discard'

/** preload가 화면에 열어 주는 기능 (window.api). 이름 = IPC 채널 이름 */
export interface Api {
  // 저장소 열기·만들기
  pickRepo(): Promise<RepoInfo | null>
  openRepo(path: string): Promise<RepoInfo>
  recentRepos(): Promise<RepoInfo[]>
  forgetRepo(path: string): Promise<void>
  startupRepo(): Promise<string | null>
  /** 이미 켜진 상태에서 다시 실행하며 넘긴 폴더들 (가져가면 비워짐) */
  takePendingOpen(): Promise<string[]>
  pickFolder(title: string): Promise<string | null>
  cloneRepo(url: string, parentDir: string, name: string, branch: string | null, recursive: boolean): Promise<RepoInfo>
  initRepo(dir: string): Promise<RepoInfo>

  // 읽기
  status(repo: string): Promise<Status>
  log(repo: string, query: LogQuery): Promise<Commit[]>
  branches(repo: string): Promise<Branches>
  stashes(repo: string): Promise<Stash[]>
  remotes(repo: string): Promise<Remote[]>
  submodules(repo: string): Promise<Submodule[]>
  commitDetail(repo: string, sha: string): Promise<CommitDetail>
  diffWorking(repo: string, path: string, kind: DiffKind, opts: DiffOptions): Promise<string>
  diffCommit(repo: string, sha: string, path: string, opts: DiffOptions): Promise<string>
  diffRange(repo: string, from: string, to: string): Promise<FileChange[]>
  diffRangeFile(repo: string, from: string, to: string, path: string, opts: DiffOptions): Promise<string>
  readWorkingFile(repo: string, path: string): Promise<FileContent>
  imagePreview(repo: string, rev: string | null, path: string): Promise<string | null>
  blame(repo: string, path: string, rev: string | null): Promise<BlameLine[]>
  fileLog(repo: string, path: string, limit: number): Promise<Commit[]>
  lastCommitMessage(repo: string): Promise<string>
  recentMessages(repo: string): Promise<string[]>
  rebaseSteps(repo: string, base: string): Promise<RebaseStep[]>

  // 작업 사본
  stage(repo: string, paths: string[]): Promise<void>
  unstage(repo: string, paths: string[]): Promise<void>
  applyPatch(repo: string, patch: string, mode: PatchMode): Promise<void>
  discard(repo: string, paths: string[], untracked: string[], includeStaged: boolean): Promise<void>
  ignore(repo: string, pattern: string): Promise<void>
  untrack(repo: string, paths: string[]): Promise<void>
  commit(repo: string, message: string, opts: CommitOptions): Promise<string>
  resolveConflict(repo: string, path: string, side: ConflictSide): Promise<void>
  mergeTool(repo: string, path: string): Promise<void>

  // 브랜치·커밋
  checkout(repo: string, ref: string): Promise<void>
  checkoutDetached(repo: string, sha: string): Promise<void>
  checkoutRemote(repo: string, remoteBranch: string, localName: string): Promise<void>
  createBranch(repo: string, name: string, startPoint: string | null, checkout: boolean): Promise<void>
  renameBranch(repo: string, from: string, to: string): Promise<void>
  deleteBranch(repo: string, name: string, force: boolean, remoteToo: boolean): Promise<void>
  deleteRemoteBranch(repo: string, remoteBranch: string): Promise<void>
  setUpstream(repo: string, branch: string, upstream: string | null): Promise<void>
  merge(repo: string, ref: string, opts: MergeOptions): Promise<OpResult>
  rebase(repo: string, onto: string): Promise<OpResult>
  interactiveRebase(repo: string, base: string, steps: RebaseStep[]): Promise<OpResult>
  cherryPick(repo: string, shas: string[]): Promise<OpResult>
  revert(repo: string, sha: string): Promise<OpResult>
  reset(repo: string, sha: string, mode: ResetMode): Promise<void>
  continueOperation(repo: string): Promise<OpResult>
  abortOperation(repo: string): Promise<void>
  skipOperation(repo: string): Promise<OpResult>

  // 태그·스태시
  createTag(repo: string, name: string, sha: string, message: string, push: string | null): Promise<void>
  deleteTag(repo: string, name: string, remote: string | null): Promise<void>
  stashSave(repo: string, message: string, keepIndex: boolean, includeUntracked: boolean): Promise<void>
  stashApply(repo: string, index: number, pop: boolean): Promise<OpResult>
  stashDrop(repo: string, index: number): Promise<void>
  stashBranch(repo: string, index: number, name: string): Promise<void>

  // 원격
  fetch(repo: string, opts: FetchOptions): Promise<string>
  pull(repo: string, opts: PullOptions): Promise<OpResult>
  push(repo: string, opts: PushOptions): Promise<string>
  remoteAdd(repo: string, name: string, url: string): Promise<void>
  remoteSetUrl(repo: string, name: string, url: string): Promise<void>
  remoteRename(repo: string, from: string, to: string): Promise<void>
  remoteRemove(repo: string, name: string): Promise<void>

  // 패치·내보내기
  createPatch(repo: string, shas: string[]): Promise<string | null>
  applyPatchFile(repo: string): Promise<OpResult | null>
  archive(repo: string, sha: string): Promise<string | null>
  saveFileAtRevision(repo: string, sha: string, path: string): Promise<string | null>

  // 저장소 설정
  readGitignore(repo: string): Promise<string>
  writeGitignore(repo: string, text: string): Promise<void>
  identity(repo: string | null): Promise<Identity>
  setIdentity(repo: string | null, id: Identity): Promise<void>
  flowConfig(repo: string): Promise<FlowConfig>
  flowInit(repo: string, cfg: FlowConfig): Promise<void>
  flowStart(repo: string, type: FlowType, name: string): Promise<void>
  flowFinish(repo: string, type: FlowType, name: string, tagMessage: string, keepBranch: boolean): Promise<OpResult>
  submoduleUpdate(repo: string, path: string | null): Promise<string>
  submoduleAdd(repo: string, url: string, path: string): Promise<void>
  lfsInfo(repo: string): Promise<LfsInfo>
  lfsTrack(repo: string, pattern: string, track: boolean): Promise<void>

  // 앱
  settings(): Promise<AppSettings>
  saveSettings(s: AppSettings): Promise<AppSettings>
  sshKeys(): Promise<SshKey[]>
  generateSshKey(comment: string, passphrase: string): Promise<SshKey>
  showInFolder(repo: string, path: string | null): Promise<void>
  openFile(repo: string, path: string): Promise<void>
  openTerminal(repo: string): Promise<void>
  openUrl(url: string): Promise<void>

  // 자동 업데이트
  updateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<UpdateStatus>
  installUpdate(): Promise<void>
}

/** preload가 등록하는 메서드 이름 목록 (main의 handler와 같아야 함) */
export const API_METHODS = [
  'pickRepo', 'openRepo', 'recentRepos', 'forgetRepo', 'startupRepo', 'takePendingOpen', 'pickFolder', 'cloneRepo', 'initRepo',
  'status', 'log', 'branches', 'stashes', 'remotes', 'submodules', 'commitDetail', 'diffWorking', 'diffCommit',
  'diffRange', 'diffRangeFile', 'readWorkingFile', 'imagePreview', 'blame', 'fileLog', 'lastCommitMessage',
  'recentMessages', 'rebaseSteps',
  'stage', 'unstage', 'applyPatch', 'discard', 'ignore', 'untrack', 'commit', 'resolveConflict', 'mergeTool',
  'checkout', 'checkoutDetached', 'checkoutRemote', 'createBranch', 'renameBranch', 'deleteBranch',
  'deleteRemoteBranch', 'setUpstream', 'merge', 'rebase', 'interactiveRebase', 'cherryPick', 'revert', 'reset',
  'continueOperation', 'abortOperation', 'skipOperation',
  'createTag', 'deleteTag', 'stashSave', 'stashApply', 'stashDrop', 'stashBranch',
  'fetch', 'pull', 'push', 'remoteAdd', 'remoteSetUrl', 'remoteRename', 'remoteRemove',
  'createPatch', 'applyPatchFile', 'archive', 'saveFileAtRevision',
  'readGitignore', 'writeGitignore', 'identity', 'setIdentity', 'flowConfig', 'flowInit', 'flowStart', 'flowFinish',
  'submoduleUpdate', 'submoduleAdd', 'lfsInfo', 'lfsTrack',
  'settings', 'saveSettings', 'sshKeys', 'generateSshKey', 'showInFolder', 'openFile', 'openTerminal', 'openUrl',
  'updateStatus', 'checkForUpdates', 'installUpdate',
] as const satisfies readonly (keyof Api)[]
