// 저장소 작업. 출력은 기계용 형식(-z, --porcelain, 고정 format)만 읽는다. Electron을 쓰지 않아 테스트에서 바로 부를 수 있다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git, gitBuffer, GitError } from './git'
import {
  DETAIL_FORMAT, LOG_FORMAT, parseBlame, parseDetail, parseLog, parseNameStatusZ, parseRemotes, parseStashes,
  parseStatus, parseSubmodules, parseTrack,
} from '../shared/parse'
import { buildTodo } from '../shared/rebase'
import { t } from '../shared/i18n'
import type {
  BlameLine, Branches, Commit, CommitDetail, CommitOptions, ConflictSide, DiffKind, DiffOptions, FetchOptions,
  FileChange, FileContent, FlowConfig, FlowType, Identity, LfsInfo, LogQuery, MergeOptions, OpResult, Operation,
  PatchMode, PullOptions, PushOptions, RebaseStep, Remote, RepoInfo, ResetMode, Stash, Status, Submodule,
} from '../shared/types'

// ───────── 저장소 ─────────

export async function resolveRepo(dir: string): Promise<RepoInfo> {
  try {
    const { stdout } = await git(dir, ['rev-parse', '--show-toplevel'])
    const top = path.resolve(stdout.trim())
    return { path: top, name: path.basename(top) }
  } catch (e) {
    if (e instanceof GitError) throw new Error(t('git 저장소가 아닙니다: {dir}', { dir }))
    throw e
  }
}

export async function clone(url: string, parentDir: string, name: string, branch: string | null, recursive: boolean): Promise<RepoInfo> {
  const dest = path.join(parentDir, name)
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) throw new Error(t('이미 파일이 있는 폴더입니다: {path}', { path: dest }))
  const args = ['clone']
  if (branch) args.push('--branch', branch)
  if (recursive) args.push('--recurse-submodules')
  args.push('--', url, dest)
  await git(parentDir, args)
  return resolveRepo(dest)
}

export async function init(dir: string): Promise<RepoInfo> {
  fs.mkdirSync(dir, { recursive: true })
  await git(dir, ['init', '-b', 'main'])
  return resolveRepo(dir)
}

async function gitDir(repo: string): Promise<string> {
  return path.resolve((await git(repo, ['rev-parse', '--absolute-git-dir'])).stdout.trim())
}

async function hasHead(repo: string): Promise<boolean> {
  try {
    await git(repo, ['rev-parse', '--verify', '-q', 'HEAD'])
    return true
  } catch {
    return false
  }
}

