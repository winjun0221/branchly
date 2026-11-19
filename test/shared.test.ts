// 순수 함수: 줄 단위 패치, 대화형 리베이스 할 일 목록, 호스팅 주소, 새 파서들
import { describe, expect, it } from 'vitest'
import { buildPatch, hunkKeys, lineKey } from '../src/shared/patch'
import { buildTodo } from '../src/shared/rebase'
import { branchUrl, commitUrl, pullRequestUrl, webRepo } from '../src/shared/hosting'
import { parseBlame, parseDiff, parseRemotes, parseStashes, parseSubmodules, parseTrack } from '../src/shared/parse'
import type { RebaseStep } from '../src/shared/types'

const DIFF = [
  'diff --git a/a.txt b/a.txt',
  'index 1111111..2222222 100644',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,3 +1,3 @@',
  ' 하나',
  '-둘',
  '+2',
  ' 셋',
  '@@ -10,2 +10,3 @@ 함수',
  ' 열',
  '+열하나-a',
  '+열하나-b',
  ' 열둘',
  '',
].join('\n')

describe('buildPatch', () => {
  it('keeps the whole hunk when every line is selected', () => {
    const p = buildPatch(DIFF, new Set(hunkKeys(4, 0)), false)!
    expect(p).toContain('@@ -1,3 +1,3 @@\n 하나\n-둘\n+2\n 셋\n')
    expect(p).not.toContain('열하나')
    expect(p.startsWith('diff --git a/a.txt b/a.txt\n')).toBe(true)
  })

  it('forward: drops unselected additions and turns unselected removals into context', () => {
    // 첫 덩어리에서 '+2'만, 둘째 덩어리에서 '+열하나-a'만
    const p = buildPatch(DIFF, new Set([lineKey(0, 2), lineKey(1, 1)]), false)!
    expect(p).toContain('@@ -1,3 +1,4 @@\n 하나\n 둘\n+2\n 셋\n')
    expect(p).toContain('@@ -10,2 +10,3 @@ 함수\n 열\n+열하나-a\n 열둘\n')
    expect(p).not.toContain('열하나-b')
  })

  it('reverse: turns unselected additions into context and drops unselected removals', () => {
    const p = buildPatch(DIFF, new Set([lineKey(1, 2)]), true)!
    expect(p).not.toContain('@@ -1,')
    expect(p).toContain('@@ -10,3 +10,4 @@ 함수\n 열\n 열하나-a\n+열하나-b\n 열둘\n')
  })

  it('returns null when nothing changes', () => {
    expect(buildPatch(DIFF, new Set([lineKey(0, 0)]), false)).toBeNull()
    expect(buildPatch(DIFF, new Set(), true)).toBeNull()
  })

  it('uses the same line numbering as parseDiff', () => {
    const d = parseDiff(DIFF)
    expect(d.hunks[0].lines[2]).toMatchObject({ type: 'add', text: '2' })
    expect(d.hunks[1].lines[1]).toMatchObject({ type: 'add', text: '열하나-a' })
  })

  it('keeps "no newline" notes only after a kept line', () => {
    const raw = 'diff --git a/b b/b\n--- a/b\n+++ b/b\n@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n'
    // '-old'만 고름: 지우는 줄과 그 뒤 표시는 남고, 빠진 '+new' 뒤 표시는 같이 빠진다
    const forward = buildPatch(raw, new Set([lineKey(0, 0)]), false)!
    expect(forward).toBe('diff --git a/b b/b\n--- a/b\n+++ b/b\n@@ -1,1 +1,0 @@\n-old\n\\ No newline at end of file\n')
  })
})

describe('buildTodo', () => {
  const step = (action: RebaseStep['action'], sha: string, message = sha + ' 메시지'): RebaseStep => ({ action, sha, subject: message, message })
  const file = (n: number) => `C:/tmp/msg-${n}.txt`

  it('writes picks, drops and fixups as-is', () => {
    const t = buildTodo([step('pick', 'aaaaaaa'), step('drop', 'bbbbbbb'), step('fixup', 'ccccccc')], file)
    expect(t.todo).toBe('pick aaaaaaa\ndrop bbbbbbb\nfixup ccccccc\n')
    expect(t.messages).toEqual([])
  })

  it('rewords with an amend exec and combines messages for squash', () => {
    const t = buildTodo([step('reword', 'aaaaaaa', '새 제목'), step('squash', 'bbbbbbb', '둘째')], file)
    expect(t.todo).toBe(
      "pick aaaaaaa\nexec git commit --amend --only --allow-empty --no-verify -F 'C:/tmp/msg-0.txt'\n"
      + "fixup bbbbbbb\nexec git commit --amend --only --allow-empty --no-verify -F 'C:/tmp/msg-1.txt'\n",
    )
    expect(t.messages.map((m) => m.text)).toEqual(['새 제목\n', '새 제목\n\n둘째\n'])
  })

  it('rejects invalid plans', () => {
    expect(() => buildTodo([], file)).toThrow()
    expect(() => buildTodo([step('squash', 'aaaaaaa')], file)).toThrow()
    expect(() => buildTodo([step('drop', 'aaaaaaa')], file)).toThrow()
    expect(() => buildTodo([step('pick', 'HEAD~1')], file)).toThrow()
    expect(() => buildTodo([step('reword', 'aaaaaaa', 'x')], () => "C:/it's/m.txt")).toThrow()
  })
})

