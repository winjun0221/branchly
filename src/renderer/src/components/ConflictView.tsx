// 충돌 파일을 블록마다 풀기: 블록마다 내 쪽 / 상대 쪽 / 둘 다를 고르면 파일에 바로 반영된다
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { parseConflicts, resolveBlock, type ConflictBlock, type ConflictChoice } from '../../../shared/conflict'
import { splitPath } from '../format'
import { t, tx } from '../i18n'
import { useWs } from '../ws'

export default function ConflictView({ path, text, loading, error, onSave, onMarkResolved, actions }: {
  path: string
  /** null = 바이너리거나 너무 큰 파일 */
  text: string | null | undefined
  loading: boolean
  error: unknown
  /** 고른 결과 파일 전체를 저장 */
  onSave: (text: string) => Promise<unknown>
  onMarkResolved: () => void
  actions?: ReactNode
}) {
  const ws = useWs()
  const [busy, setBusy] = useState(false)
  const segs = useMemo(() => (text ? parseConflicts(text) : []), [text])
  const blocks = segs.filter((s) => s.type === 'conflict').length
  const [dir, name] = splitPath(path)

  const pick = async (b: ConflictBlock, choice: ConflictChoice) => {
    if (!text || busy) return
    setBusy(true)
    try {
      await onSave(resolveBlock(text, b.index, choice))
    } finally {
      setBusy(false)
    }
  }

  let lineNo = 0
  const plainRows = (lines: string[], key: string) => lines.map((l, i) => {
    lineNo++
    return (
      <tr key={key + i} className="line ctx">
        <td className="ln">{lineNo}</td>
        <td className="code">{l || ' '}</td>
      </tr>
    )
  })

  return (
    <div className="diff conflict-view">
      <div className="diff-head">
        <span className="diff-title"><b>{name}</b>{dir && <span className="muted"> {dir}</span>}</span>
        {text != null && (blocks > 0
          ? <span className="cf-count"><TriangleAlert />{t('충돌 {n}곳 남음', { n: blocks })}</span>
          : <span className="cf-count done"><CircleCheck />{t('충돌 표시 없음')}</span>)}
        {actions}
      </div>
      {text != null && blocks === 0 && !loading && (
        <div className="line-bar">
          <span>{t('파일에 충돌 표시가 더 없어요. 내용을 확인한 뒤 해결됨으로 표시하세요.')}</span>
          <button className="btn small primary" onClick={onMarkResolved}><CircleCheck />{t('해결됨으로 표시')}</button>
        </div>
      )}
      <div className="diff-body" style={{ fontSize: ws.settings.diffFontSize }}>
        {loading && <p className="diff-note">{t('불러오는 중…')}</p>}
        {error ? <p className="diff-note error">{(error as Error).message}</p> : null}
        {text === null && <p className="diff-note">{t('(바이너리이거나 너무 큰 파일이에요)')}</p>}
        {text && (
          <table className="diff-table conflict">
            <tbody>
              {segs.map((s, si) => {
                if (s.type === 'text') return <Fragment key={si}>{plainRows(s.lines, `t${si}-`)}</Fragment>
                const b = s.block
                lineNo += b.end - b.start + 1
                return (
                  <tr key={si} className="cf-row">
                    <td colSpan={2}>
                      <div className="cf-block">
                        <div className="cf-head">
                          <b>{t('충돌 {n}', { n: b.index + 1 })}</b>
                          <span className="spacer" />
                          <button className="hunk-btn" disabled={busy} onClick={() => void pick(b, 'ours')}>{t('내 쪽')}</button>
                          <button className="hunk-btn" disabled={busy} onClick={() => void pick(b, 'theirs')}>{t('상대 쪽')}</button>
                          <button className="hunk-btn" disabled={busy} onClick={() => void pick(b, 'ours-theirs')}>{t('둘 다 (내 쪽 먼저)')}</button>
                          <button className="hunk-btn" disabled={busy} onClick={() => void pick(b, 'theirs-ours')}>{t('둘 다 (상대 쪽 먼저)')}</button>
                        </div>
                        <div className="cf-side cf-ours">
                          <div className="cf-label">{tx('내 쪽 · {label}', { label: <span className="mono">{b.oursLabel || 'HEAD'}</span> })}</div>
                          <pre>{b.ours.length ? b.ours.join('\n') : t('(비어 있음)')}</pre>
                        </div>
                        {b.base && (
                          <div className="cf-side cf-base">
                            <div className="cf-label">{t('공통 조상')}</div>
                            <pre>{b.base.length ? b.base.join('\n') : t('(비어 있음)')}</pre>
                          </div>
                        )}
                        <div className="cf-side cf-theirs">
                          <div className="cf-label">{tx('상대 쪽 · {label}', { label: <span className="mono">{b.theirsLabel || t('합치는 쪽')}</span> })}</div>
                          <pre>{b.theirs.length ? b.theirs.join('\n') : t('(비어 있음)')}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