const readText = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/** .git 안의 표시 파일로 진행 중인 작업을 알아낸다 */
export async function operation(repo: string): Promise<Operation | null> {
  const dir = await gitDir(repo)
  const has = (f: string) => fs.existsSync(path.join(dir, f))
  if (has('rebase-merge') || has('rebase-apply')) {
    const d = has('rebase-merge') ? 'rebase-merge' : 'rebase-apply'
    const step = Number(readText(path.join(dir, d, has('rebase-merge') ? 'msgnum' : 'next')).trim()) || null
    const total = Number(readText(path.join(dir, d, has('rebase-merge') ? 'end' : 'last')).trim()) || null
    const onto = readText(path.join(dir, d, 'onto')).trim().slice(0, 7)
    const head = readText(path.join(dir, d, 'head-name')).trim().replace(/^refs\/heads\//, '')
    return { kind: 'rebase', detail: head ? `${head} → ${onto}` : onto, step, total }
  }
  if (has('MERGE_HEAD')) return { kind: 'merge', detail: readText(path.join(dir, 'MERGE_MSG')).split('\n')[0] ?? '', step: null, total: null }
  if (has('CHERRY_PICK_HEAD')) return { kind: 'cherry-pick', detail: readText(path.join(dir, 'CHERRY_PICK_HEAD')).trim().slice(0, 7), step: null, total: null }
  if (has('REVERT_HEAD')) return { kind: 'revert', detail: readText(path.join(dir, 'REVERT_HEAD')).trim().slice(0, 7), step: null, total: null }
  return null
}

// ───────── 읽기 ─────────

export async function status(repo: string): Promise<Status> {
  const { stdout } = await git(repo, ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'])
  const s = parseStatus(stdout)
  s.operation = await operation(repo)
  return s
}

export async function log(repo: string, q: LogQuery): Promise<Commit[]> {
  if (!(await hasHead(repo))) {
    const { stdout } = await git(repo, ['for-each-ref', '--count=1', '--format=%(refname)'])
    if (!stdout.trim()) return []
  }
  const n = Math.max(1, Math.min(q.limit, 20000))
  const args = ['log', `--max-count=${n}`, `--format=${LOG_FORMAT}`]
  const search = q.search && q.search.text.trim() ? { mode: q.search.mode, text: q.search.text.trim() } : null
  if (search?.mode === 'sha') {
    if (!/^[0-9a-f]{4,64}$/i.test(search.text)) return []
    try {
      const sha = (await git(repo, ['rev-parse', '--verify', '-q', `${search.text}^{commit}`])).stdout.trim()
      return parseLog((await git(repo, ['log', '-1', `--format=${LOG_FORMAT}`, sha])).stdout)
    } catch {
      return []
    }
  }
  args.push('--topo-order', '--date-order')
  if (q.scope === 'all') args.push('--exclude=refs/stash', '--all') // 스태시는 사이드바에서 따로
  else if (q.scope === 'local') args.push('--branches', '--tags', 'HEAD')
  else args.push('HEAD')
  if (search?.mode === 'message') args.push('--regexp-ignore-case', '--fixed-strings', `--grep=${search.text}`)
  if (search?.mode === 'author') args.push('--regexp-ignore-case', '--fixed-strings', `--author=${search.text}`)
  if (search?.mode === 'content') args.push(`-S${search.text}`)
  if (search?.mode === 'file') args.push('--', `:(icase,glob)**/*${search.text.replace(/[*?[\]]/g, '')}*`)
  return parseLog((await git(repo, args)).stdout)
}

export async function branches(repo: string): Promise<Branches> {
  const { stdout } = await git(repo, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)%00%(objecttype)',
    'refs/heads', 'refs/remotes', 'refs/tags',
  ])
  const out: Branches = { local: [], remote: [], tags: [] }
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const [ref, sha, head, upstream, track, type] = line.split('\x00')
    if (ref.startsWith('refs/heads/')) {
      out.local.push({ name: ref.slice(11), sha, current: head === '*', upstream: upstream || null, ...parseTrack(track ?? '') })
    } else if (ref.startsWith('refs/remotes/')) {
      const name = ref.slice(13)
      if (!name.endsWith('/HEAD')) out.remote.push({ name, sha })
    } else if (ref.startsWith('refs/tags/')) {
      out.tags.push({ name: ref.slice(10), sha, annotated: type === 'tag' })
    }
  }
  return out
}

export async function stashes(repo: string): Promise<Stash[]> {
  const { stdout } = await git(repo, ['stash', 'list', '--format=%gd%x00%H%x00%at%x00%gs'])
  return parseStashes(stdout)
}

export async function remotes(repo: string): Promise<Remote[]> {
  return parseRemotes((await git(repo, ['remote', '-v'])).stdout)
}

export async function remoteNames(repo: string): Promise<string[]> {
  return (await git(repo, ['remote'])).stdout.split('\n').map((s) => s.trim()).filter(Boolean)
}

export async function submodules(repo: string): Promise<Submodule[]> {
  if (!fs.existsSync(path.join(repo, '.gitmodules'))) return []
  return parseSubmodules((await git(repo, ['submodule', 'status'])).stdout)
}

export async function commitDetail(repo: string, sha: string): Promise<CommitDetail> {
  const [header, files] = await Promise.all([
    git(repo, ['show', '-s', `--format=${DETAIL_FORMAT}`, sha]),
    git(repo, ['show', '--format=', '--name-status', '-z', '-M', '-m', '--first-parent', sha]),
  ])
  return parseDetail(header.stdout, files.stdout)
}

const ws = (o?: DiffOptions) => (o?.ignoreWhitespace ? ['-w'] : [])

