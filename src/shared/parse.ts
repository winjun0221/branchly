// git 기계용 출력 → 데이터. 화면과 메인 프로세스가 같이 쓰는 순수 함수(테스트: test/parse.test.ts).
import type { BlameLine, ChangeKind, Commit, CommitDetail, FileChange, Ref, Remote, Stash, Status, Submodule } from './types'

/** git log 형식: 칸 구분 NUL(%x00), 커밋 구분 RS(%x1e) */
export const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%at%x00%D%x00%s%x1e'
export const DETAIL_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%b%x1e'

export function parseLog(out: string): Commit[] {
  const commits: Commit[] = []
  for (const record of out.split('\x1e')) {
    const r = record.replace(/^\n+/, '')
    if (!r) continue
    const [sha, parents, author, email, time, refs, subject] = r.split('\x00')
    if (!sha) continue
    commits.push({
      sha,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      author: author ?? '',
      email: email ?? '',
      time: Number(time) || 0,
      refs: parseRefs(refs ?? ''),
      subject: subject ?? '',
    })
  }
  return commits
}

/** %D: "HEAD -> main, origin/main, tag: v1.0, origin/HEAD" */
export function parseRefs(d: string): Ref[] {
  const refs: Ref[] = []
  for (const raw of d.split(', ')) {
    const s = raw.trim()
    if (!s) continue
    if (s.startsWith('HEAD -> ')) {
      refs.push({ kind: 'head', name: s.slice(8) })
    } else if (s === 'HEAD') {
      refs.push({ kind: 'head', name: 'HEAD' })
    } else if (s.startsWith('tag: ')) {
      refs.push({ kind: 'tag', name: s.slice(5) })
    } else if (s.endsWith('/HEAD')) {
      continue // origin/HEAD는 표시하지 않음
    } else if (s.includes('/')) {
      // 로컬 브랜치 이름에도 /가 들어갈 수 있어서(feature/x), 원격인지는 화면에서 원격 목록과 맞춰 본다
      refs.push({ kind: 'remote', name: s })
    } else {
      refs.push({ kind: 'branch', name: s })
    }
  }
  return refs
}

/** 원격 이름 목록을 알 때 feature/x 같은 로컬 브랜치를 원격으로 잘못 본 것을 바로잡는다 */
export function fixRefKinds(refs: Ref[], remotes: string[]): Ref[] {
  return refs.map((r) =>
    r.kind === 'remote' && !remotes.some((rm) => r.name.startsWith(rm + '/')) ? { ...r, kind: 'branch' } : r,
  )
}

function kindOf(c: string): ChangeKind {
  switch (c) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case 'C': return 'C'
    case 'T': return 'T'
    case 'U': return 'U'
    default: return 'M'
  }
}

/** 앞에서 n칸(공백 구분)을 떼고 나머지 전부(경로에 공백이 있어도 됨) */
function splitFields(line: string, n: number): [string[], string] {
  const fields: string[] = []
  let rest = line
  for (let i = 0; i < n; i++) {
    const sp = rest.indexOf(' ')
    if (sp < 0) return [fields, '']
    fields.push(rest.slice(0, sp))
    rest = rest.slice(sp + 1)
  }
  return [fields, rest]
}

/** git status --porcelain=v2 -z --branch --untracked-files=all */
export function parseStatus(out: string): Status {
  const s: Status = { branch: null, head: null, detached: false, unborn: false, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], conflicted: [], operation: null }
  const tokens = out.split('\x00')
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.startsWith('# ')) {
      const [key, ...val] = t.slice(2).split(' ')
      const v = val.join(' ')
      if (key === 'branch.oid') {
        s.unborn = v === '(initial)'
        s.head = s.unborn ? null : v
      }
      else if (key === 'branch.head') {
        s.detached = v === '(detached)'
        s.branch = s.detached ? null : v
      } else if (key === 'branch.upstream') s.upstream = v
      else if (key === 'branch.ab') {
        const m = v.match(/\+(\d+) -(\d+)/)
        if (m) {
          s.ahead = Number(m[1])
          s.behind = Number(m[2])
        }
      }
      continue
    }
    const type = t[0]
    if (type === '1') {
      // 1 XY sub mH mI mW hH hI path
      const [f, path] = splitFields(t, 8)
      push(s, f[1], { path })
    } else if (type === '2') {
      // 2 XY sub mH mI mW hH hI Xscore path NUL origPath
      const [f, path] = splitFields(t, 9)
      const origPath = tokens[++i]
      push(s, f[1], { path, origPath })
    } else if (type === 'u') {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      const [, path] = splitFields(t, 10)
      s.conflicted.push({ path, kind: 'U' })
    } else if (type === '?') {
      s.unstaged.push({ path: t.slice(2), kind: '?' })
    }
  }
  // git처럼 글자 코드 순서 (localeCompare는 환경마다 한글·영문 순서가 달라짐)
  const byPath = (a: FileChange, b: FileChange) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  s.staged.sort(byPath)
  s.unstaged.sort(byPath)
  s.conflicted.sort(byPath)
  return s
}

function push(s: Status, xy: string | undefined, f: { path: string; origPath?: string }) {
  if (!xy || xy.length < 2) return
  const [x, y] = xy
  if (x !== '.') s.staged.push({ ...f, kind: kindOf(x) })
  if (y !== '.') s.unstaged.push({ path: f.path, kind: kindOf(y) })
}