describe('hosting', () => {
  it('turns remote addresses into web addresses', () => {
    expect(webRepo('git@github.com:me/app.git')).toEqual({ base: 'https://github.com/me/app', kind: 'github' })
    expect(webRepo('https://user:token@gitlab.com/group/sub/app.git')).toEqual({ base: 'https://gitlab.com/group/sub/app', kind: 'gitlab' })
    expect(webRepo('ssh://git@bitbucket.org/team/app.git')).toEqual({ base: 'https://bitbucket.org/team/app', kind: 'bitbucket' })
    expect(webRepo('https://git.example.com:8443/a/b')).toEqual({ base: 'https://git.example.com:8443/a/b', kind: 'other' })
    expect(webRepo('C:\\repos\\local')).toBeNull()
  })

  it('builds commit, branch and pull request pages', () => {
    const gh = webRepo('git@github.com:me/app.git')!
    expect(commitUrl(gh, 'abc')).toBe('https://github.com/me/app/commit/abc')
    expect(branchUrl(gh, 'feature/로그인')).toBe('https://github.com/me/app/tree/feature/%EB%A1%9C%EA%B7%B8%EC%9D%B8')
    expect(pullRequestUrl(gh, 'feature/x', 'main')).toBe('https://github.com/me/app/compare/main...feature/x?expand=1')
    const gl = webRepo('https://gitlab.com/g/app.git')!
    expect(pullRequestUrl(gl, 'f', 'main')).toBe('https://gitlab.com/g/app/-/merge_requests/new?merge_request%5Bsource_branch%5D=f&merge_request%5Btarget_branch%5D=main')
    expect(pullRequestUrl(webRepo('https://git.example.com/a/b')!, 'f', 'main')).toBeNull()
  })
})

describe('parsers', () => {
  it('reads stash list', () => {
    const out = 'stash@{0}\x00' + 'a'.repeat(40) + '\x001700000000\x00On main: 작업 중\n'
      + 'stash@{1}\x00' + 'b'.repeat(40) + '\x001600000000\x00WIP on feature: 1234567 제목\n'
    expect(parseStashes(out)).toEqual([
      { index: 0, sha: 'a'.repeat(40), time: 1700000000, message: '작업 중' },
      { index: 1, sha: 'b'.repeat(40), time: 1600000000, message: 'WIP on feature: 1234567 제목' },
    ])
  })

  it('reads remotes with separate push urls', () => {
    const out = 'origin\thttps://a/x.git (fetch)\norigin\tgit@a:x.git (push)\nup\thttps://b/y.git (fetch)\nup\thttps://b/y.git (push)\n'
    expect(parseRemotes(out)).toEqual([
      { name: 'origin', fetchUrl: 'https://a/x.git', pushUrl: 'git@a:x.git' },
      { name: 'up', fetchUrl: 'https://b/y.git', pushUrl: 'https://b/y.git' },
    ])
  })

  it('reads submodule states', () => {
    const s = '1'.repeat(40)
    expect(parseSubmodules(` ${s} libs/a (v1.0)\n-${s} libs/b\n+${s} libs/c (heads/main)\n`)).toEqual([
      { path: 'libs/a', sha: s, state: 'ok' },
      { path: 'libs/b', sha: s, state: 'uninitialized' },
      { path: 'libs/c', sha: s, state: 'modified' },
    ])
  })

  it('reads ahead/behind tracking', () => {
    expect(parseTrack('[ahead 2, behind 3]')).toEqual({ ahead: 2, behind: 3, gone: false })
    expect(parseTrack('[gone]')).toEqual({ ahead: 0, behind: 0, gone: true })
    expect(parseTrack('')).toEqual({ ahead: 0, behind: 0, gone: false })
  })

  it('reads porcelain blame, reusing commit info for repeated commits', () => {
    const a = 'a'.repeat(40)
    const out = [
      `${a} 1 1 2`, 'author 김개발', 'author-time 1700000000', 'summary 첫 커밋', 'filename x.txt', '\t첫 줄',
      `${a} 2 2`, '\t둘째 줄', '',
    ].join('\n')
    expect(parseBlame(out)).toEqual([
      { line: 1, sha: a, author: '김개발', time: 1700000000, summary: '첫 커밋', text: '첫 줄' },
      { line: 2, sha: a, author: '김개발', time: 1700000000, summary: '첫 커밋', text: '둘째 줄' },
    ])
  })
})
