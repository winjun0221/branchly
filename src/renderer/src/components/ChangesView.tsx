import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown, ArrowUp, Check, CircleCheck, Copy, EyeOff, FileMinus, FileText, FolderOpen, FolderTree, GitCommitHorizontal, History,
  List, LoaderCircle, Minus, Plus, ScanEye, Settings2, SquarePen, TriangleAlert, Undo2, Wrench,
} from 'lucide-react'
import type { CommitOptions, DiffKind, FileChange } from '../../../shared/types'
import { api, useWorkingDiff } from '../api'
import { useActions } from '../actions'
import { t, tx } from '../i18n'
import { useUi, type MenuItem } from '../ui'
import { lastLines, useWs } from '../ws'
import DiffView from './DiffView'
import { buildFileTree, FileRow, FolderRow, type FileTreeNode } from './FileList'

type Section = 'conflicted' | 'staged' | 'unstaged'
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico)$/i

function loadDraft(repo: string) {
  try {
    return JSON.parse(sessionStorage.getItem('branchly.draft:' + repo) ?? 'null') as { summary: string; desc: string } | null
  } catch {
    return null
  }
}
function saveDraft(repo: string, d: { summary: string; desc: string }) {
  try {
    sessionStorage.setItem('branchly.draft:' + repo, JSON.stringify(d))
  } catch {
    // 못 남겨도 그만
  }
}