/** git show --name-status -z 의 파일 목록 부분: "M\0path\0R100\0old\0new\0..." */
export function parseNameStatusZ(out: string): FileChange[] {
  const t = out.split('\x00').filter((x, i, arr) => x !== '' || i < arr.length - 1)
  const files: FileChange[] = []
  for (let i = 0; i < t.length; i++) {
    const code = t[i]
    if (!code) continue
    const k = code[0]
    if (k === 'R' || k === 'C') {
      const origPath = t[++i]
      const path = t[++i]
      if (path) files.push({ path, origPath, kind: kindOf(k) })
    } else if (/^[MADTU]$/.test(k)) {
      const path = t[++i]
      if (path) files.push({ path, kind: kindOf(k) })
    }
  }
  return files
}

export function parseDetail(header: string, nameStatus: string): CommitDetail {
  const [sha, parents, author, email, time, subject, body] = header.replace(/\x1e\s*$/, '').split('\x00')
  return {
    sha,
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    author: author ?? '',
    email: email ?? '',
    time: Number(time) || 0,
    subject: subject ?? '',
    body: (body ?? '').trim(),
    files: parseNameStatusZ(nameStatus),
  }
}

// ───────── 스태시·원격·서브모듈·추적·blame ─────────

/** git stash list --format=%gd%x00%H%x00%at%x00%gs  (줄마다 하나) */
export function parseStashes(out: string): Stash[] {
  const list: Stash[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const [ref, sha, time, subject] = line.split('\x00')
    const m = ref?.match(/\{(\d+)\}/)
    if (!m || !sha) continue
    const msg = (subject ?? '').replace(/^On [^:]+: /, '')
    list.push({ index: Number(m[1]), sha, time: Number(time) || 0, message: msg })
  }
  return list
}

/** git remote -v */
export function parseRemotes(out: string): Remote[] {
  const map = new Map<string, Remote>()
  for (const line of out.split('\n')) {
    const m = line.match(/^(\S+)\t(\S+)\s+\((fetch|push)\)$/)
    if (!m) continue
    const r = map.get(m[1]) ?? { name: m[1], fetchUrl: '', pushUrl: '' }
    if (m[3] === 'fetch') r.fetchUrl = m[2]
    else r.pushUrl = m[2]
    map.set(m[1], r)
  }
  return [...map.values()]
}

/** git submodule status: " sha path (desc)", 앞 글자 - 초기화 안 됨, + 다른 커밋, U 충돌 */
export function parseSubmodules(out: string): Submodule[] {
  const list: Submodule[] = []
  for (const line of out.split('\n')) {
    const m = line.match(/^([ +\-U])([0-9a-f]{7,64}) (.+?)(?: \(.*\))?$/)
    if (!m) continue
    const state = m[1] === '-' ? 'uninitialized' : m[1] === '+' ? 'modified' : m[1] === 'U' ? 'conflict' : 'ok'
    list.push({ path: m[3], sha: m[2], state })
  }
  return list
}

/** %(upstream:track): "[ahead 1, behind 2]", "[gone]", "" */
export function parseTrack(track: string): { ahead: number; behind: number; gone: boolean } {
  return {
    ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
    gone: track.includes('gone'),
  }
}

/** git blame --porcelain */
export function parseBlame(out: string): BlameLine[] {
  const info = new Map<string, { author: string; time: number; summary: string }>()
  const lines: BlameLine[] = []
  let cur: { sha: string; line: number } | null = null
  let pending: { author: string; time: number; summary: string } = { author: '', time: 0, summary: '' }
  for (const l of out.split('\n')) {
    const h = l.match(/^([0-9a-f]{40,64}) \d+ (\d+)(?: \d+)?$/)
    if (h) {
      cur = { sha: h[1], line: Number(h[2]) }
      pending = { ...(info.get(h[1]) ?? { author: '', time: 0, summary: '' }) }
      continue
    }
    if (!cur) continue
    if (l.startsWith('\t')) {
      if (!info.has(cur.sha)) info.set(cur.sha, pending)
      const meta = info.get(cur.sha)!
      lines.push({ line: cur.line, sha: cur.sha, author: meta.author, time: meta.time, summary: meta.summary, text: l.slice(1) })
      cur = null
    } else if (l.startsWith('author ')) pending.author = l.slice(7)
    else if (l.startsWith('author-time ')) pending.time = Number(l.slice(12))
    else if (l.startsWith('summary ')) pending.summary = l.slice(8)
  }
  return lines
}

// ───────── diff ─────────

export type DiffLineType = 'add' | 'del' | 'ctx' | 'note'

export interface DiffLine {
  type: DiffLineType
  oldNo: number | null
  newNo: number | null
  text: string
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface ParsedDiff {
  binary: boolean
  hunks: DiffHunk[]
  added: number
  removed: number
}

/** git diff (unified) 하나의 파일 */
export function parseDiff(raw: string): ParsedDiff {
  const out: ParsedDiff = { binary: false, hunks: [], added: 0, removed: 0 }
  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      out.binary = true
      continue
    }
    const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
    if (m) {
      hunk = { header: line, lines: [] }
      out.hunks.push(hunk)
      oldNo = Number(m[1])
      newNo = Number(m[2])
      continue
    }
    if (!hunk) continue // diff --git, index, ---, +++ 머리줄
    if (line.startsWith('+')) {
      hunk.lines.push({ type: 'add', oldNo: null, newNo: newNo++, text: line.slice(1) })
      out.added++
    } else if (line.startsWith('-')) {
      hunk.lines.push({ type: 'del', oldNo: oldNo++, newNo: null, text: line.slice(1) })
      out.removed++
    } else if (line.startsWith(' ')) {
      hunk.lines.push({ type: 'ctx', oldNo: oldNo++, newNo: newNo++, text: line.slice(1) })
    } else if (line.startsWith('\\')) {
      hunk.lines.push({ type: 'note', oldNo: null, newNo: null, text: line.slice(2) })
    }
  }
  return out
}
