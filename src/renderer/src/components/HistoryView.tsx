import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { Cloud, FilePen, GitBranch, GitCompareArrows, Search, Tag, X } from 'lucide-react'
import { layoutGraph } from '../../../shared/graph'
import type { Commit, LogScope, Ref, SearchMode } from '../../../shared/types'
import { useLog } from '../api'
import { useActions } from '../actions'
import { fullDate, relativeTime } from '../format'
import { t, tk, tx } from '../i18n'
import { useUi } from '../ui'
import { short, useWs } from '../ws'
import { GraphCell, LANE_W, ROW_H } from './Graph'
import CommitDetail from './CommitDetail'
import { clamp, Splitter, usePaneSize } from './Splitter'

const PAGE = 1000
const MAX_GRAPH_LANES = 14

const SEARCH_MODES: { value: SearchMode; label: string; placeholder: string }[] = [
  { value: 'message', label: tk('메시지'), placeholder: tk('커밋 메시지에 들어간 글자') },
  { value: 'author', label: tk('작성자'), placeholder: tk('이름 또는 이메일') },
  { value: 'file', label: tk('파일'), placeholder: tk('파일 이름 일부 (예: login)') },
  { value: 'content', label: tk('코드'), placeholder: tk('추가·삭제된 코드 (예: getUser)') },
  { value: 'sha', label: tk('커밋 번호'), placeholder: 'a1b2c3d' },
]

