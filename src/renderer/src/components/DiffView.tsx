import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Columns2, FileDiff, Minus, Plus, Rows2, Space, Undo2 } from 'lucide-react'
import { parseDiff, type DiffLine } from '../../../shared/parse'
import { buildPatch, hunkKeys, lineKey } from '../../../shared/patch'
import type { DiffKind, PatchMode } from '../../../shared/types'
import { splitPath } from '../format'
import { t, tx } from '../i18n'
import { useUi } from '../ui'
import { useWs } from '../ws'

const MAX_LINES = 5000

/** 변경 사항 화면에서만: 덩어리·줄 단위로 올리기/내리기/버리기 */
export interface StageControl {
  kind: DiffKind
  apply: (patch: string, mode: PatchMode) => Promise<unknown>
}

/** 한 파일의 변경 내용: 한 줄 보기(줄 번호) 또는 나란히 보기, 이미지 비교, 충돌 표시 */
export default function DiffView({ path, raw, loading, error, stage, images, conflict, actions }: {
  path: string | null
  raw: string | undefined
  loading: boolean
  error: unknown
  stage?: StageControl
  images?: { before: string | null; after: string | null } | null
  /** 충돌 파일 내용 (표시가 들어간 작업 폴더 파일) */
  conflict?: string | null
  /** 머리줄 오른쪽에 붙일 버튼 */
  actions?: ReactNode
}) {
  const ws = useWs()
  const ui = useUi()
  const diff = useMemo(() => (raw === undefined ? null : parseDiff(raw)), [raw])
  const [sideBySide, setSideBySide] = useState<boolean | null>(null)
  const sbs = sideBySide ?? ws.settings.sideBySide
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)

  useEffect(() => {
    setSel(new Set())
    setAnchor(null)
  }, [raw, path])

  if (!path) {
    return (
      <div className="diff empty-state">
        <FileDiff />
        <p>{t('파일을 고르면 바뀐 내용이 여기에 보여요')}</p>
      </div>
    )
  }

  const [dir, name] = splitPath(path)
  const canDiscard = stage && stage.kind === 'unstaged'

  const apply = async (keys: Set<string>, mode: PatchMode) => {
    if (!raw || !stage) return
    const patch = buildPatch(raw, keys, mode !== 'stage')
    if (!patch) return
    if (mode === 'discard' && !(await ui.confirm({ title: t('변경 버리기'), message: t('고른 변경을 작업 폴더에서 되돌릴까요? 되살릴 수 없어요.'), confirm: t('버리기'), danger: true }))) return
    await stage.apply(patch, mode)
  }

  const toggleLine = (key: string, shift: boolean) => {
    setSel((s) => {
      const n = new Set(s)
      if (shift && anchor && diff) {
        // 같은 덩어리 안에서 범위 선택
        const [h1, l1] = anchor.split(':').map(Number)
        const [h2, l2] = key.split(':').map(Number)
        if (h1 === h2) {
          for (let i = Math.min(l1, l2); i <= Math.max(l1, l2); i++) {
            const t = diff.hunks[h1].lines[i].type
            if (t === 'add' || t === 'del') n.add(lineKey(h1, i))
          }
          return n
        }
      }
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
    setAnchor(key)
  }

  const hunkButtons = (hi: number, count: number) => {
    if (!stage) return null
    const keys = new Set(hunkKeys(count, hi))
    return (
      <span className="hunk-actions">
        {stage.kind === 'staged'
          ? <button className="hunk-btn" onClick={() => apply(keys, 'unstage')}><Minus />{t('덩어리 내리기')}</button>
          : <button className="hunk-btn" onClick={() => apply(keys, 'stage')}><Plus />{t('덩어리 올리기')}</button>}
        {canDiscard && <button className="hunk-btn danger" onClick={() => apply(keys, 'discard')}><Undo2 />{t('버리기')}</button>}
      </span>
    )
  }

  let shown = 0
  const body = (() => {
    if (conflict != null) return <ConflictText text={conflict} />
    if (images && (images.before || images.after)) {
      return (
        <div className="image-diff">
          <figure><figcaption>{t('이전')}</figcaption>{images.before ? <img src={images.before} alt={t('이전')} /> : <div className="no-image">{t('없음 (새 파일)')}</div>}</figure>
          <figure><figcaption>{t('이후')}</figcaption>{images.after ? <img src={images.after} alt={t('이후')} /> : <div className="no-image">{t('없음 (지운 파일)')}</div>}</figure>
        </div>
      )
    }
    if (!diff) return null
    if (diff.binary) return <p className="diff-note">{t('바이너리 파일이라 내용을 비교할 수 없어요')}</p>
    if (diff.hunks.length === 0) return loading ? null : <p className="diff-note">{t('바뀐 내용이 없어요 (파일 모드나 줄바꿈만 바뀌었을 수 있어요)')}</p>

    if (sbs) {
      return (
        <table className="diff-table sbs">
          <tbody>
            {diff.hunks.map((h, hi) => {
              if (shown > MAX_LINES) return null
              const pairs = pairLines(h.lines)
              shown += pairs.length
              return (
                <Fragment key={hi}>
                  <tr className="hunk"><td colSpan={4}><span className="hunk-text">{h.header}</span>{hunkButtons(hi, h.lines.length)}</td></tr>
                  {pairs.map(([l, r], k) => (
                    <tr key={k} className="line">
                      <td className={`ln ${l?.type ?? 'none'}`}>{l?.oldNo ?? ''}</td>
                      <td className={`code half ${l ? l.type : 'none'}`}>{l ? l.text || ' ' : ''}</td>
                      <td className={`ln ${r?.type ?? 'none'}`}>{r?.newNo ?? ''}</td>
                      <td className={`code half ${r ? r.type : 'none'}`}>{r ? r.text || ' ' : ''}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )
    }

    return (
      <table className={`diff-table ${stage ? 'selectable' : ''}`}>
        <tbody>
          {diff.hunks.map((h, hi) => {
            if (shown > MAX_LINES) return null
            return (
              <Fragment key={hi}>
                <tr className="hunk"><td colSpan={3}><span className="hunk-text">{h.header}</span>{hunkButtons(hi, h.lines.length)}</td></tr>
                {h.lines.map((l, li) => {
                  shown++
                  if (shown > MAX_LINES) return null
                  const key = lineKey(hi, li)
                  const pickable = !!stage && (l.type === 'add' || l.type === 'del')
                  const on = sel.has(key)
                  return (
                    <tr key={li} className={`line ${l.type} ${on ? 'picked' : ''}`}>
                      <td className={`ln ${pickable ? 'pick' : ''}`} onMouseDown={pickable ? (e) => { e.preventDefault(); toggleLine(key, e.shiftKey) } : undefined}
                        title={pickable ? t('눌러서 이 줄 고르기 (Shift: 범위)') : undefined}>{l.oldNo ?? ''}</td>
                      <td className={`ln ${pickable ? 'pick' : ''}`} onMouseDown={pickable ? (e) => { e.preventDefault(); toggleLine(key, e.shiftKey) } : undefined}>{l.newNo ?? ''}</td>
                      <td className="code"><span className="sign">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>{l.text || ' '}</td>
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    )
  })()

  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-title"><b>{name}</b>{dir && <span className="muted"> {dir}</span>}</span>
        {diff && !diff.binary && conflict == null && (
          <span className="diff-stat">
            <span className="plus">+{diff.added}</span>
            <span className="minus">−{diff.removed}</span>
          </span>
        )}
        {actions}
        {conflict == null && (
          <span className="diff-tools">
            <button className={`icon-btn small ${ws.diffOpts.ignoreWhitespace ? 'on' : ''}`} title={t('공백 변경 무시')} aria-pressed={ws.diffOpts.ignoreWhitespace}
              onClick={() => ws.setIgnoreWhitespace(!ws.diffOpts.ignoreWhitespace)}><Space /></button>
            <button className="icon-btn small" title={sbs ? t('한 줄로 보기') : t('나란히 보기')} onClick={() => setSideBySide(!sbs)}>{sbs ? <Rows2 /> : <Columns2 />}</button>
          </span>
        )}
      </div>
      {stage && sel.size > 0 && (
        <div className="line-bar">
          <span>{tx('고른 줄 {n}개', { n: <b>{sel.size}</b> })}</span>
          {stage.kind === 'staged'
            ? <button className="btn small" onClick={() => apply(sel, 'unstage')}><Minus />{t('내리기')}</button>
            : <button className="btn small primary" onClick={() => apply(sel, 'stage')}><Plus />{t('올리기|stage')}</button>}
          {canDiscard && <button className="btn small danger-outline" onClick={() => apply(sel, 'discard')}><Undo2 />{t('버리기')}</button>}
          <button className="link" onClick={() => setSel(new Set())}>{t('선택 해제')}</button>
        </div>
      )}
      <div className="diff-body" style={{ fontSize: ws.settings.diffFontSize }}>
        {loading && <p className="diff-note">{t('불러오는 중…')}</p>}
        {error ? <p className="diff-note error">{(error as Error).message}</p> : null}
        {body}
        {shown > MAX_LINES && <p className="diff-note">{t('변경이 너무 커서 앞부분 {n}줄만 보여줘요', { n: MAX_LINES.toLocaleString() })}</p>}
      </div>
    </div>
  )
}

/** 나란히 보기: 지운 줄 묶음과 더한 줄 묶음을 한 줄씩 짝지음 */
function pairLines(lines: DiffLine[]): [DiffLine | null, DiffLine | null][] {
  const out: [DiffLine | null, DiffLine | null][] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) out.push([dels[i] ?? null, adds[i] ?? null])
    dels = []
    adds = []
  }
  for (const l of lines) {
    if (l.type === 'del') {
      if (adds.length) flush()
      dels.push(l)
    } else if (l.type === 'add') adds.push(l)
    else if (l.type === 'ctx') {
      flush()
      out.push([l, l])
    }
  }
  flush()
  return out
}

/** 충돌 표시(<<<<<<< ======= >>>>>>>)가 들어간 파일: 내 쪽/상대 쪽 색 구분 */
function ConflictText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/)
  let zone: 'none' | 'ours' | 'base' | 'theirs' = 'none'
  return (
    <table className="diff-table conflict">
      <tbody>
        {lines.map((l, i) => {
          let cls: string = zone
          if (l.startsWith('<<<<<<<')) { cls = 'marker'; zone = 'ours' }
          else if (l.startsWith('|||||||') && zone === 'ours') { cls = 'marker'; zone = 'base' }
          else if (l.startsWith('=======') && zone !== 'none') { cls = 'marker'; zone = 'theirs' }
          else if (l.startsWith('>>>>>>>') && zone === 'theirs') { cls = 'marker'; zone = 'none' }
          return (
            <tr key={i} className={`line c-${cls}`}>
              <td className="ln">{i + 1}</td>
              <td className="code">
                {l || ' '}
                {cls === 'marker' && l.startsWith('<<<<<<<') && <span className="c-tag">{t('내 쪽 (현재 브랜치)')}</span>}
                {cls === 'marker' && l.startsWith('>>>>>>>') && <span className="c-tag">{t('상대 쪽 (합치는 쪽)')}</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
