import { describe, expect, it } from 'vitest'
import { fixRefKinds, parseDiff, parseLog, parseNameStatusZ, parseRefs, parseStatus } from '../src/shared/parse'

describe('parseLog', () => {
  it('reads NUL/RS separated records', () => {
    const out = 'aaa\x00bbb ccc\x00김개발\x00kim@example.com\x001700000000\x00HEAD -> main, tag: v1\x00병합: feature\x1e\n'
      + 'bbb\x00\x00이기획\x00lee@example.com\x001690000000\x00\x00첫 커밋\x1e'
    const [a, b] = parseLog(out)
    expect(a.parents).toEqual(['bbb', 'ccc'])
    expect(a.author).toBe('김개발')
    expect(a.refs).toEqual([{ kind: 'head', name: 'main' }, { kind: 'tag', name: 'v1' }])
    expect(a.subject).toBe('병합: feature')
    expect(b.parents).toEqual([])
    expect(b.refs).toEqual([])
  })
})

describe('parseRefs', () => {
  it('classifies refs and skips origin/HEAD', () => {
    expect(parseRefs('HEAD -> feature/x, origin/main, origin/HEAD, tag: v2.0, dev')).toEqual([
      { kind: 'head', name: 'feature/x' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'tag', name: 'v2.0' },
      { kind: 'branch', name: 'dev' },
    ])
  })
  it('fixes local branches that contain a slash', () => {
    const refs = parseRefs('feature/login, origin/main')
    expect(fixRefKinds(refs, ['origin'])).toEqual([
      { kind: 'branch', name: 'feature/login' },
      { kind: 'remote', name: 'origin/main' },
    ])
  })
})

describe('parseStatus', () => {
  it('reads branch headers, staged/unstaged, renames, untracked and conflicts', () => {
    const out = [
      '# branch.oid 1234567890abcdef',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 M. N... 100644 100644 100644 aaa bbb src/app.ts',
      '1 .M N... 100644 100644 100644 aaa bbb 문서/회의 록.md',
      '1 MM N... 100644 100644 100644 aaa bbb both.txt',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new name.txt',
      'old name.txt',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt',
      '? 새 파일.txt',
      '',
    ].join('\x00')
    const s = parseStatus(out)
    expect(s.branch).toBe('main')
    expect(s.upstream).toBe('origin/main')
    expect([s.ahead, s.behind]).toEqual([2, 1])
    expect(s.staged).toEqual([
      { path: 'both.txt', kind: 'M' },
      { path: 'new name.txt', origPath: 'old name.txt', kind: 'R' },
      { path: 'src/app.ts', kind: 'M' },
    ])
    expect(s.unstaged).toEqual([
      { path: 'both.txt', kind: 'M' },
      { path: '문서/회의 록.md', kind: 'M' },
      { path: '새 파일.txt', kind: '?' },
    ])
    expect(s.conflicted).toEqual([{ path: 'conflict.txt', kind: 'U' }])
  })

  it('knows a brand-new repository and detached HEAD', () => {
    expect(parseStatus('# branch.oid (initial)\x00# branch.head main\x00').unborn).toBe(true)
    const d = parseStatus('# branch.oid abc\x00# branch.head (detached)\x00')
    expect(d.detached).toBe(true)
    expect(d.branch).toBeNull()
  })
})

describe('parseNameStatusZ', () => {
  it('reads modified, added and renamed files', () => {
    const out = 'M\x00a.txt\x00A\x00폴더/b.txt\x00R087\x00old.txt\x00new.txt\x00'
    expect(parseNameStatusZ(out)).toEqual([
      { path: 'a.txt', kind: 'M' },
      { path: '폴더/b.txt', kind: 'A' },
      { path: 'new.txt', origPath: 'old.txt', kind: 'R' },
    ])
  })
})

describe('parseDiff', () => {
  it('numbers lines and counts changes', () => {
    const raw = [
      'diff --git a/a.txt b/a.txt',
      'index 1..2 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@ 함수',
      ' 하나',
      '-둘',
      '+둘!',
      ' 셋',
      '\\ No newline at end of file',
    ].join('\n')
    const d = parseDiff(raw)
    expect(d.added).toBe(1)
    expect(d.removed).toBe(1)
    expect(d.hunks[0].lines.map((l) => [l.type, l.oldNo, l.newNo])).toEqual([
      ['ctx', 1, 1], ['del', 2, null], ['add', null, 2], ['ctx', 3, 3], ['note', null, null],
    ])
  })
  it('detects binary files', () => {
    expect(parseDiff('diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ').binary).toBe(true)
  })
})
