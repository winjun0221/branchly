import { describe, expect, it } from 'vitest'
import { layoutGraph } from '../src/shared/graph'

const c = (sha: string, ...parents: string[]) => ({ sha, parents })

describe('layoutGraph', () => {
  it('keeps a straight history in one lane', () => {
    const rows = layoutGraph([c('c3', 'c2'), c('c2', 'c1'), c('c1')])
    expect(rows.map((r) => r.col)).toEqual([0, 0, 0])
    expect(rows.every((r) => r.width === 1)).toBe(true)
    // 첫 커밋은 아래로 선이 없음
    expect(rows[2].lines.some((l) => l.y1 === 'mid')).toBe(false)
  })

  it('opens a second lane for a merge and closes it at the fork point', () => {
    //   m  (merge of a2, b1)
    //   |\
    //   a2 b1
    //   |/
    //   a1
    const rows = layoutGraph([c('m', 'a2', 'b1'), c('a2', 'a1'), c('b1', 'a1'), c('a1')])
    expect(rows[0].col).toBe(0)
    expect(rows[0].lines).toContainEqual(expect.objectContaining({ x1: 0, y1: 'mid', x2: 1, y2: 'bottom' }))
    expect(rows[1].col).toBe(0)
    expect(rows[2].col).toBe(1)
    // b1의 부모 a1은 이미 0번 줄이 기다림 → 1번 줄은 0번으로 합류
    expect(rows[2].lines).toContainEqual(expect.objectContaining({ x1: 1, y1: 'mid', x2: 0, y2: 'bottom' }))
    expect(rows[3].col).toBe(0)
    expect(rows[3].width).toBe(1)
  })

  it('gives separate branch tips their own lane', () => {
    // 두 브랜치 끝(f, main)이 같은 조상 a를 공유
    const rows = layoutGraph([c('f', 'a'), c('main', 'a'), c('a')])
    expect(rows[0].col).toBe(0)
    expect(rows[1].col).toBe(1)
    expect(rows[0].color).not.toBe(rows[1].color)
    // main의 부모 a는 이미 0번 줄이 기다리므로 바로 아래에서 0번 줄로 합류 (git --graph와 같음)
    expect(rows[1].lines).toContainEqual(expect.objectContaining({ x1: 1, y1: 'mid', x2: 0, y2: 'bottom' }))
    expect(rows[2].width).toBe(1)
  })

  it('keeps the first-parent line on the left when a right lane waits for the same parent', () => {
    // m = merge(x, h). h(오른쪽 줄)가 먼저 base를 기다리지만, x의 줄기(왼쪽)가 base를 이어받는다
    const rows = layoutGraph([c('m', 'x', 'h'), c('h', 'base'), c('x', 'base'), c('base')])
    expect(rows[1].col).toBe(1)
    expect(rows[2].col).toBe(0)
    expect(rows[2].lines).toContainEqual(expect.objectContaining({ x1: 1, y1: 'mid', x2: 0, y2: 'bottom' }))
    expect(rows[2].lines).toContainEqual(expect.objectContaining({ x1: 0, y1: 'mid', x2: 0, y2: 'bottom' }))
    expect(rows[3].col).toBe(0)
    expect(rows[3].color).toBe(rows[0].color) // 줄기 색 유지
  })

  it('passes unrelated lanes straight through', () => {
    const rows = layoutGraph([c('x2', 'x1'), c('y2', 'y1'), c('x1'), c('y1')])
    // y2 행에서 0번 줄(x1을 기다림)은 위아래로 그대로 지나감
    expect(rows[1].lines).toContainEqual(expect.objectContaining({ x1: 0, y1: 'top', x2: 0, y2: 'mid' }))
    expect(rows[1].lines).toContainEqual(expect.objectContaining({ x1: 0, y1: 'mid', x2: 0, y2: 'bottom' }))
  })
})
