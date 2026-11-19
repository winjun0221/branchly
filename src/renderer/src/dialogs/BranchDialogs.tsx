// 브랜치·병합·리셋·태그·스태시 대화 상자. 열 때 넘겨받은 ws(작업 공간)로 실행한다.
import { useState } from 'react'
import { Archive, GitBranch, GitBranchPlus, GitMerge, PencilLine, RotateCcw, Tag, Trash2 } from 'lucide-react'
import type { Branch, Stash } from '../../../shared/types'
import { api } from '../api'
import { Check, Choice, Dialog, Field } from '../components/Dialog'
import { t, tx } from '../i18n'
import { short, type Ws } from '../ws'

type P = { ws: Ws; close: () => void }

const currentName = (ws: Ws) => (ws.status?.detached ? t('HEAD(분리됨)') : ws.status?.branch ?? 'HEAD')

export function CreateBranchDialog({ ws, close, start }: P & { start?: { ref: string; label: string } }) {
  const [name, setName] = useState('')
  const [checkout, setCheckout] = useState(true)
  const n = name.trim()
  return (
    <Dialog title={t('새 브랜치')} icon={GitBranchPlus} onClose={close} submitLabel={t('만들기')} disabled={!n}
      onSubmit={async () => {
        if (await ws.run(t('브랜치 만들기'), () => api.createBranch(ws.repo, n, start?.ref ?? null, checkout), t('브랜치를 만들었어요: {name}', { name: n }))) close()
      }}>
      <Field label={t('브랜치 이름')} hint={t('예: feature/login, fix/123-crash')}>
        <input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} placeholder={t('feature/새-기능')} />
      </Field>
      <Field label={t('시작 위치')}>
        <div className="readonly">{start ? start.label : t('현재 위치 · {name}', { name: currentName(ws) })}</div>
      </Field>
      <Check checked={checkout} onChange={setCheckout}>{t('만든 뒤 바로 이 브랜치로 바꾸기(체크아웃)')}</Check>
    </Dialog>
  )
}

export function RenameBranchDialog({ ws, close, name }: P & { name: string }) {
  const [to, setTo] = useState(name)
  const next = to.trim()
  return (
    <Dialog title={t('브랜치 이름 바꾸기')} icon={PencilLine} onClose={close} submitLabel={t('바꾸기')} disabled={!next || next === name}
      onSubmit={async () => {
        if (await ws.run(t('이름 바꾸기'), () => api.renameBranch(ws.repo, name, next), t('이름을 바꿨어요: {from} → {to}', { from: name, to: next }))) close()
      }}>
      <Field label={t('새 이름')}><input value={to} onChange={(e) => setTo(e.target.value.replace(/\s/g, '-'))} /></Field>
      <p className="muted small">{t('원격 브랜치 이름은 바뀌지 않아요. 바꾼 이름으로 다시 올린 뒤 예전 원격 브랜치를 지우세요.')}</p>
    </Dialog>
  )
}

export function DeleteBranchDialog({ ws, close, branch }: P & { branch: Branch }) {
  const [force, setForce] = useState(false)
  const [remote, setRemote] = useState(false)
  return (
    <Dialog title={t('브랜치 지우기')} icon={Trash2} danger onClose={close} submitLabel={t('지우기')}
      onSubmit={async () => {
        if (await ws.run(t('브랜치 지우기'), () => api.deleteBranch(ws.repo, branch.name, force, remote), t('브랜치를 지웠어요: {name}', { name: branch.name }))) close()
      }}>
      <p>{tx('{name} 브랜치를 지울까요?', { name: <b>{branch.name}</b> })}</p>
      <Check checked={force} onChange={setForce}>{t('병합하지 않은 커밋이 있어도 지우기 (그 커밋은 브랜치에서 사라져요)')}</Check>
      {branch.upstream && <Check checked={remote} onChange={setRemote}>{tx('원격 브랜치 {name}도 지우기', { name: <b>{branch.upstream}</b> })}</Check>}
    </Dialog>
  )
}

