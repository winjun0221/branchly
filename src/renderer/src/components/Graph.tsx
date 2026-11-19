import type { GraphRow, Y } from '../../../shared/graph'

export const ROW_H = 30
export const LANE_W = 14
const PAD = 10
const R = 4.5

/** 줄 색 (GRAPH_COLORS = 8) */
export const LANE_COLORS = ['#5b8cff', '#f5a524', '#22c55e', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']

const yOf = (y: Y) => (y === 'top' ? 0 : y === 'mid' ? ROW_H / 2 : ROW_H)
const xOf = (lane: number) => PAD + lane * LANE_W

/** 커밋 한 행의 그래프 조각 (위 절반·아래 절반 선 + 점) */
export function GraphCell({ row, width, isHead, merge }: { row: GraphRow; width: number; isHead: boolean; merge: boolean }) {
  const w = PAD * 2 + Math.max(0, width - 1) * LANE_W
  return (
    <svg className="graph" width={w} height={ROW_H} viewBox={`0 0 ${w} ${ROW_H}`} aria-hidden="true">
      {row.lines.map((l, i) => {
        const x1 = xOf(l.x1)
        const x2 = xOf(l.x2)
        const y1 = yOf(l.y1)
        const y2 = yOf(l.y2)
        const color = LANE_COLORS[l.color % LANE_COLORS.length]
        if (x1 === x2) return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} />
        const my = (y1 + y2) / 2
        return <path key={i} d={`M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={2} />
      })}
      <circle
        cx={xOf(row.col)}
        cy={ROW_H / 2}
        r={merge ? R - 1 : R}
        fill={isHead ? 'var(--surface)' : LANE_COLORS[row.color % LANE_COLORS.length]}
        stroke={LANE_COLORS[row.color % LANE_COLORS.length]}
        strokeWidth={isHead ? 3 : 1.5}
      />
    </svg>
  )
}
