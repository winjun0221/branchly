// 충돌 표시(<<<<<<< ======= >>>>>>>)가 들어간 파일을 블록으로 나누고, 블록마다 고른 쪽으로 바꾸기. 테스트: test/conflict.test.ts
// diff3 형식(||||||| 공통 조상)도 읽는다. 줄바꿈(CRLF/LF)은 파일에 쓰인 대로 지킨다.
import { t } from './i18n'

export type ConflictChoice = 'ours' | 'theirs' | 'ours-theirs' | 'theirs-ours'

export interface ConflictBlock {
  /** 블록 번호 (0부터) */
  index: number
  /** 파일에서 <<<<<<< 줄과 >>>>>>> 줄의 위치 (0부터) */
  start: number
  end: number
  ours: string[]
  base: string[] | null
  theirs: string[]
  /** 표시 줄 뒤에 붙은 이름 (HEAD, 브랜치 이름 등) */
  oursLabel: string
  theirsLabel: string
}

export type ConflictSegment = { type: 'text'; lines: string[] } | { type: 'conflict'; block: ConflictBlock }

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n')

export function parseConflicts(text: string): ConflictSegment[] {
  const lines = text.split(/\r?\n/)
  const segs: ConflictSegment[] = []
  let plain: string[] = []
  let i = 0
  let n = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith('<<<<<<<')) {
      // 닫는 >>>>>>> 가 없으면 블록으로 보지 않는다
      let mid = -1
      let baseAt = -1
      let close = -1
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('|||||||') && mid < 0 && baseAt < 0) baseAt = j
        else if (lines[j].startsWith('=======') && mid < 0) mid = j
        else if (lines[j].startsWith('>>>>>>>') && mid >= 0) {
          close = j
          break
        } else if (lines[j].startsWith('<<<<<<<')) break
      }
      if (mid >= 0 && close >= 0) {
        if (plain.length) segs.push({ type: 'text', lines: plain })
        plain = []
        segs.push({
          type: 'conflict',
          block: {
            index: n++,
            start: i,
            end: close,
            ours: lines.slice(i + 1, baseAt >= 0 ? baseAt : mid),
            base: baseAt >= 0 ? lines.slice(baseAt + 1, mid) : null,
            theirs: lines.slice(mid + 1, close),
            oursLabel: l.slice(7).trim(),
            theirsLabel: lines[close].slice(7).trim(),
          },
        })
        i = close + 1
        continue
      }
    }
    plain.push(l)
    i++
  }
  if (plain.length) segs.push({ type: 'text', lines: plain })
  return segs
}

export const countConflicts = (text: string) => parseConflicts(text).filter((s) => s.type === 'conflict').length

/** index번 블록을 고른 쪽 내용으로 바꾼 파일 전체 */
export function resolveBlock(text: string, index: number, choice: ConflictChoice): string {
  const eol = eolOf(text)
  const lines = text.split(/\r?\n/)
  const block = parseConflicts(text).find((s) => s.type === 'conflict' && s.block.index === index)
  if (!block || block.type !== 'conflict') throw new Error(t('충돌 블록을 찾을 수 없습니다'))
  const b = block.block
  const picked = choice === 'ours' ? b.ours : choice === 'theirs' ? b.theirs : choice === 'ours-theirs' ? [...b.ours, ...b.theirs] : [...b.theirs, ...b.ours]
  return [...lines.slice(0, b.start), ...picked, ...lines.slice(b.end + 1)].join(eol)
}
