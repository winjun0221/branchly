// 실제 git으로 저장소 작업 전체 확인: 브랜치·병합 충돌·리베이스·체리픽·되돌리기·리셋·스태시·태그·
// 줄 단위 스테이징·대화형 리베이스·Git 흐름·원격·검색·blame·패치·설정
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as repo from '../src/main/repo'
import { buildPatch, hunkKeys, lineKey } from '../src/shared/patch'
import { parseDiff } from '../src/shared/parse'
import type { CommitOptions } from '../src/shared/types'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'branchly-ops-'))
const NO: CommitOptions = { amend: false, signoff: false, noVerify: false, push: false }

// 이 PC의 전역 git 설정(사용자 정보·서명·pull 방식 등)을 쓰지도 바꾸지도 않게 테스트 전용 전역 설정
beforeAll(() => {
  const global = path.join(root, 'global.gitconfig')
  fs.writeFileSync(global, '[user]\n\tname = 테스트\n\temail = test@example.com\n[core]\n\tautocrlf = false\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n')
  process.env.GIT_CONFIG_GLOBAL = global
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

let n = 0
function makeRepo() {
  const dir = path.join(root, `r${n++}`)
  fs.mkdirSync(dir)
  const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8')
  const commit = (msg: string, file = 'a.txt', text = msg + '\n') => {
    write(file, text)
    run('add', '-A')
    run('commit', '-q', '-m', msg)
    return run('rev-parse', 'HEAD')
  }
  run('init', '-q', '-b', 'main')
  commit('첫 커밋')
  return { dir, run, write, read, commit }
}

const subjects = async (dir: string, scope: 'all' | 'current' = 'current') => (await repo.log(dir, { limit: 50, scope })).map((c) => c.subject)

describe('branches', () => {
  it('creates, renames, checks out and deletes branches', async () => {
    const r = makeRepo()
    await repo.createBranch(r.dir, 'feature/로그인', null, true)
    expect((await repo.status(r.dir)).branch).toBe('feature/로그인')
    r.commit('로그인')
    await repo.renameBranch(r.dir, 'feature/로그인', 'feature/login')
    await repo.checkout(r.dir, 'main')
    await repo.createBranch(r.dir, 'later', 'feature/login', false)
    expect((await repo.status(r.dir)).branch).toBe('main')
    expect((await repo.branches(r.dir)).local.map((b) => b.name)).toEqual(['feature/login', 'later', 'main'])
    await expect(repo.deleteBranch(r.dir, 'feature/login', false, false)).rejects.toThrow() // 병합 안 됨
    await repo.deleteBranch(r.dir, 'feature/login', true, false)
    await expect(repo.createBranch(r.dir, 'bad name', null, false)).rejects.toThrow('쓸 수 없는 브랜치 이름')
    await repo.checkoutDetached(r.dir, r.run('rev-parse', 'HEAD'))
    expect((await repo.status(r.dir)).detached).toBe(true)
  })
})

describe('merge, rebase, cherry-pick, revert', () => {
  it('stops on a merge conflict, resolves with theirs and continues', async () => {
    const r = makeRepo()
    r.run('checkout', '-q', '-b', 'topic')
    r.commit('토픽 쪽')
    r.run('checkout', '-q', 'main')
    r.commit('메인 쪽')
    const res = await repo.merge(r.dir, 'topic', { noFF: false, squash: false, message: '' })
    expect(res.conflicts).toBe(true)
    let s = await repo.status(r.dir)
    expect(s.operation?.kind).toBe('merge')
    expect(s.conflicted.map((f) => f.path)).toEqual(['a.txt'])
    await expect(repo.continueOperation(r.dir)).rejects.toThrow('충돌')
    await repo.resolveConflict(r.dir, 'a.txt', 'theirs')
    expect((await repo.continueOperation(r.dir)).conflicts).toBe(false)
    s = await repo.status(r.dir)
    expect(s.operation).toBeNull()
    expect(r.read('a.txt')).toBe('토픽 쪽\n')
    const [head] = await repo.log(r.dir, { limit: 1, scope: 'current' })
    expect(head.parents).toHaveLength(2)
  })

  it('merges with --no-ff and a message, or squashes', async () => {
    const r = makeRepo()
    r.run('checkout', '-q', '-b', 'topic')
    r.commit('토픽', 'b.txt')
    r.run('checkout', '-q', 'main')
    await repo.merge(r.dir, 'topic', { noFF: true, squash: false, message: '병합 메시지' })
    expect((await subjects(r.dir))[0]).toBe('병합 메시지')
    r.run('reset', '-q', '--hard', 'HEAD~1')
    await repo.merge(r.dir, 'topic', { noFF: false, squash: true, message: '' })
    expect((await repo.status(r.dir)).staged.map((f) => f.path)).toEqual(['b.txt'])
  })

  it('aborts a conflicting rebase and skips a conflicting cherry-pick', async () => {
    const r = makeRepo()
    r.run('checkout', '-q', '-b', 'topic')
    const topic = r.commit('토픽 쪽')
    r.run('checkout', '-q', 'main')
    r.commit('메인 쪽')
    r.run('checkout', '-q', 'topic')
    expect((await repo.rebase(r.dir, 'main')).conflicts).toBe(true)
    const op = (await repo.status(r.dir)).operation
    expect(op).toMatchObject({ kind: 'rebase', step: 1, total: 1 })
    await repo.abortOperation(r.dir)
    expect((await repo.status(r.dir)).operation).toBeNull()

    r.run('checkout', '-q', 'main')
    expect((await repo.cherryPick(r.dir, [topic])).conflicts).toBe(true)
    expect((await repo.status(r.dir)).operation?.kind).toBe('cherry-pick')
    await repo.skipOperation(r.dir)
    expect((await repo.status(r.dir)).operation).toBeNull()
  })

  it('rebases cleanly, cherry-picks and reverts', async () => {
    const r = makeRepo()
    r.run('checkout', '-q', '-b', 'topic')
    const t = r.commit('토픽', 'topic.txt')
    r.run('checkout', '-q', 'main')
    r.commit('메인', 'main.txt')
    r.run('checkout', '-q', 'topic')
    expect((await repo.rebase(r.dir, 'main')).conflicts).toBe(false)
    expect(await subjects(r.dir)).toEqual(['토픽', '메인', '첫 커밋'])
    r.run('checkout', '-q', 'main')
    await repo.cherryPick(r.dir, [t])
    expect(fs.existsSync(path.join(r.dir, 'topic.txt'))).toBe(true)
    await repo.revert(r.dir, r.run('rev-parse', 'HEAD'))
    expect(fs.existsSync(path.join(r.dir, 'topic.txt'))).toBe(false)
    expect((await subjects(r.dir))[0]).toBe('Revert "토픽"')
  })

  it('reverts a merge commit against its first parent', async () => {
    const r = makeRepo()
    r.run('checkout', '-q', '-b', 'topic')
    r.commit('토픽', 'topic.txt')
    r.run('checkout', '-q', 'main')
    r.run('merge', '-q', '--no-ff', '-m', '병합', 'topic')
    await repo.revert(r.dir, r.run('rev-parse', 'HEAD'))
    expect(fs.existsSync(path.join(r.dir, 'topic.txt'))).toBe(false)
  })

  it('resets soft, mixed and hard', async () => {
    const r = makeRepo()
    const first = r.run('rev-parse', 'HEAD')
    r.commit('둘째', 'b.txt')
    await repo.reset(r.dir, first, 'soft')
    expect((await repo.status(r.dir)).staged.map((f) => f.path)).toEqual(['b.txt'])
    await repo.reset(r.dir, first, 'mixed')
    expect((await repo.status(r.dir)).unstaged).toEqual([{ path: 'b.txt', kind: '?' }])
    r.write('a.txt', '바뀜\n')
    await repo.reset(r.dir, first, 'hard')
    expect(r.read('a.txt')).toBe('첫 커밋\n')
  })
})

describe('stash and tags', () => {
  it('saves, applies, pops, drops and branches stashes', async () => {
    const r = makeRepo()
    r.write('a.txt', '작업 중\n')
    r.write('새파일.txt', '새\n')
    await repo.stashSave(r.dir, '반쯤 함', false, true)
    expect((await repo.status(r.dir)).unstaged).toEqual([])
    let list = await repo.stashes(r.dir)
    expect(list.map((s) => [s.index, s.message])).toEqual([[0, '반쯤 함']])
    await repo.stashApply(r.dir, 0, false)
    expect(r.read('새파일.txt')).toBe('새\n')
    expect(await repo.stashes(r.dir)).toHaveLength(1)
    r.run('checkout', '-q', '--', '.')
    r.run('clean', '-fdq')
    await repo.stashApply(r.dir, 0, true)
    expect(await repo.stashes(r.dir)).toHaveLength(0)
    await repo.stashSave(r.dir, '', false, true)
    await repo.stashBranch(r.dir, 0, 'from-stash')
    expect((await repo.status(r.dir)).branch).toBe('from-stash')
    expect(r.read('a.txt')).toBe('작업 중\n')
    await repo.stashSave(r.dir, '버릴 것', false, true)
    await repo.stashDrop(r.dir, 0)
    list = await repo.stashes(r.dir)
    expect(list).toEqual([])
  })

  it('keeps the index when asked', async () => {
    const r = makeRepo()
    r.write('a.txt', '스테이지\n')
    r.run('add', 'a.txt')
    await repo.stashSave(r.dir, '', true, false)
    expect((await repo.status(r.dir)).staged.map((f) => f.path)).toEqual(['a.txt'])
  })

  it('creates annotated and lightweight tags and deletes them', async () => {
    const r = makeRepo()
    const sha = r.run('rev-parse', 'HEAD')
    await repo.createTag(r.dir, 'v1.0', sha, '첫 배포', null)
    await repo.createTag(r.dir, 'light', sha, '', null)
    expect((await repo.branches(r.dir)).tags).toEqual([
      { name: 'light', sha, annotated: false },
      { name: 'v1.0', sha: r.run('rev-parse', 'v1.0'), annotated: true },
    ])
    await repo.deleteTag(r.dir, 'light', null)
    expect((await repo.branches(r.dir)).tags.map((t) => t.name)).toEqual(['v1.0'])
    await expect(repo.createTag(r.dir, 'bad tag', sha, '', null)).rejects.toThrow()
  })
})

describe('hunks and lines', () => {
  const base = Array.from({ length: 30 }, (_, i) => `줄 ${i + 1}`)
  const text = (lines: string[]) => lines.join('\n') + '\n'

  it('stages one hunk, then one line, unstages and discards by line', async () => {
    const r = makeRepo()
    r.commit('본문', 'a.txt', text(base))
    const changed = [...base]
    changed[1] = '둘째 줄 바뀜'
    changed.splice(25, 0, '추가 A', '추가 B')
    r.write('a.txt', text(changed))

    const raw = await repo.diffWorking(r.dir, 'a.txt', 'unstaged')
    const d = parseDiff(raw)
    expect(d.hunks).toHaveLength(2)
    // 첫 덩어리 전체 스테이지
    await repo.applyPatch(r.dir, buildPatch(raw, new Set(hunkKeys(d.hunks[0].lines.length, 0)), false)!, 'stage')
    let staged = await repo.diffWorking(r.dir, 'a.txt', 'staged')
    expect(staged).toContain('+둘째 줄 바뀜')
    expect(staged).not.toContain('추가 A')

    // 둘째 덩어리에서 '추가 A' 줄만 스테이지
    const raw2 = await repo.diffWorking(r.dir, 'a.txt', 'unstaged')
    const d2 = parseDiff(raw2)
    const idxA = d2.hunks[0].lines.findIndex((l) => l.text === '추가 A')
    await repo.applyPatch(r.dir, buildPatch(raw2, new Set([lineKey(0, idxA)]), false)!, 'stage')
    staged = await repo.diffWorking(r.dir, 'a.txt', 'staged')
    expect(staged).toContain('+추가 A')
    expect(staged).not.toContain('추가 B')

    // 스테이지된 것에서 첫 덩어리만 내리기
    const d3 = parseDiff(staged)
    const k = d3.hunks.findIndex((h) => h.lines.some((l) => l.text === '둘째 줄 바뀜'))
    await repo.applyPatch(r.dir, buildPatch(staged, new Set(hunkKeys(d3.hunks[k].lines.length, k)), true)!, 'unstage')
    staged = await repo.diffWorking(r.dir, 'a.txt', 'staged')
    expect(staged).not.toContain('둘째 줄 바뀜')
    expect(staged).toContain('+추가 A')

    // 작업 폴더에서 '추가 B'만 버리기
    const raw4 = await repo.diffWorking(r.dir, 'a.txt', 'unstaged')
    const d4 = parseDiff(raw4)
    const h = d4.hunks.findIndex((x) => x.lines.some((l) => l.text === '추가 B'))
    const idxB = d4.hunks[h].lines.findIndex((l) => l.text === '추가 B')
    await repo.applyPatch(r.dir, buildPatch(raw4, new Set([lineKey(h, idxB)]), true)!, 'discard')
    expect(r.read('a.txt')).not.toContain('추가 B')
    expect(r.read('a.txt')).toContain('둘째 줄 바뀜')
    expect(r.read('a.txt')).toContain('추가 A')
  })

  it('discards whole files including staged changes, ignores and untracks', async () => {
    const r = makeRepo()
    r.write('a.txt', '바꿈\n')
    r.run('add', 'a.txt')
    await repo.discard(r.dir, ['a.txt'], false) // 스테이지된 건 남음
    expect((await repo.status(r.dir)).staged.map((f) => f.path)).toEqual(['a.txt'])
    await repo.discard(r.dir, ['a.txt'], true)
    expect((await repo.status(r.dir)).staged).toEqual([])
    expect(r.read('a.txt')).toBe('첫 커밋\n')

    r.write('build/out.js', 'x')
    repo.ignore(r.dir, 'build/')
    repo.ignore(r.dir, 'build/') // 같은 줄은 한 번만
    expect(repo.readGitignore(r.dir)).toBe('build/\n')
    expect((await repo.status(r.dir)).unstaged.map((f) => f.path)).toEqual(['.gitignore'])
    repo.writeGitignore(r.dir, 'build/\n*.log')
    expect(repo.readGitignore(r.dir)).toBe('build/\n*.log\n')

    await repo.untrack(r.dir, ['a.txt'])
    const s = await repo.status(r.dir)
    expect(s.staged).toEqual([{ path: 'a.txt', kind: 'D' }])
    expect(s.unstaged.map((f) => f.path)).toContain('a.txt')
  })

  it('amends and signs off', async () => {
    const r = makeRepo()
    r.write('b.txt', 'b\n')
    await repo.stage(r.dir, ['b.txt'])
    await repo.commit(r.dir, '두 번째', { ...NO, signoff: true })
    expect(await repo.lastCommitMessage(r.dir)).toBe('두 번째\n\nSigned-off-by: 테스트 <test@example.com>')
    await repo.commit(r.dir, '두 번째 (고침)', { ...NO, amend: true })
    expect(await subjects(r.dir)).toEqual(['두 번째 (고침)', '첫 커밋'])
    expect(await repo.recentMessages(r.dir)).toEqual(['두 번째 (고침)', '첫 커밋'])
  })
})

describe('interactive rebase', () => {
  it('rewords, squashes, drops and fixes up without an editor', async () => {
    const r = makeRepo()
    const base = r.run('rev-parse', 'HEAD')
    r.commit('하나', '1.txt')
    r.commit('둘', '2.txt')
    r.commit('셋', '3.txt')
    r.commit('넷', '4.txt')
    r.commit('다섯', '5.txt')
    const steps = await repo.rebaseSteps(r.dir, base)
    expect(steps.map((s) => s.subject)).toEqual(['하나', '둘', '셋', '넷', '다섯'])
    steps[0] = { ...steps[0], action: 'reword', message: '하나 (새 이름)\n\n본문' }
    steps[1] = { ...steps[1], action: 'squash' }
    steps[2] = { ...steps[2], action: 'drop' }
    steps[3] = { ...steps[3], action: 'pick' }
    steps[4] = { ...steps[4], action: 'fixup' }
    const res = await repo.interactiveRebase(r.dir, base, steps)
    expect(res.conflicts).toBe(false)
    expect(await subjects(r.dir)).toEqual(['넷', '하나 (새 이름)', '첫 커밋'])
    const log = r.run('log', '--format=%B', '-1', 'HEAD~1')
    expect(log).toBe('하나 (새 이름)\n\n본문\n\n둘')
    expect(fs.existsSync(path.join(r.dir, '3.txt'))).toBe(false)
    expect(fs.existsSync(path.join(r.dir, '5.txt'))).toBe(true)
    expect((await repo.status(r.dir)).operation).toBeNull()
  })

  it('refuses ranges with merge commits', async () => {
    const r = makeRepo()
    const base = r.run('rev-parse', 'HEAD')
    r.run('checkout', '-q', '-b', 't')
    r.commit('t', 't.txt')
    r.run('checkout', '-q', 'main')
    r.run('merge', '-q', '--no-ff', '-m', 'm', 't')
    await expect(repo.rebaseSteps(r.dir, base)).rejects.toThrow('병합 커밋')
  })
})

describe('git flow', () => {
  it('starts and finishes features and releases', async () => {
    const r = makeRepo()
    let c = await repo.flowConfig(r.dir)
    expect(c).toMatchObject({ initialized: false, master: 'main', develop: 'develop' })
    await repo.flowInit(r.dir, { ...c, versionTag: 'v' })
    c = await repo.flowConfig(r.dir)
    expect(c.initialized).toBe(true)
    expect((await repo.branches(r.dir)).local.map((b) => b.name)).toEqual(['develop', 'main'])

    await repo.flowStart(r.dir, 'feature', '검색')
    expect((await repo.status(r.dir)).branch).toBe('feature/검색')
    r.commit('검색 기능', 'search.txt')
    expect((await repo.flowFinish(r.dir, 'feature', '검색', '', false)).conflicts).toBe(false)
    expect((await repo.status(r.dir)).branch).toBe('develop')
    expect((await repo.branches(r.dir)).local.map((b) => b.name)).toEqual(['develop', 'main'])

    await repo.flowStart(r.dir, 'release', '1.0')
    r.commit('버전 1.0', 'version.txt')
    await repo.flowFinish(r.dir, 'release', '1.0', '첫 배포', false)
    const b = await repo.branches(r.dir)
    expect(b.tags.map((t) => t.name)).toEqual(['v1.0'])
    expect(b.local.map((x) => x.name)).toEqual(['develop', 'main'])
    r.run('checkout', '-q', 'main')
    expect(fs.existsSync(path.join(r.dir, 'search.txt'))).toBe(true)
    expect(fs.existsSync(path.join(r.dir, 'version.txt'))).toBe(true)
  })
})

describe('remotes', () => {
  it('pushes, clones, fetches, pulls and manages remotes', async () => {
    const r = makeRepo()
    const bare = path.join(root, `origin${n++}.git`)
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
    await repo.remoteAdd(r.dir, 'origin', bare)
    expect(await repo.remotes(r.dir)).toEqual([{ name: 'origin', fetchUrl: bare, pushUrl: bare }])
    await repo.push(r.dir, { remote: 'origin', branches: ['main'], tags: false, force: false, setUpstream: true })
    expect((await repo.status(r.dir)).upstream).toBe('origin/main')

    const other = await repo.clone(bare, root, `clone${n++}`, null, false)
    fs.writeFileSync(path.join(other.path, 'c.txt'), '복제본에서\n')
    await repo.stage(other.path, ['c.txt'])
    await repo.commit(other.path, '복제본 커밋', { ...NO, push: true })

    await repo.fetch(r.dir, { remote: null, prune: true, tags: true })
    const s = await repo.status(r.dir)
    expect(s.behind).toBe(1)
    expect((await repo.branches(r.dir)).local[0]).toMatchObject({ name: 'main', behind: 1, ahead: 0, upstream: 'origin/main' })
    expect((await repo.pull(r.dir, { remote: null, branch: null, rebase: false })).conflicts).toBe(false)
    expect(r.read('c.txt')).toBe('복제본에서\n')

    // 브랜치 올리기 → 원격 브랜치 지우기
    await repo.createBranch(r.dir, 'topic', null, true)
    await repo.pushCurrent(r.dir)
    expect((await repo.branches(r.dir)).remote.map((x) => x.name)).toContain('origin/topic')
    await repo.checkout(r.dir, 'main')
    await repo.deleteBranch(r.dir, 'topic', false, true)
    await repo.fetch(r.dir, { remote: 'origin', prune: true, tags: false })
    expect((await repo.branches(r.dir)).remote.map((x) => x.name)).toEqual(['origin/main'])

    // 원격 브랜치에서 로컬 브랜치 만들기
    execFileSync('git', ['push', '-q', 'origin', 'main:shared'], { cwd: other.path })
    await repo.fetch(r.dir, { remote: null, prune: false, tags: false })
    await repo.checkoutRemote(r.dir, 'origin/shared', 'shared')
    expect((await repo.status(r.dir)).upstream).toBe('origin/shared')
    await repo.setUpstream(r.dir, 'shared', null)
    expect((await repo.status(r.dir)).upstream).toBeNull()

    // 태그 올리기·지우기
    await repo.createTag(r.dir, 'v2', r.run('rev-parse', 'HEAD'), '', 'origin')
    expect(execFileSync('git', ['ls-remote', '--tags', bare], { encoding: 'utf8' })).toContain('refs/tags/v2')
    await repo.deleteTag(r.dir, 'v2', 'origin')
    expect(execFileSync('git', ['ls-remote', '--tags', bare], { encoding: 'utf8' })).not.toContain('refs/tags/v2')

    await repo.remoteRename(r.dir, 'origin', 'upstream')
    await repo.remoteSetUrl(r.dir, 'upstream', 'https://example.com/x.git')
    expect(await repo.remotes(r.dir)).toEqual([{ name: 'upstream', fetchUrl: 'https://example.com/x.git', pushUrl: 'https://example.com/x.git' }])
    await repo.remoteRemove(r.dir, 'upstream')
    expect(await repo.remotes(r.dir)).toEqual([])
  })

  it('makes a new repository', async () => {
    const dir = path.join(root, 'new', '프로젝트')
    const info = await repo.init(dir)
    expect(info.name).toBe('프로젝트')
    expect((await repo.status(dir)).unborn).toBe(true)
  })
})

describe('history tools', () => {
  it('searches by message, author, file, content and id, and limits scope', async () => {
    const r = makeRepo()
    r.commit('로그인 화면 추가', 'src/Login.tsx', 'const token = 1\n')
    r.run('checkout', '-q', '-b', 'side')
    r.commit('곁가지', 'side.txt')
    r.run('checkout', '-q', 'main')
    const q = (mode: 'message' | 'author' | 'file' | 'content' | 'sha', text: string, scope: 'all' | 'current' = 'all') =>
      repo.log(r.dir, { limit: 50, scope, search: { mode, text } }).then((cs) => cs.map((c) => c.subject))
    expect(await q('message', '로그인')).toEqual(['로그인 화면 추가'])
    expect(await q('author', '테스트')).toHaveLength(3)
    expect(await q('author', '없는사람')).toEqual([])
    expect(await q('file', 'login')).toEqual(['로그인 화면 추가'])
    expect(await q('content', 'token')).toEqual(['로그인 화면 추가'])
    const sha = r.run('rev-parse', 'HEAD')
    expect(await q('sha', sha.slice(0, 8))).toEqual(['로그인 화면 추가'])
    expect(await q('sha', 'zzzz')).toEqual([])
    expect(await subjects(r.dir, 'all')).toContain('곁가지')
    expect(await subjects(r.dir, 'current')).not.toContain('곁가지')
  })

  it('blames, follows file history, compares two commits and exports', async () => {
    const r = makeRepo()
    const first = r.run('rev-parse', 'HEAD')
    r.commit('둘째 줄', 'a.txt', '첫 커밋\n둘째 줄\n')
    r.run('mv', 'a.txt', 'b.txt')
    r.run('commit', '-q', '-m', '이름 바꿈')
    const blame = await repo.blame(r.dir, 'b.txt', null)
    expect(blame.map((l) => [l.line, l.summary, l.text])).toEqual([[1, '첫 커밋', '첫 커밋'], [2, '둘째 줄', '둘째 줄']])
    expect((await repo.fileLog(r.dir, 'b.txt', 50)).map((c) => c.subject)).toEqual(['이름 바꿈', '둘째 줄', '첫 커밋'])
    expect(await repo.diffRange(r.dir, first, 'HEAD')).toEqual([{ path: 'b.txt', origPath: 'a.txt', kind: 'R' }])
    expect(await repo.diffRangeFile(r.dir, first, 'HEAD', 'b.txt')).toContain('+둘째 줄')
    expect((await repo.fileAtRevision(r.dir, first, 'a.txt')).toString('utf8')).toBe('첫 커밋\n')

    const zip = path.join(root, `out${n++}.zip`)
    await repo.archive(r.dir, first, zip)
    expect(fs.readFileSync(zip).subarray(0, 2).toString()).toBe('PK')

    // 패치 만들기 → 다른 저장소에 커밋으로 적용
    const patch = await repo.formatPatch(r.dir, [r.run('rev-parse', 'HEAD~1')])
    expect(patch).toMatch(/^From [0-9a-f]{40} /)
    const other = makeRepo()
    const file = path.join(root, `p${n++}.patch`)
    fs.writeFileSync(file, patch)
    expect((await repo.applyPatchFile(other.dir, file)).conflicts).toBe(false)
    expect(await subjects(other.dir)).toEqual(['둘째 줄', '첫 커밋'])
  })

  it('reads working files and image previews', async () => {
    const r = makeRepo()
    expect(repo.readWorkingFile(r.dir, 'a.txt')).toEqual({ text: '첫 커밋\n', binary: false, tooLarge: false, size: 11 })
    fs.writeFileSync(path.join(r.dir, 'b.bin'), Buffer.from([1, 0, 2]))
    expect(repo.readWorkingFile(r.dir, 'b.bin').binary).toBe(true)
    const png = Buffer.from('89504e470d0a1a0a', 'hex')
    fs.writeFileSync(path.join(r.dir, 'i.png'), png)
    expect(await repo.imagePreview(r.dir, null, 'i.png')).toBe('data:image/png;base64,' + png.toString('base64'))
    expect(await repo.imagePreview(r.dir, null, 'a.txt')).toBeNull()
  })
})

describe('settings', () => {
  it('reads and writes repository and global identity', async () => {
    const r = makeRepo()
    expect(await repo.identity(r.dir)).toEqual({ name: '', email: '' })
    await repo.setIdentity(r.dir, { name: '저장소 사용자', email: 'repo@example.com' })
    expect(await repo.identity(r.dir)).toEqual({ name: '저장소 사용자', email: 'repo@example.com' })
    await repo.setIdentity(r.dir, { name: '', email: '' })
    expect(await repo.identity(r.dir)).toEqual({ name: '', email: '' })
    // 전역은 테스트 전용 설정 파일(GIT_CONFIG_GLOBAL)
    expect(await repo.identity(null)).toEqual({ name: '테스트', email: 'test@example.com' })
  })

  it('reports submodules and LFS when available', async () => {
    const r = makeRepo()
    expect(await repo.submodules(r.dir)).toEqual([])
    const lib = makeRepo()
    execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib.dir, 'libs/lib'], { cwd: r.dir })
    const subs = await repo.submodules(r.dir)
    expect(subs).toEqual([{ path: 'libs/lib', sha: lib.run('rev-parse', 'HEAD'), state: 'ok' }])
    const lfs = await repo.lfsInfo(r.dir)
    expect(typeof lfs.installed).toBe('boolean')
  })
})