export function MergeDialog({ ws, close, target, label }: P & { target: string; label: string }) {
  const [mode, setMode] = useState<'default' | 'noff' | 'squash'>('default')
  const [message, setMessage] = useState('')
  return (
    <Dialog title={t('병합')} icon={GitMerge} onClose={close} submitLabel={t('병합')}
      onSubmit={async () => {
        const ok = await ws.run(t('병합'), () => api.merge(ws.repo, target, { noFF: mode === 'noff', squash: mode === 'squash', message }),
          mode === 'squash' ? t('변경을 하나로 모아 스테이지에 올렸어요. 메시지를 써서 커밋하세요.') : t('병합했어요: {name}', { name: label }))
        if (ok) {
          close()
          if (mode === 'squash') ws.setView('changes')
        }
      }}>
      <p>{tx('{label}을(를) 현재 브랜치 {branch}에 합칩니다.', { label: <b>{label}</b>, branch: <b>{currentName(ws)}</b> })}</p>
      <Choice value={mode} onChange={setMode} options={[
        { value: 'default', label: t('기본'), desc: t('앞으로 감기(fast-forward)만으로 되면 커밋을 만들지 않아요') },
        { value: 'noff', label: t('항상 병합 커밋 만들기'), desc: t('--no-ff · 브랜치를 합친 기록이 그래프에 남아요') },
        { value: 'squash', label: t('하나로 합쳐 스테이지에 올리기'), desc: t('--squash · 커밋은 직접 만들어요') },
      ]} />
      {mode !== 'squash' && (
        <Field label={t('병합 메시지 (비우면 기본 메시지)')}>
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Merge ${label}`} />
        </Field>
      )}
    </Dialog>
  )
}

export function ResetDialog({ ws, close, sha, subject }: P & { sha: string; subject: string }) {
  const [mode, setMode] = useState<'soft' | 'mixed' | 'hard'>('mixed')
  return (
    <Dialog title={t('현재 브랜치를 이 커밋으로 되돌리기')} icon={RotateCcw} danger={mode === 'hard'} onClose={close} submitLabel={t('되돌리기|reset')} width={560}
      onSubmit={async () => {
        if (await ws.run(t('리셋'), () => api.reset(ws.repo, sha, mode), t('{branch}을(를) {sha}(으)로 되돌렸어요', { branch: currentName(ws), sha: short(sha) }))) close()
      }}>
      <p><b>{currentName(ws)}</b> → <span className="mono">{short(sha)}</span> {subject}</p>
      <Choice value={mode} onChange={setMode} options={[
        { value: 'soft', label: t('소프트'), desc: t('커밋만 되돌리고, 바뀐 내용은 스테이지에 남겨요') },
        { value: 'mixed', label: t('혼합 (기본)'), desc: t('커밋과 스테이지를 되돌리고, 바뀐 내용은 작업 폴더에 남겨요') },
        { value: 'hard', label: t('하드'), desc: t('작업 폴더까지 이 커밋과 똑같이. 커밋하지 않은 변경은 모두 사라져요'), danger: true },
      ]} />
    </Dialog>
  )
}

export function TagDialog({ ws, close, sha }: P & { sha: string }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [push, setPush] = useState(false)
  const [remote, setRemote] = useState(ws.remotes[0]?.name ?? '')
  const n = name.trim()
  return (
    <Dialog title={t('태그 만들기')} icon={Tag} onClose={close} submitLabel={t('만들기')} disabled={!n}
      onSubmit={async () => {
        if (await ws.run(t('태그 만들기'), () => api.createTag(ws.repo, n, sha, message, push && remote ? remote : null), t('태그를 만들었어요: {name}', { name: n }))) close()
      }}>
      <Field label={t('태그 이름')} hint={tx('커밋 {sha}에 붙여요', { sha: <span className="mono">{short(sha)}</span> })}>
        <input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} placeholder="v1.0.0" />
      </Field>
      <Field label={t('메시지 (쓰면 주석 태그, 비우면 가벼운 태그)')}>
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      {ws.remotes.length > 0 && (
        <div className="row">
          <Check checked={push} onChange={setPush}>{t('만든 뒤 원격에 Push')}</Check>
          <select value={remote} onChange={(e) => setRemote(e.target.value)} disabled={!push}>
            {ws.remotes.map((r) => <option key={r.name}>{r.name}</option>)}
          </select>
        </div>
      )}
    </Dialog>
  )
}

export function CheckoutRemoteDialog({ ws, close, remoteBranch }: P & { remoteBranch: string }) {
  const remote = ws.remotes.filter((r) => remoteBranch.startsWith(r.name + '/')).sort((a, b) => b.name.length - a.name.length)[0]
  const [name, setName] = useState(remote ? remoteBranch.slice(remote.name.length + 1) : remoteBranch)
  const n = name.trim()
  const exists = ws.branches?.local.some((b) => b.name === n)
  return (
    <Dialog title={t('원격 브랜치 체크아웃')} icon={GitBranch} onClose={close} submitLabel={exists ? t('기존 브랜치로 바꾸기') : t('만들고 체크아웃')} disabled={!n}
      onSubmit={async () => {
        const ok = exists
          ? await ws.run(t('체크아웃'), () => api.checkout(ws.repo, n), t('브랜치를 바꿨어요: {name}', { name: n }))
          : await ws.run(t('체크아웃'), () => api.checkoutRemote(ws.repo, remoteBranch, n), t('{remote}을(를) 추적하는 {name} 브랜치를 만들었어요', { remote: remoteBranch, name: n }))
        if (ok) close()
      }}>
      <p>{tx('{remote}을(를) 추적하는 로컬 브랜치를 만들어요.', { remote: <b>{remoteBranch}</b> })}</p>
      <Field label={t('로컬 브랜치 이름')} hint={exists ? t('같은 이름의 로컬 브랜치가 이미 있어요. 그 브랜치로 바꿔요.') : undefined}>
        <input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} />
      </Field>
    </Dialog>
  )
}

export function StashDialog({ ws, close }: P) {
  const [message, setMessage] = useState('')
  const [keepIndex, setKeepIndex] = useState(false)
  const [untracked, setUntracked] = useState(true)
  return (
    <Dialog title={t('변경 사항 잠시 넣어 두기 (스태시)')} icon={Archive} onClose={close} submitLabel={t('넣어 두기')}
      onSubmit={async () => {
        if (await ws.run(t('스태시'), () => api.stashSave(ws.repo, message, keepIndex, untracked), t('변경 사항을 스태시에 넣어 뒀어요'))) close()
      }}>
      <p className="muted">{t('커밋하지 않은 변경을 따로 보관하고 작업 사본을 깨끗하게 만들어요. 나중에 사이드바 스태시에서 다시 꺼낼 수 있어요.')}</p>
      <Field label={t('메모 (선택)')}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('로그인 화면 작업 중')} /></Field>
      <Check checked={untracked} onChange={setUntracked}>{t('새 파일(추적 안 하는 파일)도 넣기')}</Check>
      <Check checked={keepIndex} onChange={setKeepIndex}>{t('스테이지된 변경은 작업 사본에도 남겨 두기')}</Check>
    </Dialog>
  )
}

export function StashBranchDialog({ ws, close, stash }: P & { stash: Stash }) {
  const [name, setName] = useState('')
  const n = name.trim()
  return (
    <Dialog title={t('스태시로 새 브랜치')} icon={GitBranchPlus} onClose={close} submitLabel={t('만들기')} disabled={!n}
      onSubmit={async () => {
        if (await ws.run(t('스태시 브랜치'), () => api.stashBranch(ws.repo, stash.index, n), t('브랜치 {name}에 스태시를 꺼냈어요', { name: n }))) close()
      }}>
      <p className="muted">{t('스태시를 만든 커밋에서 새 브랜치를 만들고 그 위에 스태시를 꺼내요(꺼낸 스태시는 목록에서 빠져요).')}</p>
      <Field label={t('브랜치 이름')}><input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} /></Field>
    </Dialog>
  )
}
