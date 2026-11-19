// 작업 공간에서 쓰는 모든 동작과 오른쪽 클릭 메뉴. 툴바·사이드바·히스토리·변경 사항이 같이 쓴다.
import { useState, type ReactNode } from 'react'
import {
  Archive, ArchiveRestore, ArrowUpFromLine, CircleX, Copy, Download, ExternalLink, Eye, FileDown, GitBranch, GitBranchPlus,
  GitCompareArrows, GitMerge, GitPullRequestArrow, Link2, ListRestart, PencilLine, RotateCcw, Tag, Trash2, Undo2, Unlink,
  Upload, Cherry,
} from 'lucide-react'
import type { Branch, Commit, Stash } from '../../shared/types'
import { branchUrl, commitUrl, pullRequestUrl, webRepo } from '../../shared/hosting'
import { api, errorText } from './api'
import { useUi, type MenuItem } from './ui'
import { lastLines, remoteOf, short, useWs, WsContext, type Ws } from './ws'
import { Dialog, Field } from './components/Dialog'
import {
  CheckoutRemoteDialog, CreateBranchDialog, DeleteBranchDialog, MergeDialog, RenameBranchDialog, ResetDialog, StashBranchDialog,
  StashDialog, TagDialog,
} from './dialogs/BranchDialogs'
import { FetchDialog, PullDialog, PushDialog } from './dialogs/RemoteDialogs'
import { RebaseDialog } from './dialogs/RebaseDialog'
import { RepoSettingsDialog, type RepoTab } from './dialogs/RepoSettings'
import { AppSettingsDialog } from './dialogs/AppSettings'
import { FlowDialog } from './dialogs/FlowDialog'
import { BlameDialog, FileHistoryDialog } from './dialogs/FileDialogs'
import CommitDetail from './components/CommitDetail'
import { t, tx } from './i18n'

export type Actions = ReturnType<typeof useActions>

