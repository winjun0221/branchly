// 실제 git으로 임시 저장소를 만들어 저장소 작업을 확인한다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as repo from '../src/main/repo'
import { checkFile, checkSha } from '../src/main/guard'

let dir = ''
const run = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branchly-test-'))
  run('init', '-q', '-b', 'main')
  run('config', 'user.name', '테스트')
  run('config', 'user.email', 'test@example.com')
  run('config', 'core.autocrlf', 'false')
  write('README.md', '# 제목\n')
  run('add', '.')
  run('commit', '-q', '-m', '첫 커밋')
  run('checkout', '-q', '-b', 'feature/login')
  write('src/login.ts', 'export const a = 1\n')
  run('add', '.')
  run('commit', '-q', '-m', '로그인 추가')
  run('checkout', '-q', 'main')
  write('README.md', '# 제목\n\n설명\n')
  run('commit', '-q', '-am', '설명 추가')
  run('merge', '-q', '--no-ff', '-m', '병합: 로그인', 'feature/login')
  run('tag', 'v0.1')
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('repo', () => {
  it('finds the top folder from a subfolder', async () => {
    write('src/deep/x.txt', 'x')
    const info = await repo.resolveRepo(path.join(dir, 'src'))
    expect(path.resolve(info.path)).toBe(path.resolve(fs.realpathSync(dir)))
    fs.rmSync(path.join(dir, 'src/deep'), { recursive: true })
  })

  it('logs all branches in topo order with refs', async () => {
    const commits = await repo.log(dir, { limit: 100, scope: 'all' })
    expect(commits.map((c) => c.subject)).toEqual(['병합: 로그인', '설명 추가', '로그인 추가', '첫 커밋'])
    expect(commits[0].parents).toHaveLength(2)
    expect(commits[0].refs).toEqual(expect.arrayContaining([{ kind: 'head', name: 'main' }, { kind: 'tag', name: 'v0.1' }]))
  })

  it('reports working copy changes with Korean names, stages and commits', async () => {
    write('README.md', '# 제목\n\n설명 수정\n')
    write('문서/회의록.md', '안건\n')
    let s = await repo.status(dir)
    expect(s.branch).toBe('main')
    expect(s.unstaged).toEqual([{ path: 'README.md', kind: 'M' }, { path: '문서/회의록.md', kind: '?' }])

    const untracked = await repo.diffWorking(dir, '문서/회의록.md', 'untracked')
    expect(untracked).toContain('+안건')
    const modified = await repo.diffWorking(dir, 'README.md', 'unstaged')
    expect(modified).toContain('+설명 수정')

    await repo.stage(dir, ['문서/회의록.md'])
    s = await repo.status(dir)
    expect(s.staged).toEqual([{ path: '문서/회의록.md', kind: 'A' }])
    expect(await repo.diffWorking(dir, '문서/회의록.md', 'staged')).toContain('+안건')

    await repo.unstage(dir, ['문서/회의록.md'])
    expect((await repo.status(dir)).staged).toEqual([])

    await repo.stage(dir, ['문서/회의록.md', 'README.md'])
    await repo.commit(dir, '회의록 추가\n\n본문 설명', { amend: false, signoff: false, noVerify: false, push: false })
    s = await repo.status(dir)
    expect(s.staged).toEqual([])
    expect(s.unstaged).toEqual([])

    const [head] = await repo.log(dir, { limit: 1, scope: 'all' })
    const d = await repo.commitDetail(dir, head.sha)
    expect(d.subject).toBe('회의록 추가')
    expect(d.body).toBe('본문 설명')
    expect(d.files).toEqual([{ path: 'README.md', kind: 'M' }, { path: '문서/회의록.md', kind: 'A' }])
    expect(await repo.diffCommit(dir, head.sha, '문서/회의록.md')).toContain('+안건')
  })

  it('lists branches and tags', async () => {
    const b = await repo.branches(dir)
    expect(b.local.map((x) => [x.name, x.current])).toEqual([['feature/login', false], ['main', true]])
    expect(b.tags.map((t) => t.name)).toEqual(['v0.1'])
  })

  it('handles a brand-new repository without commits', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'branchly-empty-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: empty })
      fs.writeFileSync(path.join(empty, 'a.txt'), 'a')
      expect(await repo.log(empty, { limit: 10, scope: 'all' })).toEqual([])
      const s = await repo.status(empty)
      expect(s.unborn).toBe(true)
      await repo.stage(empty, ['a.txt'])
      expect((await repo.status(empty)).staged).toEqual([{ path: 'a.txt', kind: 'A' }])
      await repo.unstage(empty, ['a.txt'])
      expect((await repo.status(empty)).staged).toEqual([])
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('guard', () => {
  it('rejects paths outside the repository and option-like names', () => {
    expect(checkFile('src/a.ts')).toBe('src/a.ts')
    expect(checkFile('문서/회의 록.md')).toBe('문서/회의 록.md')
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\Windows', '-rf', '', 'a\0b']) {
      expect(() => checkFile(bad)).toThrow()
    }
  })
  it('accepts only hex commit ids', () => {
    expect(checkSha('a1b2c3d')).toBe('a1b2c3d')
    expect(() => checkSha('HEAD~1')).toThrow()
    expect(() => checkSha('--all')).toThrow()
  })
})
