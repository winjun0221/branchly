// 충돌 블록 나누기·블록마다 고르기
import { describe, expect, it } from 'vitest'
import { countConflicts, parseConflicts, resolveBlock } from '../src/shared/conflict'

const FILE = [
  '# 회의록',
  '<<<<<<< HEAD',
  '- 메인 쪽',
  '=======',
  '- 다른 쪽',
  '>>>>>>> feature/x',
  '중간 줄',
  '<<<<<<< HEAD',
  'a',
  '||||||| base',
  'o',
  '=======',
  'b',
  'c',
  '>>>>>>> feature/x',
  '끝',
].join('\n')

describe('conflict blocks', () => {
  it('splits text and conflict blocks, including diff3 base', () => {
    const segs = parseConflicts(FILE)
    expect(segs.map((s) => s.type)).toEqual(['text', 'conflict', 'text', 'conflict', 'text'])
    const [, first, , second] = segs
    expect(first.type === 'conflict' && first.block).toMatchObject({ index: 0, ours: ['- 메인 쪽'], theirs: ['- 다른 쪽'], base: null, oursLabel: 'HEAD', theirsLabel: 'feature/x' })
    expect(second.type === 'conflict' && second.block).toMatchObject({ index: 1, ours: ['a'], base: ['o'], theirs: ['b', 'c'] })
    expect(countConflicts(FILE)).toBe(2)
  })

  it('resolves one block at a time with each choice', () => {
    const once = resolveBlock(FILE, 0, 'theirs')
    expect(once.split('\n').slice(0, 3)).toEqual(['# 회의록', '- 다른 쪽', '중간 줄'])
    expect(countConflicts(once)).toBe(1)
    // 남은 블록은 번호가 0으로 당겨진다
    const both = resolveBlock(once, 0, 'ours-theirs')
    expect(both).toBe(['# 회의록', '- 다른 쪽', '중간 줄', 'a', 'b', 'c', '끝'].join('\n'))
    expect(resolveBlock(once, 0, 'theirs-ours').split('\n').slice(3, 6)).toEqual(['b', 'c', 'a'])
    expect(resolveBlock(once, 0, 'ours').split('\n')).toContain('a')
  })

  it('keeps CRLF line endings and ignores unclosed markers', () => {
    const crlf = FILE.replace(/\n/g, '\r\n')
    expect(resolveBlock(crlf, 0, 'ours')).toContain('\r\n')
    expect(resolveBlock(crlf, 0, 'ours')).not.toMatch(/[^\r]\n/)
    expect(countConflicts('<<<<<<< HEAD\nx\n=======\ny\n')).toBe(0)
    expect(() => resolveBlock('그냥 파일', 0, 'ours')).toThrow()
  })
})