/** 변경 사항: 왼쪽 = 충돌·스테이지됨·변경됨 목록 + 커밋, 오른쪽 = 변경 내용(덩어리·줄 단위 올리기) */
export default function ChangesView() {
  const ws = useWs()
  const ui = useUi()
  const a = useActions()
  const s = ws.status
  const staged = useMemo(() => s?.staged ?? [], [s])
  const unstaged = useMemo(() => s?.unstaged ?? [], [s])
  const conflicted = useMemo(() => s?.conflicted ?? [], [s])
  const [tree, setTree] = useState(() => localStorage.getItem('branchly.fileTree') === '1')
  const [sel, setSel] = useState<{ section: Section; paths: string[] }>({ section: 'unstaged', paths: [] })
  const [focus, setFocus] = useState<{ section: Section; path: string } | null>(null)
  const anchor = useRef<string | null>(null)

  const lists: Record<Section, FileChange[]> = { conflicted, staged, unstaged }

  // 고른 파일이 목록에서 사라지면(올리기·커밋) 같은 쪽 다른 파일 → 다른 쪽
  useEffect(() => {
    if (!s) return
    if (focus && lists[focus.section].some((f) => f.path === focus.path)) return
    const next: { section: Section; path: string } | null = conflicted[0]
      ? { section: 'conflicted', path: conflicted[0].path }
      : focus?.section === 'staged' && staged[0] ? { section: 'staged', path: staged[0].path }
        : unstaged[0] ? { section: 'unstaged', path: unstaged[0].path }
          : staged[0] ? { section: 'staged', path: staged[0].path } : null
    setFocus(next)
    setSel(next ? { section: next.section, paths: [next.path] } : { section: 'unstaged', paths: [] })
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  const focusFile = focus ? lists[focus.section].find((f) => f.path === focus.path) ?? null : null
  const kind: DiffKind = focus?.section === 'staged' ? 'staged' : focusFile?.kind === '?' ? 'untracked' : 'unstaged'
  const isConflict = focus?.section === 'conflicted'
  const diff = useWorkingDiff(ws.repo, isConflict ? null : focus?.path ?? null, kind, ws.diffOpts)
  const conflictText = useQuery({
    queryKey: ['diff-working', ws.repo, 'conflict', focus?.path],
    enabled: isConflict && !!focus,
    queryFn: () => api.readWorkingFile(ws.repo, focus!.path),
  })
  const isImage = !!focus && IMAGE.test(focus.path) && !isConflict
  const images = useQuery({
    queryKey: ['diff-working', ws.repo, 'image', focus?.path, kind, s?.unborn],
    enabled: isImage,
    queryFn: async () => ({
      before: kind === 'untracked' || focusFile?.kind === 'A' || s?.unborn ? null : await api.imagePreview(ws.repo, 'HEAD', focus!.path),
      after: focusFile?.kind === 'D' ? null : await api.imagePreview(ws.repo, null, focus!.path),
    }),
  })

  // ───── 동작 ─────
  const stageFiles = (paths: string[]) => ws.run(t('스테이지'), () => api.stage(ws.repo, paths))
  const unstageFiles = (paths: string[]) => ws.run(t('내리기'), () => api.unstage(ws.repo, paths))
  const discardFiles = async (files: FileChange[], includeStaged: boolean) => {
    const tracked = files.filter((f) => f.kind !== '?').map((f) => f.path)
    const untracked = files.filter((f) => f.kind === '?').map((f) => f.path)
    const ok = await ui.confirm({
      title: t('변경 버리기'),
      danger: true,
      confirm: t('버리기'),
      message: (
        <>
          <p>{tx('{target}의 변경을 버릴까요?', { target: files.length === 1 ? <b>{files[0].path}</b> : t('파일 {n}개', { n: files.length }) })}</p>
          {tracked.length > 0 && <p className="muted small">{includeStaged ? t('수정한 파일은 마지막 커밋 상태로 돌아가요 (스테이지된 변경 포함). 되살릴 수 없어요.') : t('수정한 파일은 마지막 커밋 상태로 돌아가요. 되살릴 수 없어요.')}</p>}
          {untracked.length > 0 && <p className="muted small">{t('새 파일 {n}개는 휴지통으로 옮겨요.', { n: untracked.length })}</p>}
        </>
      ),
    })
    if (ok) await ws.run(t('변경 버리기'), () => api.discard(ws.repo, tracked, untracked, includeStaged), t('변경을 버렸어요'))
  }
  const resolve = (path: string, side: 'ours' | 'theirs' | 'mark') =>
    ws.run(t('충돌 해결'), () => api.resolveConflict(ws.repo, path, side), side === 'mark' ? t('해결됨으로 표시했어요: {path}', { path }) : side === 'ours' ? t('내 쪽으로 해결했어요: {path}', { path }) : t('상대 쪽으로 해결했어요: {path}', { path }))
  const mergeTool = (path: string) => ws.run(t('병합 도구'), () => api.mergeTool(ws.repo, path))

  // ───── 고르기 (Ctrl 하나씩, Shift 범위) ─────
  const order = (section: Section) => (tree ? flattenTree(buildFileTree(lists[section])) : lists[section]).map((f) => f.path)
  const pick = (e: MouseEvent, section: Section, path: string) => {
    if (e.button === 2) {
      if (!(sel.section === section && sel.paths.includes(path))) {
        setSel({ section, paths: [path] })
        setFocus({ section, path })
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && sel.section === section) {
      setSel({ section, paths: sel.paths.includes(path) ? sel.paths.filter((p) => p !== path) : [...sel.paths, path] })
    } else if (e.shiftKey && sel.section === section && anchor.current) {
      const o = order(section)
      const [i, j] = [o.indexOf(anchor.current), o.indexOf(path)].sort((x, y) => x - y)
      if (i >= 0) setSel({ section, paths: o.slice(i, j + 1) })
    } else {
      setSel({ section, paths: [path] })
      anchor.current = path
    }
    setFocus({ section, path })
  }
  const selectedIn = (section: Section, path: string) => sel.section === section && sel.paths.includes(path)
  const targets = (section: Section, f: FileChange) =>
    selectedIn(section, f.path) ? lists[section].filter((x) => sel.paths.includes(x.path)) : [f]

  const fileMenu = (e: MouseEvent, section: Section, f: FileChange) => {
    const fs = targets(section, f)
    const paths = fs.map((x) => x.path)
    const one = fs.length === 1
    const ext = f.path.includes('.') ? '*' + f.path.slice(f.path.lastIndexOf('.')) : null
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : null
    const items: MenuItem[] = [{ section: one ? f.path : t('파일 {n}개', { n: fs.length }) }]
    if (section === 'conflicted') {
      items.push(
        { label: t('내 쪽(현재 브랜치)으로 해결'), icon: Check, onClick: () => void resolve(f.path, 'ours') },
        { label: t('상대 쪽(합치는 쪽)으로 해결'), icon: Check, onClick: () => void resolve(f.path, 'theirs') },
        { label: t('직접 고쳤어요 — 해결됨으로 표시'), icon: CircleCheck, onClick: () => void resolve(f.path, 'mark') },
        { label: t('외부 병합 도구로 열기'), icon: Wrench, onClick: () => void mergeTool(f.path) },
        'sep',
      )
    } else if (section === 'unstaged') {
      items.push(
        { label: t('스테이지에 올리기'), icon: Plus, onClick: () => void stageFiles(paths) },
        { label: t('변경 버리기…'), icon: Undo2, danger: true, onClick: () => void discardFiles(fs, false) },
        'sep',
        one && { label: t('무시하기: {path}', { path: f.path }), icon: EyeOff, onClick: () => void ws.run(t('무시하기'), () => api.ignore(ws.repo, '/' + f.path), t('.gitignore에 추가했어요: {pattern}', { pattern: '/' + f.path })) },
        one && ext && { label: t('무시하기: 모든 {ext} 파일', { ext }), icon: EyeOff, onClick: () => void ws.run(t('무시하기'), () => api.ignore(ws.repo, ext), t('.gitignore에 추가했어요: {pattern}', { pattern: ext })) },
        one && dir && { label: t('무시하기: {dir} 폴더', { dir }), icon: EyeOff, onClick: () => void ws.run(t('무시하기'), () => api.ignore(ws.repo, '/' + dir), t('.gitignore에 추가했어요: {pattern}', { pattern: '/' + dir })) },
        fs.some((x) => x.kind !== '?') && { label: t('추적 그만하기 (파일은 남김)'), icon: FileMinus, onClick: () => void ws.run(t('추적 그만하기'), () => api.untrack(ws.repo, fs.filter((x) => x.kind !== '?').map((x) => x.path)), t('추적을 그만했어요. 커밋하면 저장소에서 빠져요')) },
        'sep',
      )
    } else {
      items.push(
        { label: t('스테이지에서 내리기'), icon: Minus, onClick: () => void unstageFiles(paths) },
        { label: t('변경 버리기 (스테이지 포함)…'), icon: Undo2, danger: true, onClick: () => void discardFiles(fs, true) },
        'sep',
      )
    }
    items.push(
      one && f.kind !== '?' && { label: t('파일 기록'), icon: History, onClick: () => a.fileHistory(f.path) },
      one && f.kind !== '?' && f.kind !== 'A' && { label: t('줄별 작성자'), icon: ScanEye, onClick: () => a.blame(f.path, null) },
      one && f.kind !== 'D' && { label: t('파일 열기'), icon: FileText, onClick: () => a.openFile(f.path) },
      one && { label: t('탐색기에서 보기'), icon: FolderOpen, onClick: () => a.showInFolder(f.path) },
      { label: t('경로 복사'), icon: Copy, onClick: () => a.copy(paths.join('\n'), t('경로')) },
    )
    ui.menu(e, items)
  }

  const folderMenu = (e: MouseEvent, section: Section, node: FileTreeNode) => {
    const fs = flattenTree(node)
    const paths = fs.map((f) => f.path)
    ui.menu(e, [
      { section: node.path + '/' },
      section === 'unstaged' && { label: t('폴더 전체 올리기'), icon: Plus, onClick: () => void stageFiles(paths) },
      section === 'staged' && { label: t('폴더 전체 내리기'), icon: Minus, onClick: () => void unstageFiles(paths) },
      section !== 'conflicted' && { label: t('폴더 변경 모두 버리기…'), icon: Undo2, danger: true, onClick: () => void discardFiles(fs, section === 'staged') },
      section === 'unstaged' && { label: t('무시하기: {dir} 폴더', { dir: node.path + '/' }), icon: EyeOff, onClick: () => void ws.run(t('무시하기'), () => api.ignore(ws.repo, '/' + node.path + '/'), t('.gitignore에 추가했어요')) },
      { label: t('탐색기에서 보기'), icon: FolderOpen, onClick: () => a.showInFolder(node.path) },
    ])
  }

  const rowAction = (section: Section, f: FileChange) => {
    if (section === 'staged') return <button className="mini-btn" onClick={() => void unstageFiles(targets(section, f).map((x) => x.path))} title={t('스테이지에서 내리기')}><Minus /></button>
    if (section === 'unstaged') {
      return (
        <>
          <button className="mini-btn" onClick={() => void discardFiles(targets(section, f), false)} title={t('변경 버리기')}><Undo2 /></button>
          <button className="mini-btn" onClick={() => void stageFiles(targets(section, f).map((x) => x.path))} title={t('스테이지에 올리기')}><Plus /></button>
        </>
      )
    }
    return <button className="mini-btn" onClick={() => void resolve(f.path, 'mark')} title={t('해결됨으로 표시')}><Check /></button>
  }

  const renderFiles = (section: Section) => {
    const files = lists[section]
    const row = (f: FileChange, depth = 0, nameOnly = false) => (
      <FileRow key={section + f.path} file={f} depth={depth} nameOnly={nameOnly}
        selected={selectedIn(section, f.path)}
        onSelect={(e) => pick(e, section, f.path)}
        onContextMenu={(e) => fileMenu(e, section, f)}
        onDoubleClick={() => (section === 'staged' ? void unstageFiles([f.path]) : section === 'unstaged' ? void stageFiles([f.path]) : undefined)}
        action={rowAction(section, f)} />
    )
    if (!tree) return files.map((f) => row(f))
    return <TreeRows node={buildFileTree(files)} depth={0} section={section} row={row} onFolderMenu={folderMenu} />
  }

  const total = new Set([...staged, ...unstaged, ...conflicted].map((f) => f.path)).size
  const multi = sel.paths.length > 1 ? sel : null

  return (
    <div className="changes">
      <div className="changes-side">
        <div className="changes-bar">
          <b>{t('변경 사항')}</b>
          <span className="muted small">{total ? t('파일 {n}개', { n: total }) : ''}</span>
          <span className="spacer" />
          <div className="seg small icon-only">
            <button className={!tree ? 'on' : ''} title={t('목록으로 보기')} onClick={() => { setTree(false); localStorage.setItem('branchly.fileTree', '0') }}><List /></button>
            <button className={tree ? 'on' : ''} title={t('폴더로 보기')} onClick={() => { setTree(true); localStorage.setItem('branchly.fileTree', '1') }}><FolderTree /></button>
          </div>
        </div>

        {total === 0 && s && (
          <div className="clean">
            <CircleCheck />
            <b>{t('작업 사본이 깨끗해요')}</b>
            <span className="muted small">{t('커밋할 변경 사항이 없어요')}</span>
          </div>
        )}

        {conflicted.length > 0 && (
          <FileSection title={t('충돌|section')} icon={<TriangleAlert />} tone="danger" count={conflicted.length}
            action={<span className="muted small">{t('파일을 오른쪽 클릭해 해결')}</span>}>
            {renderFiles('conflicted')}
          </FileSection>
        )}

        <FileSection title={t('스테이지됨')} count={staged.length}
          action={staged.length > 0 && (
            multi?.section === 'staged'
              ? <button className="link" onClick={() => void unstageFiles(multi.paths)}><ArrowDown />{t('{n}개 내리기', { n: multi.paths.length })}</button>
              : <button className="link" onClick={() => void unstageFiles(staged.map((f) => f.path))}><ArrowDown />{t('모두 내리기')}</button>
          )}>
          {renderFiles('staged')}
          {staged.length === 0 && <p className="section-empty">{t('커밋할 파일을 아래에서 올리세요')}</p>}
        </FileSection>

        <FileSection title={t('변경됨')} count={unstaged.length}
          action={unstaged.length > 0 && (
            multi?.section === 'unstaged'
              ? <button className="link" onClick={() => void stageFiles(multi.paths)}><ArrowUp />{t('{n}개 올리기', { n: multi.paths.length })}</button>
              : <button className="link" onClick={() => void stageFiles(unstaged.map((f) => f.path))}><ArrowUp />{t('모두 올리기')}</button>
          )}>
          {renderFiles('unstaged')}
          {unstaged.length === 0 && <p className="section-empty">{t('바뀐 파일이 없어요')}</p>}
        </FileSection>

        <CommitBox stagedCount={staged.length} conflicts={conflicted.length} />
      </div>
      <DiffView
        path={focus?.path ?? null}
        raw={isConflict ? undefined : diff.data}
        loading={isConflict ? conflictText.isPending : diff.isFetching && !diff.data}
        error={isConflict ? conflictText.error : diff.error}
        images={isImage ? images.data : null}
        conflict={isConflict ? (conflictText.data?.text ?? (conflictText.data ? t('(바이너리이거나 너무 큰 파일이에요)') : null)) : undefined}
        stage={focus && !isConflict ? { kind, apply: (patch, mode) => ws.run(mode === 'stage' ? t('올리기|stage') : mode === 'unstage' ? t('내리기') : t('버리기'), () => api.applyPatch(ws.repo, patch, mode)) } : undefined}
        actions={focus && isConflict ? (
          <span className="conflict-actions">
            <button className="btn small" onClick={() => void resolve(focus.path, 'ours')}>{t('내 쪽으로')}</button>
            <button className="btn small" onClick={() => void resolve(focus.path, 'theirs')}>{t('상대 쪽으로')}</button>
            <button className="btn small" onClick={() => a.openFile(focus.path)}><SquarePen />{t('편집기로')}</button>
            <button className="btn small" onClick={() => void mergeTool(focus.path)}><Wrench />{t('병합 도구')}</button>
            <button className="btn small primary" onClick={() => void resolve(focus.path, 'mark')}><Check />{t('해결됨')}</button>
          </span>
        ) : undefined}
      />
    </div>
  )
}

function flattenTree(n: FileTreeNode): FileChange[] {
  return [...n.folders.flatMap(flattenTree), ...n.files]
}

const closedFolders = new Set<string>()

function TreeRows({ node, depth, section, row, onFolderMenu }: {
  node: FileTreeNode
  depth: number
  section: Section
  row: (f: FileChange, depth: number, nameOnly: boolean) => ReactNode
  onFolderMenu: (e: MouseEvent, section: Section, node: FileTreeNode) => void
}) {
  const [, force] = useState(0)
  return (
    <>
      {node.folders.map((f) => {
        const key = section + ':' + f.path
        const open = !closedFolders.has(key)
        return (
          <div key={f.path}>
            <FolderRow node={f} depth={depth} open={open} onContextMenu={(e) => onFolderMenu(e, section, f)}
              onToggle={() => { if (open) closedFolders.add(key); else closedFolders.delete(key); force((n) => n + 1) }} />
            {open && <TreeRows node={f} depth={depth + 1} section={section} row={row} onFolderMenu={onFolderMenu} />}
          </div>
        )
      })}
      {node.files.map((f) => row(f, depth + (depth > 0 || node.folders.length > 0 ? 1 : 0), true))}
    </>
  )
}

function FileSection({ title, icon, tone, count, action, children }: {
  title: string
  icon?: ReactNode
  tone?: 'danger'
  count: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`file-section ${tone ?? ''}`}>
      <div className="section-head">
        {icon}
        <b>{title}</b>
        <span className="count-pill">{count}</span>
        <span className="spacer" />
        {action}
      </div>
      <div className="section-files">{children}</div>
    </section>
  )
}

function CommitBox({ stagedCount, conflicts }: { stagedCount: number; conflicts: number }) {
  const ws = useWs()
  const ui = useUi()
  const draft = useMemo(() => loadDraft(ws.repo), [ws.repo])
  const [summary, setSummary] = useState(draft?.summary ?? '')
  const [desc, setDesc] = useState(draft?.desc ?? '')
  const [opts, setOpts] = useState<CommitOptions>({ amend: false, signoff: false, noVerify: false, push: false })
  const [busy, setBusy] = useState(false)
  const op = ws.status?.operation

  useEffect(() => saveDraft(ws.repo, { summary, desc }), [ws.repo, summary, desc])

  // 병합 중이면 병합 메시지를 미리 채우고, 병합이 끝나면(계속·중단) 미리 채운 그대로일 때 지움
  const prefilled = useRef<string | null>(null)
  useEffect(() => {
    if (op?.kind === 'merge' && !summary && op.detail) {
      setSummary(op.detail)
      prefilled.current = op.detail
    } else if (!op && prefilled.current !== null) {
      if (summary === prefilled.current) setSummary('')
      prefilled.current = null
    }
  }, [op?.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const setAmend = async (on: boolean) => {
    setOpts((o) => ({ ...o, amend: on }))
    if (on && !summary.trim()) {
      const last = await api.lastCommitMessage(ws.repo)
      const [first, ...rest] = last.split('\n')
      setSummary(first)
      setDesc(rest.join('\n').trim())
    }
  }

  const message = summary.trim() + (desc.trim() ? `\n\n${desc.trim()}` : '')
  const canCommit = summary.trim().length > 0 && (stagedCount > 0 || opts.amend || op?.kind === 'merge') && conflicts === 0 && !busy

  const commit = async () => {
    if (!canCommit) return
    setBusy(true)
    const ok = await ws.run(opts.push ? t('커밋 후 Push') : t('커밋'), () => api.commit(ws.repo, message, opts),
      (out) => (opts.amend ? t('마지막 커밋을 고쳤어요') : t('커밋했어요: {summary}', { summary: summary.trim() })) + (opts.push ? '\n' + lastLines(out, 2) : ''))
    setBusy(false)
    if (ok) {
      setSummary('')
      setDesc('')
      setOpts((o) => ({ ...o, amend: false }))
    }
  }

  const recent = async (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    const list = await api.recentMessages(ws.repo).catch(() => [] as string[])
    ui.menu({ x: r.left, y: r.top }, [
      { section: t('최근 커밋 메시지') },
      ...list.map((m): MenuItem => ({ label: m, onClick: () => setSummary(m) })),
    ])
  }

  const optionMenu = (e: MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    ui.menu({ x: r.left, y: r.top }, [
      { label: (opts.signoff ? '✓ ' : '') + t('Signed-off-by 줄 붙이기'), onClick: () => setOpts((o) => ({ ...o, signoff: !o.signoff })) },
      { label: (opts.noVerify ? '✓ ' : '') + t('커밋 훅 건너뛰기 (--no-verify)'), onClick: () => setOpts((o) => ({ ...o, noVerify: !o.noVerify })) },
      { label: (opts.push ? '✓ ' : '') + t('커밋한 뒤 바로 Push'), onClick: () => setOpts((o) => ({ ...o, push: !o.push })), disabled: ws.remotes.length === 0 },
    ])
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void commit()
    }
  }

  const flags = [opts.signoff && t('서명'), opts.noVerify && t('훅 건너뜀'), opts.push && t('바로 Push')].filter(Boolean)

  return (
    <div className="commit-box">
      <div className="commit-summary-row">
        <input className="commit-summary" placeholder={opts.amend ? t('마지막 커밋 메시지 (고쳐 쓰기)') : t('커밋 요약 (필수)')} maxLength={300}
          value={summary} onChange={(e) => setSummary(e.target.value)} onKeyDown={onKey} />
        <button className="icon-btn" title={t('최근 메시지')} aria-label={t('최근 메시지')} onClick={recent}><History /></button>
      </div>
      <textarea className="commit-desc" placeholder={t('자세한 설명 (선택)')} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={onKey} />
      <div className="commit-actions">
        <label className="check">
          <input type="checkbox" checked={opts.amend} onChange={(e) => void setAmend(e.target.checked)} />
          {t('마지막 커밋 고치기')}
        </label>
        <button className={`icon-btn small ${flags.length ? 'on' : ''}`} title={t('커밋 옵션')} aria-label={t('커밋 옵션')} onClick={optionMenu}><Settings2 /></button>
        <span className="spacer" />
        <button className="btn primary" disabled={!canCommit} onClick={() => void commit()} title="Ctrl+Enter">
          {busy ? <LoaderCircle className="spin" /> : <GitCommitHorizontal />}
          {opts.push ? t('커밋 후 Push') : stagedCount > 0 ? t('{n}개 파일 커밋', { n: stagedCount }) : t('커밋')}
        </button>
      </div>
      <p className="commit-hint muted small">
        {conflicts > 0 ? <span className="error">{t('충돌을 먼저 해결하세요')}</span> : <>{ws.status?.branch ? tx('{branch}에 커밋', { branch: <b>{ws.status.branch}</b> }) : t('HEAD 분리 상태에서 커밋')} · Ctrl+Enter</>}
        {flags.length > 0 && <span> · {flags.join(', ')}</span>}
      </p>
    </div>
  )
}