export async function diffWorking(repo: string, file: string, kind: DiffKind, o?: DiffOptions): Promise<string> {
  if (kind === 'untracked') {
    // 새 파일은 빈 파일과 비교 (git이 /dev/null을 직접 처리, 윈도우 포함). 차이가 있으면 종료 코드 1
    return (await git(repo, ['diff', '--no-index', '--no-ext-diff', '--', '/dev/null', file], { okCodes: [1] })).stdout
  }
  const args = ['diff', '-M', '--no-ext-diff', ...ws(o)]
  if (kind === 'staged') args.push('--cached')
  args.push('--', file)
  return (await git(repo, args)).stdout
}

export async function diffCommit(repo: string, sha: string, file: string, o?: DiffOptions): Promise<string> {
  return (await git(repo, ['show', '--format=', '-M', '-m', '--first-parent', '--no-ext-diff', ...ws(o), sha, '--', file])).stdout
}

export async function diffRange(repo: string, from: string, to: string): Promise<FileChange[]> {
  return parseNameStatusZ((await git(repo, ['diff', '--name-status', '-z', '-M', from, to])).stdout)
}

export async function diffRangeFile(repo: string, from: string, to: string, file: string, o?: DiffOptions): Promise<string> {
  return (await git(repo, ['diff', '-M', '--no-ext-diff', ...ws(o), from, to, '--', file])).stdout
}

/** 작업 폴더의 파일 내용 (충돌 표시 보기 등). 2MB 넘으면 내용 없이 */
export function readWorkingFile(repo: string, file: string): FileContent {
  const full = path.join(repo, file)
  const st = fs.statSync(full)
  if (st.size > 2 * 1024 * 1024) return { text: null, binary: false, tooLarge: true, size: st.size }
  const buf = fs.readFileSync(full)
  const binary = buf.subarray(0, 8000).includes(0)
  return { text: binary ? null : buf.toString('utf8'), binary, tooLarge: false, size: st.size }
}

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon' }

/** 이미지 파일 미리보기 (data: 주소). rev가 null이면 작업 폴더의 파일. 이미지가 아니거나 없으면 null */
export async function imagePreview(repo: string, rev: string | null, file: string): Promise<string | null> {
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()]
  if (!type) return null
  try {
    const buf = rev ? await gitBuffer(repo, ['show', `${rev}:${file}`]) : fs.readFileSync(path.join(repo, file))
    if (buf.length > 10 * 1024 * 1024) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function blame(repo: string, file: string, rev: string | null): Promise<BlameLine[]> {
  const args = ['blame', '--porcelain']
  if (rev) args.push(rev)
  args.push('--', file)
  return parseBlame((await git(repo, args)).stdout)
}

export async function fileLog(repo: string, file: string, limit: number): Promise<Commit[]> {
  const n = Math.max(1, Math.min(limit, 5000))
  return parseLog((await git(repo, ['log', '--follow', `--max-count=${n}`, `--format=${LOG_FORMAT}`, '--', file])).stdout)
}

export async function lastCommitMessage(repo: string): Promise<string> {
  if (!(await hasHead(repo))) return ''
  return (await git(repo, ['log', '-1', '--format=%B'])).stdout.trim()
}

export async function recentMessages(repo: string): Promise<string[]> {
  if (!(await hasHead(repo))) return []
  const subjects = (await git(repo, ['log', '-30', '--format=%s'])).stdout.split('\n').map((s) => s.trim()).filter(Boolean)
  return [...new Set(subjects)].slice(0, 15)
}

/** base 이후(base 제외) 현재 브랜치 커밋, 오래된 것부터. 병합 커밋이 있으면 거부 */
export async function rebaseSteps(repo: string, base: string): Promise<RebaseStep[]> {
  const merges = (await git(repo, ['rev-list', '--merges', `${base}..HEAD`])).stdout.trim()
  if (merges) throw new Error(t('병합 커밋이 있는 구간은 대화형 리베이스를 할 수 없어요'))
  const out = (await git(repo, ['log', '--reverse', '--format=%H%x00%s%x00%B%x1e', `${base}..HEAD`])).stdout
  return out.split('\x1e').map((r) => r.replace(/^\n+/, '')).filter(Boolean).map((r) => {
    const [sha, subject, body] = r.split('\x00')
    return { action: 'pick' as const, sha, subject, message: (body ?? subject).trim() }
  })
}

// ───────── 충돌이 날 수 있는 작업 ─────────

/** 실패했는데 충돌·진행 중 작업이 남았으면 오류 대신 {conflicts: true} */
async function mayConflict(repo: string, fn: () => Promise<{ stdout: string; stderr: string }>): Promise<OpResult> {
  try {
    const r = await fn()
    return { conflicts: false, output: (r.stdout + '\n' + r.stderr).trim() }
  } catch (e) {
    if (e instanceof GitError) {
      const s = await status(repo)
      if (s.conflicted.length > 0 || s.operation) return { conflicts: true, output: (e.stdout + '\n' + e.stderr).trim() }
    }
    throw e
  }
}

// ───────── 작업 사본 ─────────

export async function stage(repo: string, files: string[]): Promise<void> {
  if (files.length) await git(repo, ['add', '-A', '--', ...files])
}

export async function unstage(repo: string, files: string[]): Promise<void> {
  if (files.length === 0) return
  if (await hasHead(repo)) await git(repo, ['restore', '--staged', '--', ...files])
  else await git(repo, ['rm', '--cached', '-r', '-q', '--', ...files]) // 첫 커밋 전
}

/** 덩어리·줄 단위: stage = 인덱스에, unstage = 인덱스에서 거꾸로, discard = 작업 폴더에서 거꾸로 */
export async function applyPatch(repo: string, patch: string, mode: PatchMode): Promise<void> {
  const args = ['apply', '--recount', '--whitespace=nowarn']
  if (mode !== 'discard') args.push('--cached')
  if (mode !== 'stage') args.push('-R')
  args.push('-')
  await git(repo, args, { input: patch })
}

/** 추적 중인 파일의 변경 버리기 (includeStaged면 스테이지된 것까지 HEAD로). 새 파일 지우기는 main이 휴지통으로 */
export async function discard(repo: string, files: string[], includeStaged: boolean): Promise<void> {
  if (files.length === 0) return
  if (includeStaged && (await hasHead(repo))) await git(repo, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...files])
  else await git(repo, ['restore', '--worktree', '--', ...files])
}

