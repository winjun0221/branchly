import type { MouseEvent } from 'react'
import {
  Archive, ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, CloudDownload, Ellipsis, ExternalLink, FileUp, FolderOpen,
  GitBranch, GitBranchPlus, GitCommitHorizontal, GitMerge, LoaderCircle, RefreshCw, Settings, Settings2, SquareTerminal, Workflow,
} from 'lucide-react'
import { webRepo } from '../../../shared/hosting'
import { useActions } from '../actions'
import { useUi, type MenuItem } from '../ui'
import { useWs } from '../ws'
import { t } from '../i18n'

/** 위쪽 막대: 자주 쓰는 git 작업 버튼 */
export default function Toolbar() {
  const ws = useWs()
  const ui = useUi()
  const a = useActions()
  const s = ws.status
  const changes = s ? new Set([...s.staged, ...s.unstaged, ...s.conflicted].map((f) => f.path)).size : 0
  const noRemote = ws.remotes.length === 0
  const local = ws.branches?.local ?? []

  const below = (e: MouseEvent, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect()
    ui.menu({ x: r.left, y: r.bottom + 4 }, items)
  }

  const switchMenu = (e: MouseEvent) => below(e, [
    { section: t('브랜치 바꾸기') },
    ...local.map((b): MenuItem => ({
      label: b.name,
      icon: b.current ? Check : GitBranch,
      hint: [b.ahead ? `↑${b.ahead}` : '', b.behind ? `↓${b.behind}` : ''].join(' ').trim() || undefined,
      disabled: b.current,
      onClick: () => void a.checkout(b.name),
    })),
    'sep',
    { label: t('새 브랜치…'), icon: GitBranchPlus, onClick: () => a.newBranch() },
  ])

  const mergeMenu = (e: MouseEvent) => below(e, [
    { section: t('{branch}에 병합할 브랜치', { branch: s?.branch ?? 'HEAD' }) },
    ...local.filter((b) => !b.current).map((b): MenuItem => ({ label: b.name, icon: GitBranch, onClick: () => a.merge(b.name) })),
    'sep',
    ...(ws.branches?.remote ?? []).map((b): MenuItem => ({ label: b.name, icon: CloudDownload, onClick: () => a.merge(b.name) })),
  ])

  const origin = ws.remotes.find((r) => r.name === 'origin') ?? ws.remotes[0]
  const web = origin ? webRepo(origin.fetchUrl) : null
  const moreMenu = (e: MouseEvent) => below(e, [
    { label: t('패치 파일 적용…'), icon: FileUp, onClick: () => void a.applyPatchFile() },
    'sep',
    { label: t('탐색기에서 열기'), icon: FolderOpen, onClick: () => a.showInFolder() },
    { label: t('터미널 열기'), icon: SquareTerminal, onClick: a.openTerminal },
    web && { label: t('원격 저장소 웹에서 열기'), icon: ExternalLink, onClick: () => a.openUrl(web.base) },
    'sep',
    { label: t('저장소 설정…'), icon: Settings2, onClick: () => a.repoSettings() },
    { label: t('앱 설정…'), icon: Settings, onClick: a.appSettings },
  ])

  return (
    <header className="toolbar">
      <button className="branch-chip" onClick={switchMenu} title={s?.upstream ? t('추적: {upstream}', { upstream: s.upstream }) : t('추적하는 원격 브랜치 없음')}>
        <GitBranch />
        <b>{s ? (s.detached ? t('HEAD 분리됨') : s.branch ?? '…') : '…'}</b>
        {!!s?.ahead && <span className="ab up">↑{s.ahead}</span>}
        {!!s?.behind && <span className="ab down">↓{s.behind}</span>}
        <ChevronDown className="chev" />
      </button>

      <div className="tool-group">
        <Tool icon={GitCommitHorizontal} label={t('커밋')} onClick={() => ws.setView('changes')} badge={changes} />
      </div>
      <div className="tool-group">
        <Tool icon={CloudDownload} label={t('Fetch')} onClick={a.fetch} disabled={noRemote} />
        <Tool icon={ArrowDownToLine} label={t('Pull')} onClick={a.pull} disabled={noRemote} badge={s?.behind} />
        <Tool icon={ArrowUpFromLine} label={t('Push')} onClick={a.push} disabled={noRemote} badge={s?.ahead} />
      </div>
      <div className="tool-group">
        <Tool icon={GitBranchPlus} label={t('브랜치')} onClick={() => a.newBranch()} />
        <Tool icon={GitMerge} label={t('병합')} onClick={mergeMenu} />
        <Tool icon={Archive} label={t('스태시')} onClick={a.stash} disabled={changes === 0} />
        <Tool icon={Workflow} label={t('Git 흐름')} onClick={a.flow} disabled={!s || s.unborn} />
      </div>

      <span className="spacer" />
      {ws.busy && <span className="busy"><LoaderCircle className="spin" />{t('{label} 중…', { label: ws.busy })}</span>}
      <button className="icon-btn" title={t('터미널 열기')} aria-label={t('터미널 열기')} onClick={a.openTerminal}><SquareTerminal /></button>
      <button className="icon-btn" title={t('탐색기에서 열기')} aria-label={t('탐색기에서 열기')} onClick={() => a.showInFolder()}><FolderOpen /></button>
      <button className="icon-btn" title={t('새로고침 (F5)')} aria-label={t('새로고침')} onClick={ws.refresh}><RefreshCw /></button>
      <button className="icon-btn" title={t('저장소 설정')} aria-label={t('저장소 설정')} onClick={() => a.repoSettings()}><Settings2 /></button>
      <button className="icon-btn" title={t('더 보기')} aria-label={t('더 보기')} onClick={moreMenu}><Ellipsis /></button>
    </header>
  )
}

function Tool({ icon: Icon, label, onClick, disabled, badge }: {
  icon: typeof GitBranch
  label: string
  onClick: (e: MouseEvent) => void
  disabled?: boolean
  badge?: number
}) {
  return (
    <button className="tool-btn" onClick={onClick} disabled={disabled} title={label}>
      <Icon />
      <span>{label}</span>
      {!!badge && <span className="dot">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}