export function useActions() {
  const ws = useWs()
  const ui = useUi()
  const cur = ws.status?.branch ?? null
  const curLabel = ws.status?.detached ? 'HEAD' : cur ?? 'HEAD'

  /** 대화 상자 안에서도 useWs가 되도록 감싼다 */
  const open = (render: (close: () => void) => ReactNode) =>
    ui.open((close) => <WsContext.Provider value={ws}>{render(close)}</WsContext.Provider>)

  const web = (remoteName?: string | null) => {
    const r = (remoteName && ws.remotes.find((x) => x.name === remoteName)) || ws.remotes.find((x) => x.name === 'origin') || ws.remotes[0]
    return r ? webRepo(r.fetchUrl) : null
  }
  const openUrl = (url: string) => void api.openUrl(url).catch((e) => ui.notify(errorText(e), 'error'))
  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text)
    ui.notify(t('{what}을(를) 복사했어요', { what }), 'success')
  }

  const a = {
    // ───── 브랜치 ─────
    newBranch: (start?: { ref: string; label: string }) => open((close) => <CreateBranchDialog ws={ws} close={close} start={start} />),
    checkout: (name: string) => ws.run(t('체크아웃'), () => api.checkout(ws.repo, name), t('브랜치를 바꿨어요: {name}', { name })),
    checkoutRemote: (remoteBranch: string) => {
      const local = ws.branches?.local.find((b) => b.upstream === remoteBranch)
      if (local) return void a.checkout(local.name)
      open((close) => <CheckoutRemoteDialog ws={ws} close={close} remoteBranch={remoteBranch} />)
    },
    checkoutCommit: async (sha: string) => {
      if (await ui.confirm({
        title: t('커밋 체크아웃'),
        message: tx('커밋 {sha}로 작업 폴더를 바꿔요. 브랜치가 아닌 곳(HEAD 분리)이라 여기서 커밋하려면 새 브랜치를 만드세요.', { sha: <span className="mono">{short(sha)}</span> }),
        confirm: t('체크아웃'),
      })) await ws.run(t('체크아웃'), () => api.checkoutDetached(ws.repo, sha), t('커밋 {sha}로 바꿨어요', { sha: short(sha) }))
    },
    renameBranch: (name: string) => open((close) => <RenameBranchDialog ws={ws} close={close} name={name} />),
    deleteBranch: (b: Branch) => open((close) => <DeleteBranchDialog ws={ws} close={close} branch={b} />),
    deleteRemoteBranch: async (rb: string) => {
      if (await ui.confirm({ title: t('원격 브랜치 지우기'), message: tx('원격 저장소에서 {name} 브랜치를 지울까요? 다른 사람도 더는 받을 수 없어요.', { name: <b>{rb}</b> }), confirm: t('원격에서 지우기'), danger: true })) {
        await ws.run(t('원격 브랜치 지우기'), () => api.deleteRemoteBranch(ws.repo, rb), t('원격 브랜치를 지웠어요: {name}', { name: rb }))
      }
    },
    setUpstream: (branch: string) => open((close) => <UpstreamDialog ws={ws} close={close} branch={branch} />),
    unsetUpstream: (branch: string) => ws.run(t('추적 해제'), () => api.setUpstream(ws.repo, branch, null), t('{branch}의 추적 브랜치를 해제했어요', { branch })),
    pushBranch: (b: Branch) => {
      const remote = (b.upstream && remoteOf(ws.remotes, b.upstream)?.name) || (ws.remotes.find((r) => r.name === 'origin') ?? ws.remotes[0])?.name
      if (!remote) return ui.notify(t('원격 저장소가 없어요. 저장소 설정에서 추가하세요.'), 'warn')
      void ws.run(t('Push'), () => api.push(ws.repo, { remote, branches: [b.name], tags: false, force: false, setUpstream: !b.upstream }),
        (out) => t('{branch}을(를) {remote}에 Push했어요', { branch: b.name, remote }) + (out ? '\n' + lastLines(out, 2) : ''))
    },
    pullRequest: (b: Branch) => {
      if (!b.upstream) return ui.notify(t('먼저 이 브랜치를 원격에 올리세요.'), 'warn')
      const remote = remoteOf(ws.remotes, b.upstream)
      const w = remote ? webRepo(remote.fetchUrl) : null
      const remoteNames = new Set((ws.branches?.remote ?? []).map((x) => x.name))
      const target = ['develop', 'main', 'master'].find((t) => t !== b.name && remote && remoteNames.has(`${remote.name}/${t}`)) ?? 'main'
      const url = w ? pullRequestUrl(w, b.upstream.slice(remote!.name.length + 1), target) : null
      if (!url) return ui.notify(t('이 원격은 풀 리퀘스트 주소를 알 수 없어요 (GitHub·GitLab·Bitbucket만)'), 'warn')
      openUrl(url)
    },

    // ───── 병합·리베이스·커밋 ─────
    merge: (target: string, label = target) => open((close) => <MergeDialog ws={ws} close={close} target={target} label={label} />),
    rebase: async (onto: string, label = onto) => {
      if (await ui.confirm({
        title: t('리베이스'),
        message: tx('현재 브랜치 {branch}의 커밋을 {onto} 위로 다시 쌓아요. 이미 Push한 커밋이면 다시 Push할 때 강제 Push해야 해요.', { branch: <b>{curLabel}</b>, onto: <b>{label}</b> }),
        confirm: t('리베이스'),
      })) await ws.run(t('리베이스'), () => api.rebase(ws.repo, onto), t('{onto} 위로 다시 쌓았어요', { onto: label }))
    },
    interactiveRebase: (base: string, label: string) => open((close) => <RebaseDialog ws={ws} close={close} base={base} baseLabel={label} />),
    cherryPick: async (shas: string[]) => {
      if (await ui.confirm({
        title: t('체리픽'),
        message: tx('커밋 {n}개를 현재 브랜치 {branch}에 그대로 복사해 새 커밋으로 만들어요.', { n: shas.length, branch: <b>{curLabel}</b> }),
        confirm: t('체리픽'),
      })) await ws.run(t('체리픽'), () => api.cherryPick(ws.repo, shas), t('커밋 {n}개를 가져왔어요', { n: shas.length }))
    },
    revert: async (c: Commit) => {
      if (await ui.confirm({ title: t('되돌리는 커밋 만들기'), message: tx('{subject}의 변경을 거꾸로 적용한 새 커밋을 만들어요. 기록은 지워지지 않아요.', { subject: <b>{c.subject}</b> }), confirm: t('되돌리기') })) {
        await ws.run(t('되돌리기'), () => api.revert(ws.repo, c.sha), t('되돌리는 커밋을 만들었어요'))
      }
    },
    reset: (c: Commit) => open((close) => <ResetDialog ws={ws} close={close} sha={c.sha} subject={c.subject} />),
    tag: (sha: string) => open((close) => <TagDialog ws={ws} close={close} sha={sha} />),
    deleteTag: async (name: string, remote: string | null) => {
      if (await ui.confirm({ title: t('태그 지우기'), message: remote ? tx('{name} 태그를 내 저장소와 원격({remote})에서 지울까요?', { name: <b>{name}</b>, remote }) : tx('{name} 태그를 내 저장소에서 지울까요?', { name: <b>{name}</b> }), confirm: t('지우기'), danger: true })) {
        await ws.run(t('태그 지우기'), () => api.deleteTag(ws.repo, name, remote), t('태그를 지웠어요: {name}', { name }))
      }
    },
    pushTag: (name: string, remote: string) => ws.run(t('태그 Push'), () => api.push(ws.repo, { remote, branches: [`refs/tags/${name}`], tags: false, force: false, setUpstream: false }), t('태그를 Push했어요: {name}', { name })),

    // ───── 스태시 ─────
    stash: () => open((close) => <StashDialog ws={ws} close={close} />),
    stashApply: (s: Stash, pop: boolean) => ws.run(pop ? t('스태시 꺼내기') : t('스태시 적용'), () => api.stashApply(ws.repo, s.index, pop), pop ? t('스태시를 꺼냈어요') : t('스태시를 적용했어요 (목록에 남아 있어요)')),
    stashDrop: async (s: Stash) => {
      if (await ui.confirm({ title: t('스태시 지우기'), message: tx('스태시 {name}를 지울까요? 되살릴 수 없어요.', { name: <b>{s.message || `#${s.index}`}</b> }), confirm: t('지우기'), danger: true })) {
        await ws.run(t('스태시 지우기'), () => api.stashDrop(ws.repo, s.index), t('스태시를 지웠어요'))
      }
    },
    stashBranch: (s: Stash) => open((close) => <StashBranchDialog ws={ws} close={close} stash={s} />),
    showStash: (s: Stash) => open((close) => (
      <Dialog title={<>{t('스태시')} · {s.message || `#${s.index}`}</>} icon={Archive} onClose={close} width={1200} className="big-dialog"
        footer={<>
          <button type="button" className="btn" onClick={() => { close(); void a.stashApply(s, false) }}>{t('적용')}</button>
          <button type="button" className="btn primary" onClick={() => { close(); void a.stashApply(s, true) }}>{t('꺼내기')}</button>
        </>}>
        <div className="stash-detail"><CommitDetail repo={ws.repo} sha={s.sha} /></div>
      </Dialog>
    )),

    // ───── 원격 ─────
    fetch: () => open((close) => <FetchDialog ws={ws} close={close} />),
    pull: () => open((close) => <PullDialog ws={ws} close={close} />),
    push: () => open((close) => <PushDialog ws={ws} close={close} />),

    // ───── 패치·내보내기 ─────
    createPatch: (shas: string[]) => ws.run(t('패치 만들기'), () => api.createPatch(ws.repo, shas), (f) => (f ? t('패치를 저장했어요\n{file}', { file: f }) : null)),
    applyPatchFile: () => ws.run(t('패치 적용'), () => api.applyPatchFile(ws.repo), (r) => (r ? t('패치를 적용했어요') : null)),
    archive: (sha: string) => ws.run(t('내보내기'), () => api.archive(ws.repo, sha), (f) => (f ? t('압축 파일로 저장했어요\n{file}', { file: f }) : null)),

    // ───── 진행 중인 작업 ─────
    continueOp: () => ws.run(t('계속'), () => api.continueOperation(ws.repo), t('작업을 마쳤어요')),
    skipOp: () => ws.run(t('건너뛰기'), () => api.skipOperation(ws.repo), t('이 커밋을 건너뛰었어요')),
    abortOp: async () => {
      if (await ui.confirm({ title: t('작업 중단'), message: t('진행 중인 작업을 멈추고 시작하기 전 상태로 되돌릴까요? 충돌을 해결하던 내용은 사라져요.'), confirm: t('중단'), danger: true })) {
        await ws.run(t('중단'), () => api.abortOperation(ws.repo), t('작업을 중단하고 되돌렸어요'))
      }
    },

    // ───── 창·설정 ─────
    flow: () => open((close) => <FlowDialog ws={ws} close={close} />),
    repoSettings: (tab?: RepoTab) => open((close) => <RepoSettingsDialog ws={ws} close={close} tab={tab} />),
    appSettings: () => ui.open((close) => <AppSettingsDialog close={close} />),
    fileHistory: (path: string) => open((close) => <FileHistoryDialog ws={ws} close={close} path={path} openBlame={(rev) => a.blame(path, rev)} />),
    blame: (path: string, rev: string | null) => open((close) => <BlameDialog ws={ws} close={close} path={path} rev={rev} />),
    openTerminal: () => void api.openTerminal(ws.repo).catch((e) => ui.notify(errorText(e), 'error')),
    showInFolder: (path: string | null = null) => void api.showInFolder(ws.repo, path).catch((e) => ui.notify(errorText(e), 'error')),
    openFile: (path: string) => void api.openFile(ws.repo, path).catch((e) => ui.notify(errorText(e), 'error')),
    copy,
    openUrl,
  }

  // ───── 오른쪽 클릭 메뉴 ─────

  const branchMenu = (b: Branch): MenuItem[] => {
    const w = web(b.upstream ? remoteOf(ws.remotes, b.upstream)?.name : null)
    return [
      { section: b.name },
      !b.current && { label: t('체크아웃'), icon: GitBranch, onClick: () => void a.checkout(b.name), hint: t('더블클릭') },
      !b.current && { label: t('{branch}에 병합…', { branch: curLabel }), icon: GitMerge, onClick: () => a.merge(b.name) },
      !b.current && { label: t('{branch}을(를) 이 위로 리베이스', { branch: curLabel }), icon: ListRestart, onClick: () => void a.rebase(b.name) },
      'sep',
      { label: t('여기서 새 브랜치…'), icon: GitBranchPlus, onClick: () => a.newBranch({ ref: b.name, label: b.name }) },
      { label: t('이름 바꾸기…'), icon: PencilLine, onClick: () => a.renameBranch(b.name) },
      b.upstream
        ? { label: t('추적 해제 ({upstream})', { upstream: b.upstream }), icon: Unlink, onClick: () => void a.unsetUpstream(b.name) }
        : { label: t('추적할 원격 브랜치 정하기…'), icon: Link2, onClick: () => a.setUpstream(b.name) },
      'sep',
      { label: t('원격에 Push'), icon: ArrowUpFromLine, onClick: () => a.pushBranch(b), disabled: ws.remotes.length === 0 },
      w && { label: t('풀 리퀘스트 만들기'), icon: GitPullRequestArrow, onClick: () => a.pullRequest(b) },
      w && b.upstream && { label: t('웹에서 보기'), icon: ExternalLink, onClick: () => openUrl(branchUrl(w, b.upstream!.slice(b.upstream!.indexOf('/') + 1))) },
      { label: t('브랜치 이름 복사'), icon: Copy, onClick: () => copy(b.name, t('브랜치 이름')) },
      'sep',
      !b.current && { label: t('지우기…'), icon: Trash2, danger: true, onClick: () => a.deleteBranch(b) },
    ]
  }

  const remoteBranchMenu = (rb: string): MenuItem[] => {
    const remote = remoteOf(ws.remotes, rb)
    const w = remote ? webRepo(remote.fetchUrl) : null
    return [
      { section: rb },
      { label: t('체크아웃…'), icon: GitBranch, onClick: () => a.checkoutRemote(rb), hint: t('더블클릭') },
      { label: t('{branch}에 병합…', { branch: curLabel }), icon: GitMerge, onClick: () => a.merge(rb) },
      { label: t('{branch}을(를) 이 위로 리베이스', { branch: curLabel }), icon: ListRestart, onClick: () => void a.rebase(rb) },
      'sep',
      { label: t('여기서 새 브랜치…'), icon: GitBranchPlus, onClick: () => a.newBranch({ ref: rb, label: rb }) },
      cur && { label: t('{branch}이(가) 이 브랜치를 추적하게', { branch: cur }), icon: Link2, onClick: () => void ws.run(t('추적 정하기'), () => api.setUpstream(ws.repo, cur, rb), `${cur} → ${rb}`) },
      w && remote && { label: t('웹에서 보기'), icon: ExternalLink, onClick: () => openUrl(branchUrl(w, rb.slice(remote.name.length + 1))) },
      'sep',
      { label: t('원격에서 지우기…'), icon: Trash2, danger: true, onClick: () => void a.deleteRemoteBranch(rb) },
    ]
  }

  const tagMenu = (tag: { name: string; sha: string }): MenuItem[] => [
    { section: tag.name },
    { label: t('히스토리에서 보기'), icon: Eye, onClick: () => ws.focusCommit(tag.sha) },
    { label: t('여기서 새 브랜치…'), icon: GitBranchPlus, onClick: () => a.newBranch({ ref: tag.name, label: t('태그 {name}', { name: tag.name }) }) },
    { label: t('체크아웃 (HEAD 분리)'), icon: GitBranch, onClick: () => void a.checkoutCommit(tag.sha) },
    'sep',
    ...ws.remotes.map((r): MenuItem => ({ label: t('{remote}에 Push', { remote: r.name }), icon: Upload, onClick: () => void a.pushTag(tag.name, r.name) })),
    'sep',
    { label: t('지우기…'), icon: Trash2, danger: true, onClick: () => void a.deleteTag(tag.name, null) },
    ...ws.remotes.map((r): MenuItem => ({ label: t('내 저장소와 {remote}에서 지우기…', { remote: r.name }), icon: CircleX, danger: true, onClick: () => void a.deleteTag(tag.name, r.name) })),
  ]

  const stashMenu = (s: Stash): MenuItem[] => [
    { section: s.message || t('스태시 #{n}', { n: s.index }) },
    { label: t('내용 보기'), icon: Eye, onClick: () => a.showStash(s), hint: t('클릭') },
    { label: t('꺼내기 (적용하고 목록에서 빼기)'), icon: ArchiveRestore, onClick: () => void a.stashApply(s, true) },
    { label: t('적용 (목록에 남겨 두기)'), icon: Download, onClick: () => void a.stashApply(s, false) },
    { label: t('새 브랜치로 꺼내기…'), icon: GitBranchPlus, onClick: () => a.stashBranch(s) },
    'sep',
    { label: t('지우기…'), icon: Trash2, danger: true, onClick: () => void a.stashDrop(s) },
  ]

  /** selected: 히스토리에서 고른 커밋들(화면 순서 = 최신 먼저) */
  const commitMenu = (c: Commit, selected: Commit[], compare: (a: string, b: string) => void): MenuItem[] => {
    const many = selected.length > 1 && selected.some((s) => s.sha === c.sha)
    const picks = many ? [...selected].reverse() : [c] // 오래된 것부터
    const isHead = c.refs.some((r) => r.kind === 'head')
    const w = web()
    const localHere = c.refs.filter((r) => r.kind === 'branch')
    return [
      { section: many ? t('커밋 {n}개 선택', { n: selected.length }) : `${short(c.sha)} ${c.subject}` },
      ...localHere.map((r): MenuItem => ({ label: t('체크아웃: {name}', { name: r.name }), icon: GitBranch, onClick: () => void a.checkout(r.name) })),
      !many && { label: t('이 커밋 체크아웃 (HEAD 분리)'), icon: GitBranch, onClick: () => void a.checkoutCommit(c.sha) },
      'sep',
      !many && { label: t('여기서 새 브랜치…'), icon: GitBranchPlus, onClick: () => a.newBranch({ ref: c.sha, label: `${short(c.sha)} ${c.subject}` }) },
      !many && { label: t('태그 만들기…'), icon: Tag, onClick: () => a.tag(c.sha) },
      'sep',
      !many && !isHead && { label: t('{branch}에 병합…', { branch: curLabel }), icon: GitMerge, onClick: () => a.merge(c.sha, `${short(c.sha)} ${c.subject}`) },
      !many && !isHead && { label: t('{branch}을(를) 이 커밋 위로 리베이스', { branch: curLabel }), icon: ListRestart, onClick: () => void a.rebase(c.sha, short(c.sha)) },
      !many && { label: t('이 커밋 다음부터 대화형 리베이스…'), icon: ListRestart, onClick: () => a.interactiveRebase(c.sha, `${short(c.sha)} ${c.subject}`) },
      'sep',
      !isHead && { label: many ? t('체리픽 ({n}개)', { n: picks.length }) : t('체리픽 (현재 브랜치로 복사)'), icon: Cherry, onClick: () => void a.cherryPick(picks.map((p) => p.sha)) },
      !many && { label: t('되돌리는 커밋 만들기 (revert)'), icon: Undo2, onClick: () => void a.revert(c) },
      !many && { label: t('{branch}을(를) 여기로 리셋…', { branch: curLabel }), icon: RotateCcw, onClick: () => a.reset(c) },
      'sep',
      selected.length === 2 && { label: t('고른 두 커밋 비교'), icon: GitCompareArrows, onClick: () => compare(selected[1].sha, selected[0].sha) },
      !many && { label: t('현재 HEAD와 비교'), icon: GitCompareArrows, onClick: () => compare(c.sha, 'HEAD'), disabled: isHead },
      { label: many ? t('패치로 저장 ({n}개)…', { n: picks.length }) : t('패치로 저장…'), icon: FileDown, onClick: () => void a.createPatch(picks.map((p) => p.sha)) },
      !many && { label: t('압축 파일(zip)로 내보내기…'), icon: Archive, onClick: () => void a.archive(c.sha) },
      'sep',
      { label: t('커밋 번호 복사'), icon: Copy, onClick: () => copy(many ? picks.map((p) => p.sha).join('\n') : c.sha, t('커밋 번호')) },
      !many && { label: t('메시지 복사'), icon: Copy, onClick: () => copy(c.subject, t('메시지')) },
      !many && w && { label: t('웹에서 보기'), icon: ExternalLink, onClick: () => openUrl(commitUrl(w, c.sha)) },
    ]
  }

  return { ...a, branchMenu, remoteBranchMenu, tagMenu, stashMenu, commitMenu }
}

function UpstreamDialog({ ws, close, branch }: { ws: Ws; close: () => void; branch: string }) {
  const options = (ws.branches?.remote ?? []).map((r) => r.name)
  const [value, setValue] = useState(options.find((o) => o.endsWith('/' + branch)) ?? options[0] ?? '')
  return (
    <Dialog title={t('추적할 원격 브랜치')} icon={Link2} onClose={close} submitLabel={t('정하기')} disabled={!value}
      onSubmit={async () => {
        if (await ws.run(t('추적 정하기'), () => api.setUpstream(ws.repo, branch, value), `${branch} → ${value}`)) close()
      }}>
      <p className="muted">{tx('{branch}이(가) Pull·Push에 쓸 원격 브랜치를 골라요.', { branch: <b>{branch}</b> })}</p>
      <Field label={t('원격 브랜치')}>
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </Field>
      {options.length === 0 && <p className="muted small">{t('원격 브랜치가 없어요. 먼저 Fetch하거나 이 브랜치를 Push하세요.')}</p>}
    </Dialog>
  )
}