/** 히스토리: 위 = 검색·커밋 목록(그래프), 아래 = 고른 커밋(또는 두 커밋 비교)의 파일·변경 내용 */
export default function HistoryView({ focus, onFocusTaken }: { focus: { sha: string; n: number } | null; onFocusTaken: () => void }) {
  const ws = useWs()
  const ui = useUi()
  const a = useActions()
  const [limit, setLimit] = useState(PAGE)
  const [scope, setScope] = useState<LogScope>('all')
  const [mode, setMode] = useState<SearchMode>('message')
  const [text, setText] = useState('')
  const [search, setSearch] = useState<{ mode: SearchMode; text: string } | null>(null)
  const query = useMemo(() => ({ limit, scope, ...(search ? { search } : {}) }), [limit, scope, search])
  const log = useLog(ws.repo, query)
  const commits = useMemo(() => log.data ?? [], [log.data])
  const rows = useMemo(() => (search ? null : layoutGraph(commits)), [commits, search])
  const graphWidth = rows ? Math.min(MAX_GRAPH_LANES, rows.reduce((m, r) => Math.max(m, r.width), 1)) : 0

  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [compare, setCompare] = useState<{ from: string; to: string } | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const [detailPct, setDetailPct, resetDetailPct] = usePaneSize('historyDetail', 44)
  const historyRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(600)
  const pendingFocus = useRef<string | null>(null)

  const index = useMemo(() => new Map(commits.map((c, i) => [c.sha, i])), [commits])

  // 처음 열면 맨 위 커밋 선택
  useEffect(() => {
    if (selected.length === 0 && commits.length > 0 && !pendingFocus.current) setSelected([commits[0].sha])
  }, [commits, selected.length])

  // 다른 곳(사이드바·blame 등)에서 커밋을 보여 달라고 하면
  useEffect(() => {
    if (!focus) return
    pendingFocus.current = focus.sha
    onFocusTaken() // 한 번만 (화면을 바꿨다 돌아와도 다시 이동하지 않게)
    if (search) setSearch(null)
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const want = pendingFocus.current
    if (!want || commits.length === 0 || log.isFetching) return
    const i = commits.findIndex((c) => c.sha === want || c.sha.startsWith(want))
    if (i >= 0) {
      pendingFocus.current = null
      setSelected([commits[i].sha])
      setCompare(null)
      requestAnimationFrame(() => scrollToRow(i, true))
    } else if (commits.length >= limit) {
      setLimit((l) => l + PAGE) // 더 불러와서 다시 찾기
    } else if (scope !== 'all') {
      setScope('all')
    } else {
      pendingFocus.current = null
      ui.notify(t('목록에서 그 커밋을 찾지 못했어요'), 'warn')
    }
  }, [commits, limit, focus, log.isFetching, scope, log.dataUpdatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = list.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scrollToRow = (i: number, center = false) => {
    const el = list.current
    if (!el) return
    const top = i * ROW_H
    if (center) el.scrollTop = Math.max(0, top - el.clientHeight / 2)
    else if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top - el.clientHeight + ROW_H * 2
  }

  // 두 개를 고르면 자동으로 비교 (오래된 것 → 최신)
  const autoCompare = selected.length === 2
    ? (() => {
        const [x, y] = [...selected].sort((p, q) => (index.get(q) ?? 0) - (index.get(p) ?? 0))
        return { from: x, to: y }
      })()
    : null
  const shownCompare = compare ?? autoCompare

  const click = (e: MouseEvent, c: Commit) => {
    if (e.button === 2) {
      if (!selected.includes(c.sha)) {
        setSelected([c.sha])
        setAnchor(c.sha)
      }
      return
    }
    setCompare(null)
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => (s.includes(c.sha) ? s.filter((x) => x !== c.sha) : [...s, c.sha]))
      setAnchor(c.sha)
    } else if (e.shiftKey && anchor && index.has(anchor)) {
      const [i, j] = [index.get(anchor)!, index.get(c.sha)!].sort((p, q) => p - q)
      setSelected(commits.slice(i, j + 1).map((x) => x.sha))
    } else {
      setSelected([c.sha])
      setAnchor(c.sha)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = index.get(selected[selected.length - 1] ?? '') ?? -1
    const next = Math.max(0, Math.min(commits.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    if (commits[next]) {
      setSelected([commits[next].sha])
      setAnchor(commits[next].sha)
      setCompare(null)
      scrollToRow(next)
    }
  }

  const applySearch = () => {
    setLimit(PAGE)
    setSearch(text.trim() ? { mode, text: text.trim() } : null)
  }

  // 보이는 행만 그린다 (커밋이 수만 개여도 가볍게)
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 10)
  const last = Math.min(commits.length, Math.ceil((scrollTop + viewH) / ROW_H) + 10)
  const headSha = commits.find((c) => c.refs.some((r) => r.kind === 'head'))?.sha
  const selCommits = selected.map((s) => commits[index.get(s) ?? -1]).filter(Boolean)
  const s = ws.status
  const changeCount = s ? new Set([...s.staged, ...s.unstaged, ...s.conflicted].map((f) => f.path)).size : 0
  const modeInfo = SEARCH_MODES.find((m) => m.value === mode)!

  return (
    <div className="history" ref={historyRef} style={{ gridTemplateRows: `minmax(120px, 1fr) 0 minmax(150px, ${detailPct}%)` }}>
      <div className="commit-table">
        <div className="history-bar">
          <div className="seg small">
            {([['all', tk('모든 브랜치')], ['local', tk('로컬만')], ['current', tk('현재 브랜치')]] as const).map(([v, label]) => (
              <button key={v} className={scope === v ? 'on' : ''} onClick={() => { setScope(v); setLimit(PAGE) }}>{t(label)}</button>
            ))}
          </div>
          <form className="search-box" onSubmit={(e) => { e.preventDefault(); applySearch() }}>
            <select value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} aria-label={t('검색 대상')}>
              {SEARCH_MODES.map((m) => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
            </select>
            <Search className="search-icon" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`${t(modeInfo.placeholder)} · Enter`} aria-label={t('커밋 검색')} />
            {(text || search) && <button type="button" className="icon-btn small" aria-label={t('검색 지우기')} onClick={() => { setText(''); setSearch(null) }}><X /></button>}
          </form>
          {search && <span className="muted small">{log.isFetching ? t('찾는 중…') : t('{n}개 찾음', { n: `${commits.length}${commits.length >= limit ? '+' : ''}` })}</span>}
          <span className="spacer" />
          {selected.length > 1 && <span className="muted small">{t('{n}개 선택 · 오른쪽 클릭으로 체리픽·패치', { n: selected.length })}</span>}
        </div>
        {changeCount > 0 && !search && (
          <button className="pending-row" onClick={() => ws.setView('changes')}>
            <FilePen />{tx('커밋하지 않은 변경 {n}개', { n: <b>{changeCount}</b> })} <span className="muted">· {t('변경 사항에서 보기')}</span>
          </button>
        )}
        <div className="commit-head" style={{ gridTemplateColumns: cols(graphWidth) }}>
          {graphWidth > 0 ? <span>{t('그래프')}</span> : <span />}<span>{t('설명')}</span><span>{t('작성자')}</span><span>{t('날짜')}</span><span>{t('커밋')}</span>
        </div>
        <div className="commit-list" ref={list} tabIndex={0} onKeyDown={onKey} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          {log.isPending && <p className="empty">{t('커밋을 불러오는 중…')}</p>}
          {log.error && <p className="empty error">{(log.error as Error).message}</p>}
          {log.data && commits.length === 0 && <p className="empty">{search ? t('찾는 커밋이 없어요') : t('아직 커밋이 없어요. 변경 사항에서 첫 커밋을 만들어 보세요.')}</p>}
          <div style={{ height: commits.length * ROW_H + (commits.length >= limit ? 44 : 0), position: 'relative' }}>
            {commits.slice(first, last).map((c, k) => {
              const i = first + k
              return (
                <CommitRow
                  key={c.sha}
                  commit={c}
                  top={i * ROW_H}
                  graph={rows ? <GraphCell row={rows[i]} width={graphWidth} isHead={c.sha === headSha} merge={c.parents.length > 1} /> : null}
                  graphWidth={graphWidth}
                  selected={selected.includes(c.sha)}
                  onMouseDown={(e) => click(e, c)}
                  onContextMenu={(e) => ui.menu(e, a.commitMenu(c, selected.includes(c.sha) ? selCommits : [c], (from, to) => setCompare({ from, to })))}
                  onRefMenu={(e, r) => {
                    const b = ws.branches
                    if (r.kind === 'tag') {
                      const t = b?.tags.find((x) => x.name === r.name)
                      if (t) ui.menu(e, a.tagMenu(t))
                    } else if (r.kind === 'remote') ui.menu(e, a.remoteBranchMenu(r.name))
                    else {
                      const lb = b?.local.find((x) => x.name === r.name)
                      if (lb) ui.menu(e, a.branchMenu(lb))
                    }
                  }}
                  onRefDouble={(r) => {
                    if (r.kind === 'branch') void a.checkout(r.name)
                    else if (r.kind === 'remote') a.checkoutRemote(r.name)
                  }}
                />
              )
            })}
            {commits.length >= limit && (
              <button className="btn load-more" style={{ top: commits.length * ROW_H + 6 }} onClick={() => setLimit((l) => l + PAGE)}>
                {t('커밋 {n}개 더 불러오기', { n: PAGE })}
              </button>
            )}
          </div>
        </div>
      </div>
      <Splitter dir="row" onReset={resetDetailPct} onDrag={(_x, y) => {
        const r = historyRef.current?.getBoundingClientRect()
        if (r) setDetailPct(clamp(((r.bottom - y) / r.height) * 100, 15, 82))
      }} />
      {shownCompare ? (
        <div className="compare-wrap">
          <div className="compare-bar">
            <GitCompareArrows />
            <span>{tx('{from} → {to} 사이의 변경', { from: <span className="mono">{label(shownCompare.from)}</span>, to: <span className="mono">{label(shownCompare.to)}</span> })}</span>
            <span className="spacer" />
            <button className="btn small" onClick={() => { setCompare(null); setSelected(selected.slice(-1)) }}>{t('비교 끝내기')}</button>
          </div>
          <CommitDetail repo={ws.repo} sha={null} compare={shownCompare} />
        </div>
      ) : (
        <CommitDetail repo={ws.repo} sha={selected.length === 1 ? selected[0] : null} multi={selected.length} />
      )}
    </div>
  )
}

const label = (rev: string) => (/^[0-9a-f]{40,64}$/i.test(rev) ? short(rev) : rev)

const cols = (lanes: number) => `${lanes > 0 ? Math.max(64, 20 + lanes * LANE_W) : 8}px minmax(0, 1fr) 150px 120px 82px`

function CommitRow({ commit, top, graph, graphWidth, selected, onMouseDown, onContextMenu, onRefMenu, onRefDouble }: {
  commit: Commit
  top: number
  graph: ReactNode
  graphWidth: number
  selected: boolean
  onMouseDown: (e: MouseEvent) => void
  onContextMenu: (e: MouseEvent) => void
  onRefMenu: (e: MouseEvent, r: Ref) => void
  onRefDouble: (r: Ref) => void
}) {
  return (
    <div
      className={`commit-row ${selected ? 'selected' : ''}`}
      style={{ top, height: ROW_H, gridTemplateColumns: cols(graphWidth) }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      role="row"
      aria-selected={selected}
    >
      <span className="cell-graph">{graph}</span>
      <span className="cell-subject">
        {commit.refs.map((r) => (
          <RefBadge key={r.kind + r.name} r={r}
            onContextMenu={(e) => onRefMenu(e, r)}
            onDoubleClick={() => onRefDouble(r)} />
        ))}
        <span className="subject" title={commit.subject}>{commit.subject}</span>
      </span>
      <span className="cell-author" title={commit.email}>{commit.author}</span>
      <span className="cell-date" title={fullDate(commit.time)}>{relativeTime(commit.time)}</span>
      <span className="cell-sha">{short(commit.sha)}</span>
    </div>
  )
}

export function RefBadge({ r, onContextMenu, onDoubleClick }: { r: Ref; onContextMenu?: (e: MouseEvent) => void; onDoubleClick?: () => void }) {
  const p = { onContextMenu, onDoubleClick }
  if (r.kind === 'tag') return <span className="ref tag" {...p}><Tag />{r.name}</span>
  if (r.kind === 'remote') return <span className="ref remote" {...p} title={t('원격 브랜치 · 더블클릭으로 체크아웃')}><Cloud />{r.name}</span>
  if (r.kind === 'head') return <span className="ref head" {...p} title={t('지금 체크아웃된 브랜치')}><GitBranch />{r.name}</span>
  return <span className="ref branch" {...p} title={t('더블클릭으로 체크아웃')}><GitBranch />{r.name}</span>
}