export function ignore(repo: string, pattern: string): void {
  const file = path.join(repo, '.gitignore')
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (cur.split(/\r?\n/).includes(pattern)) return
  fs.writeFileSync(file, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + pattern + '\n')
}

export async function untrack(repo: string, files: string[]): Promise<void> {
  if (files.length) await git(repo, ['rm', '--cached', '-r', '-q', '--', ...files])
}

export async function commit(repo: string, message: string, o: CommitOptions): Promise<string> {
  const args = ['commit', '-F', '-']
  if (o.amend) args.push('--amend')
  if (o.signoff) args.push('--signoff')
  if (o.noVerify) args.push('--no-verify')
  const r = await git(repo, args, { input: message })
  let out = r.stdout.trim()
  if (o.push) out += '\n' + (await pushCurrent(repo))
  return out
}

export async function resolveConflict(repo: string, file: string, side: ConflictSide): Promise<void> {
  if (side !== 'mark') await git(repo, ['checkout', side === 'ours' ? '--ours' : '--theirs', '--', file])
  await git(repo, ['add', '--', file])
}

export async function mergeTool(repo: string, file: string): Promise<void> {
  const tool = (await git(repo, ['config', '--get', 'merge.tool'], { okCodes: [1] })).stdout.trim()
  if (!tool) throw new Error(t('외부 병합 도구가 없습니다. git config --global merge.tool <도구 이름>으로 먼저 정하세요.'))
  await git(repo, ['mergetool', '--no-prompt', '--', file])
}

// ───────── 브랜치·커밋 ─────────

/** 브랜치 이름 검사는 git에 맡긴다 (규칙이 많음) */
async function checkBranchName(repo: string, name: string): Promise<void> {
  try {
    await git(repo, ['check-ref-format', '--branch', name])
  } catch {
    throw new Error(t('쓸 수 없는 브랜치 이름입니다: {name}', { name }))
  }
}

export async function checkout(repo: string, ref: string): Promise<void> {
  await git(repo, ['checkout', '-q', ref, '--'])
}

