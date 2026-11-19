// 커밋 그래프 배치: 위상 순서(--topo-order)로 받은 커밋마다 몇 번째 줄(lane)에 점을 찍고 어디로 선을 이을지 계산.
// 각 행은 위 절반(top→mid)과 아래 절반(mid→bottom)의 선 조각으로 그린다. 테스트: test/graph.test.ts

export type Y = 'top' | 'mid' | 'bottom'

export interface GraphLine {
  x1: number
  y1: Y
  x2: number
  y2: Y
  color: number
}

export interface GraphRow {
  /** 이 커밋 점의 줄 번호 */
  col: number
  color: number
  lines: GraphLine[]
  /** 이 행에서 쓰는 줄 수 (그림 폭) */
  width: number
}

export const GRAPH_COLORS = 8

function firstFree(lanes: (string | null)[]): number {
  const i = lanes.indexOf(null)
  return i === -1 ? lanes.length : i
}

export function layoutGraph(commits: { sha: string; parents: string[] }[]): GraphRow[] {
  let lanes: (string | null)[] = [] // 줄 번호 → 다음에 올 커밋
  const colors: number[] = [] // 줄 번호 → 색
  let nextColor = 0
  const rows: GraphRow[] = []

  for (const c of commits) {
    const top = lanes.slice()
    const topColors = colors.slice()
    let col = lanes.indexOf(c.sha)
    if (col === -1) {
      // 아무도 기다리지 않던 커밋 = 새 브랜치 끝
      col = firstFree(lanes)
      lanes[col] = c.sha
      colors[col] = nextColor++ % GRAPH_COLORS
    }
    const nodeColor = colors[col]
    const lines: GraphLine[] = []

    // 위 절반: 이 커밋을 기다리던 줄은 점으로 모이고, 나머지는 그대로 지나감
    top.forEach((sha, i) => {
      if (sha === null) return
      lines.push(sha === c.sha
        ? { x1: i, y1: 'top', x2: col, y2: 'mid', color: topColors[i] }
        : { x1: i, y1: 'top', x2: i, y2: 'mid', color: topColors[i] })
    })
    // 점으로 모인 다른 줄은 비운다
    lanes = lanes.map((s, i) => (s === c.sha && i !== col ? null : s))

    if (c.parents.length === 0) {
      lanes[col] = null // 첫 커밋: 줄 끝
    } else {
      const [p0, ...others] = c.parents
      const existing = lanes.indexOf(p0)
      if (existing !== -1 && existing < col) {
        // 첫 부모를 왼쪽 줄이 이미 기다림 → 그쪽으로 합류하고 이 줄은 끝
        lanes[col] = null
        lines.push({ x1: col, y1: 'mid', x2: existing, y2: 'bottom', color: colors[existing] })
      } else if (existing !== -1 && existing > col) {
        // 오른쪽 줄이 기다리던 부모 → 줄기(첫 부모)는 왼쪽인 이 줄에 남기고, 오른쪽 줄이 휘어 들어온다
        lanes[col] = p0
        lanes[existing] = null
        lines.push({ x1: col, y1: 'mid', x2: col, y2: 'bottom', color: nodeColor })
        lines.push({ x1: existing, y1: 'mid', x2: col, y2: 'bottom', color: colors[existing] })
      } else {
        lanes[col] = p0
        lines.push({ x1: col, y1: 'mid', x2: col, y2: 'bottom', color: nodeColor })
      }
      // 병합 커밋의 다른 부모들
      for (const p of others) {
        let j = lanes.indexOf(p)
        if (j === -1) {
          j = firstFree(lanes)
          lanes[j] = p
          colors[j] = nextColor++ % GRAPH_COLORS
        }
        lines.push({ x1: col, y1: 'mid', x2: j, y2: 'bottom', color: colors[j] })
      }
    }

    // 아래 절반: 위에서 지나가던 줄 중 그대로인 것은 계속 내려감
    lanes.forEach((sha, i) => {
      if (sha === null || i === col) return
      if (top[i] !== undefined && top[i] !== null && top[i] !== c.sha && top[i] === sha) {
        lines.push({ x1: i, y1: 'mid', x2: i, y2: 'bottom', color: colors[i] })
      }
    })

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    rows.push({ col, color: nodeColor, lines, width: Math.max(top.length, lanes.length, col + 1) })
  }
  return rows
}
