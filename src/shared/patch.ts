// 덩어리·줄 단위 스테이징/내리기/버리기용 패치 만들기. 테스트: test/patch.test.ts
//
// 화면의 diff(parseDiff)에서 고른 줄만 남긴 패치를 만들어 `git apply --recount`에 넘긴다.
// - 정방향(reverse=false, 스테이징: 인덱스에 적용): 안 고른 '+'는 빼고, 안 고른 '-'는 그대로 두는 줄(' ')로.
// - 역방향(reverse=true, 내리기·버리기: `apply -R`): 안 고른 '+'는 그대로 두는 줄(' ')로, 안 고른 '-'는 뺀다.
// 이렇게 하면 적용 대상 쪽 내용이 원래 diff와 같아서 덩어리 시작 줄 번호를 그대로 쓸 수 있다(줄 수는 --recount가 다시 셈).

/** 화면에서 고른 줄: `${덩어리 번호}:${덩어리 안 줄 번호}` (parseDiff의 hunks[h].lines[i]와 같은 번호) */
export const lineKey = (hunk: number, line: number) => `${hunk}:${line}`

export function buildPatch(raw: string, selected: Set<string>, reverse: boolean): string | null {
  const lines = raw.split('\n')
  const header: string[] = []
  let i = 0
  while (i < lines.length && !lines[i].startsWith('@@')) {
    if (lines[i] !== '') header.push(lines[i])
    i++
  }
  if (header.length === 0) return null

  const out: string[] = [...header]
  let hunkNo = -1
  let any = false
  while (i < lines.length) {
    const h = lines[i].match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
    if (!h) {
      i++
      continue
    }
    hunkNo++
    const body: string[] = []
    let changed = false
    let lineNo = 0
    let lastKept = true
    i++
    while (i < lines.length && !lines[i].startsWith('@@')) {
      const l = lines[i]
      const c = l[0]
      if (c === '+' || c === '-' || c === ' ' || c === '\\') {
        const sel = selected.has(lineKey(hunkNo, lineNo))
        lineNo++
        if (c === '\\') {
          if (lastKept) body.push(l) // "\ No newline…"는 바로 앞 줄을 따라감
        } else if (c === ' ') {
          body.push(l)
          lastKept = true
        } else if (sel) {
          body.push(l)
          changed = true
          lastKept = true
        } else if ((c === '+' && reverse) || (c === '-' && !reverse)) {
          body.push(' ' + l.slice(1)) // 안 고른 줄은 그대로 두는 줄로
          lastKept = true
        } else {
          lastKept = false // 안 고른 줄은 뺀다
        }
      }
      i++
    }
    if (!changed) continue
    any = true
    const oldCount = body.filter((l) => l[0] === ' ' || l[0] === '-').length
    const newCount = body.filter((l) => l[0] === ' ' || l[0] === '+').length
    out.push(`@@ -${h[1]},${oldCount} +${h[2]},${newCount} @@${h[3]}`, ...body)
  }
  return any ? out.join('\n') + '\n' : null
}

/** 덩어리 전체를 고른 것과 같은 키 목록 */
export function hunkKeys(lineCount: number, hunk: number): string[] {
  return Array.from({ length: lineCount }, (_, i) => lineKey(hunk, i))
}