export async function checkoutDetached(repo: string, sha: string): Promise<void> {
  await git(repo, ['checkout', '-q', '--detach', sha])
}

export async function checkoutRemote(repo: string, remoteBranch: string, localName: string): Promise<void> {
  await checkBranchName(repo, localName)
  await git(repo, ['checkout', '-q', '-b', localName, '--track', remoteBranch])
}

export async function createBranch(repo: string, name: string, start: string | null, doCheckout: boolean): Promise<void> {
  await checkBranchName(repo, name)
  if (doCheckout) await git(repo, ['checkout', '-q', '-b', name, ...(start ? [start] : [])])
  else await git(repo, ['branch', name, ...(start ? [start] : [])])
}

export async function renameBranch(repo: string, from: string, to: string): Promise<void> {
  await checkBranchName(repo, to)
  await git(repo, ['branch', '-m', from, to])
}

export async function deleteBranch(repo: string, name: string, force: boolean, remoteToo: boolean): Promise<void> {
  let upstream = ''
  if (remoteToo) upstream = (await git(repo, ['rev-parse', '--abbrev-ref', `${name}@{upstream}`], { okCodes: [128] })).stdout.trim()
  await git(repo, ['branch', force ? '-D' : '-d', name])
  if (remoteToo && upstream.includes('/') && !upstream.includes('@{')) await deleteRemoteBranch(repo, upstream)
}

/** "origin/feature/x" → git push origin --delete feature/x */
export async function deleteRemoteBranch(repo: string, remoteBranch: string): Promise<void> {
  const rs = await remoteNames(repo)
  const remote = rs.filter((r) => remoteBranch.startsWith(r + '/')).sort((a, b) => b.length - a.length)[0]
  if (!remote) throw new Error(t('원격 브랜치를 찾을 수 없습니다: {branch}', { branch: remoteBranch }))
  await git(repo, ['push', remote, '--delete', remoteBranch.slice(remote.length + 1)])
}

export async function setUpstream(repo: string, branch: string, upstream: string | null): Promise<void> {
  if (upstream) await git(repo, ['branch', `--set-upstream-to=${upstream}`, branch])
  else await git(repo, ['branch', '--unset-upstream', branch])
}

export function merge(repo: string, ref: string, o: MergeOptions): Promise<OpResult> {
  const args = ['merge', '--no-edit']
  if (o.squash) args.push('--squash')
  else if (o.noFF) args.push('--no-ff')
  if (o.message.trim() && !o.squash) args.push('-m', o.message.trim())
  args.push(ref)
  return mayConflict(repo, () => git(repo, args))
}

export function rebase(repo: string, onto: string): Promise<OpResult> {
  return mayConflict(repo, () => git(repo, ['rebase', onto]))
}

/** 편집기 대신: GIT_SEQUENCE_EDITOR가 미리 만든 할 일 목록을 복사해 넣는다 (Git for Windows의 sh·cp 사용) */
export async function interactiveRebase(repo: string, base: string, steps: RebaseStep[]): Promise<OpResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'branchly-rebase-'))
  const slash = (p: string) => p.replace(/\\/g, '/')
  try {
    const { todo, messages } = buildTodo(steps, (n) => slash(path.join(tmp, `msg-${n}.txt`)))
    for (const m of messages) fs.writeFileSync(m.file, m.text)
    const todoFile = slash(path.join(tmp, 'todo.txt'))
    fs.writeFileSync(todoFile, todo)
    return await mayConflict(repo, () => git(repo, ['rebase', '-i', base], { env: { GIT_SEQUENCE_EDITOR: `cp '${todoFile}'` } }))
  } finally {
    // 충돌로 멈추면 남은 exec가 메시지 파일을 읽어야 하므로, 진행 중이 아닐 때만 지운다
    if (!(await operation(repo))) fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export function cherryPick(repo: string, shas: string[]): Promise<OpResult> {
  return mayConflict(repo, () => git(repo, ['cherry-pick', ...shas]))
}

export async function revert(repo: string, sha: string): Promise<OpResult> {
  const parents = (await git(repo, ['rev-list', '--parents', '-n', '1', sha])).stdout.trim().split(' ').length - 1
  return mayConflict(repo, () => git(repo, ['revert', '--no-edit', ...(parents > 1 ? ['-m', '1'] : []), sha]))
}

export async function reset(repo: string, sha: string, mode: ResetMode): Promise<void> {
  await git(repo, ['reset', `--${mode}`, sha])
}

export async function continueOperation(repo: string): Promise<OpResult> {
  const op = await operation(repo)
  if (!op) throw new Error(t('진행 중인 작업이 없습니다'))
  const s = await status(repo)
  if (s.conflicted.length > 0) throw new Error(t('아직 해결하지 않은 충돌 파일이 있습니다'))
  if (op.kind === 'merge') return mayConflict(repo, () => git(repo, ['commit', '--no-edit']))
  if (op.kind === 'rebase') return mayConflict(repo, () => git(repo, ['rebase', '--continue']))
  if (op.kind === 'cherry-pick') return mayConflict(repo, () => git(repo, ['cherry-pick', '--continue']))
  return mayConflict(repo, () => git(repo, ['revert', '--continue']))
}

export async function abortOperation(repo: string): Promise<void> {
  const op = await operation(repo)
  if (!op) throw new Error(t('진행 중인 작업이 없습니다'))
  const cmd = op.kind === 'merge' ? 'merge' : op.kind
  await git(repo, [cmd, '--abort'])
}

export async function skipOperation(repo: string): Promise<OpResult> {
  const op = await operation(repo)
  if (!op || (op.kind !== 'rebase' && op.kind !== 'cherry-pick')) throw new Error(t('건너뛸 수 있는 작업이 아닙니다'))
  return mayConflict(repo, () => git(repo, [op.kind, '--skip']))
}

// ───────── 태그·스태시 ─────────

export async function createTag(repo: string, name: string, sha: string, message: string, pushTo: string | null): Promise<void> {
  try {
    await git(repo, ['check-ref-format', `refs/tags/${name}`])
  } catch {
    throw new Error(t('쓸 수 없는 태그 이름입니다: {name}', { name }))
  }
  if (message.trim()) await git(repo, ['tag', '-a', name, '-m', message.trim(), sha])
  else await git(repo, ['tag', name, sha])
  if (pushTo) await git(repo, ['push', pushTo, `refs/tags/${name}`])
}

export async function deleteTag(repo: string, name: string, remote: string | null): Promise<void> {
  await git(repo, ['tag', '-d', name])
  if (remote) await git(repo, ['push', remote, '--delete', `refs/tags/${name}`])
}

export async function stashSave(repo: string, message: string, keepIndex: boolean, includeUntracked: boolean): Promise<void> {
  const args = ['stash', 'push']
  if (keepIndex) args.push('--keep-index')
  if (includeUntracked) args.push('--include-untracked')
  if (message.trim()) args.push('-m', message.trim())
  await git(repo, args)
}

export function stashApply(repo: string, index: number, pop: boolean): Promise<OpResult> {
  return mayConflict(repo, () => git(repo, ['stash', pop ? 'pop' : 'apply', `stash@{${index}}`]))
}

export async function stashDrop(repo: string, index: number): Promise<void> {
  await git(repo, ['stash', 'drop', `stash@{${index}}`])
}

export async function stashBranch(repo: string, index: number, name: string): Promise<void> {
  await checkBranchName(repo, name)
  await git(repo, ['stash', 'branch', name, `stash@{${index}}`])
}

// ───────── 원격 ─────────

const out = (r: { stdout: string; stderr: string }) => (r.stdout + '\n' + r.stderr).trim()

export async function fetch(repo: string, o: FetchOptions): Promise<string> {
  const args = ['fetch']
  if (o.remote) args.push(o.remote)
  else args.push('--all')
  if (o.prune) args.push('--prune')
  if (o.tags) args.push('--tags')
  return out(await git(repo, args))
}

export function pull(repo: string, o: PullOptions): Promise<OpResult> {
  const args = ['pull', o.rebase ? '--rebase' : '--no-rebase']
  if (o.remote) {
    args.push(o.remote)
    if (o.branch) args.push(o.branch)
  }
  return mayConflict(repo, () => git(repo, args))
}

export async function push(repo: string, o: PushOptions): Promise<string> {
  const args = ['push']
  if (o.setUpstream) args.push('-u')
  if (o.force) args.push('--force-with-lease')
  if (o.tags) args.push('--tags')
  args.push(o.remote, ...o.branches)
  return out(await git(repo, args))
}

/** 현재 브랜치 올리기 (추적 브랜치가 없으면 origin에 -u) */
export async function pushCurrent(repo: string): Promise<string> {
  const s = await status(repo)
  if (!s.branch) throw new Error(t('브랜치가 아닌 곳(detached HEAD)에서는 Push할 수 없습니다'))
  if (s.upstream) return out(await git(repo, ['push']))
  const rs = await remoteNames(repo)
  if (rs.length === 0) throw new Error(t('원격 저장소가 없습니다'))
  return out(await git(repo, ['push', '-u', rs.includes('origin') ? 'origin' : rs[0], 'HEAD']))
}

export async function remoteAdd(repo: string, name: string, url: string): Promise<void> {
  await git(repo, ['remote', 'add', name, url])
}
export async function remoteSetUrl(repo: string, name: string, url: string): Promise<void> {
  await git(repo, ['remote', 'set-url', name, url])
}
export async function remoteRename(repo: string, from: string, to: string): Promise<void> {
  await git(repo, ['remote', 'rename', from, to])
}
export async function remoteRemove(repo: string, name: string): Promise<void> {
  await git(repo, ['remote', 'remove', name])
}

// ───────── 패치·내보내기 ─────────

export async function formatPatch(repo: string, shas: string[]): Promise<string> {
  const parts: string[] = []
  for (const sha of shas) parts.push((await git(repo, ['format-patch', '-1', '--stdout', sha])).stdout)
  return parts.join('')
}

/** 메일 형식(From …)이면 git am(커밋까지), 아니면 git apply(작업 폴더에만) */
export function applyPatchFile(repo: string, file: string): Promise<OpResult> {
  const head = readText(file).slice(0, 200)
  if (/^From [0-9a-f]{40}/.test(head)) return mayConflict(repo, () => git(repo, ['am', '--3way', file]))
  return mayConflict(repo, () => git(repo, ['apply', '--3way', file]))
}

export async function archive(repo: string, sha: string, file: string): Promise<void> {
  await git(repo, ['archive', '--format=zip', '-o', file, sha])
}

export async function fileAtRevision(repo: string, sha: string, file: string): Promise<Buffer> {
  return gitBuffer(repo, ['show', `${sha}:${file}`])
}

// ───────── 저장소 설정 ─────────

export const readGitignore = (repo: string) => readText(path.join(repo, '.gitignore'))
export function writeGitignore(repo: string, text: string): void {
  fs.writeFileSync(path.join(repo, '.gitignore'), text.endsWith('\n') || !text ? text : text + '\n')
}

async function configGet(repo: string, scope: '--global' | '--local', key: string): Promise<string> {
  return (await git(repo, ['config', scope, '--get', key], { okCodes: [1] })).stdout.trim()
}

async function configSet(repo: string, scope: '--global' | '--local', key: string, value: string): Promise<void> {
  if (value) await git(repo, ['config', scope, key, value])
  else await git(repo, ['config', scope, '--unset', key], { okCodes: [5] })
}

/** repo가 null이면 전역(모든 저장소), 아니면 이 저장소만 */
export async function identity(repo: string | null): Promise<Identity> {
  const cwd = repo ?? os.homedir()
  const scope = repo ? '--local' : '--global'
  return { name: await configGet(cwd, scope, 'user.name'), email: await configGet(cwd, scope, 'user.email') }
}

export async function setIdentity(repo: string | null, id: Identity): Promise<void> {
  const cwd = repo ?? os.homedir()
  const scope = repo ? '--local' : '--global'
  await configSet(cwd, scope, 'user.name', id.name.trim())
  await configSet(cwd, scope, 'user.email', id.email.trim())
}

// ───────── Git 흐름 (git-flow 확장 없이 같은 규칙으로) ─────────

export async function flowConfig(repo: string): Promise<FlowConfig> {
  const get = (k: string) => configGet(repo, '--local', k)
  const master = await get('gitflow.branch.master')
  const local = (await branches(repo)).local.map((b) => b.name)
  return {
    initialized: !!master,
    master: master || (local.includes('main') ? 'main' : local.includes('master') ? 'master' : 'main'),
    develop: (await get('gitflow.branch.develop')) || 'develop',
    feature: (await get('gitflow.prefix.feature')) || 'feature/',
    release: (await get('gitflow.prefix.release')) || 'release/',
    hotfix: (await get('gitflow.prefix.hotfix')) || 'hotfix/',
    versionTag: await get('gitflow.prefix.versiontag'),
  }
}

export async function flowInit(repo: string, c: FlowConfig): Promise<void> {
  for (const b of [c.master, c.develop]) await checkBranchName(repo, b)
  const set = (k: string, v: string) => git(repo, ['config', '--local', k, v])
  await set('gitflow.branch.master', c.master)
  await set('gitflow.branch.develop', c.develop)
  await set('gitflow.prefix.feature', c.feature)
  await set('gitflow.prefix.release', c.release)
  await set('gitflow.prefix.hotfix', c.hotfix)
  await set('gitflow.prefix.versiontag', c.versionTag)
  const local = (await branches(repo)).local.map((b) => b.name)
  if (!local.includes(c.master)) throw new Error(t('메인 브랜치 {branch}가 없습니다', { branch: c.master }))
  if (!local.includes(c.develop)) await git(repo, ['branch', c.develop, c.master])
}

const prefixOf = (c: FlowConfig, t: FlowType) => (t === 'feature' ? c.feature : t === 'release' ? c.release : c.hotfix)

export async function flowStart(repo: string, type: FlowType, name: string): Promise<void> {
  const c = await flowConfig(repo)
  if (!c.initialized) throw new Error(t('먼저 Git 흐름을 설정하세요'))
  await createBranch(repo, prefixOf(c, type) + name, type === 'hotfix' ? c.master : c.develop, true)
}

/** 끝내기: feature → develop에 병합 / release·hotfix → master에 병합 + 태그 + develop에 병합. 충돌이면 거기서 멈춤 */
export async function flowFinish(repo: string, type: FlowType, name: string, tagMessage: string, keep: boolean): Promise<OpResult> {
  const c = await flowConfig(repo)
  const branch = prefixOf(c, type) + name
  const outs: string[] = []
  const step = async (target: string): Promise<OpResult | null> => {
    await checkout(repo, target)
    const r = await merge(repo, branch, { noFF: true, squash: false, message: `Merge branch '${branch}' into ${target}` })
    outs.push(r.output)
    return r.conflicts ? r : null
  }
  if (type === 'feature') {
    const r = await step(c.develop)
    if (r) return r
  } else {
    let r = await step(c.master)
    if (r) return r
    await git(repo, ['tag', '-a', c.versionTag + name, '-m', tagMessage.trim() || `${type} ${name}`])
    r = await step(c.develop)
    if (r) return r
  }
  if (!keep) await git(repo, ['branch', '-d', branch])
  return { conflicts: false, output: outs.join('\n').trim() }
}

// ───────── 서브모듈·LFS ─────────

export async function submoduleUpdate(repo: string, sub: string | null): Promise<string> {
  return out(await git(repo, ['submodule', 'update', '--init', '--recursive', ...(sub ? ['--', sub] : [])]))
}

export async function submoduleAdd(repo: string, url: string, sub: string): Promise<void> {
  await git(repo, ['submodule', 'add', '--', url, sub])
}

export async function lfsInfo(repo: string): Promise<LfsInfo> {
  try {
    await git(repo, ['lfs', 'version'])
  } catch {
    return { installed: false, patterns: [] }
  }
  const { stdout } = await git(repo, ['lfs', 'track'])
  const patterns = stdout.split('\n').map((l) => l.match(/^\s+(\S.*?) \(/)?.[1]).filter((p): p is string => !!p)
  return { installed: true, patterns }
}

export async function lfsTrack(repo: string, pattern: string, track: boolean): Promise<void> {
  await git(repo, ['lfs', track ? 'track' : 'untrack', pattern])
}
