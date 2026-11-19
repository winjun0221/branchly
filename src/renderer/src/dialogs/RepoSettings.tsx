// 저장소 설정: 원격 · 사용자 정보 · .gitignore · Git LFS · 서브모듈
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, Check as CheckIcon, Cloud, FileX2, HardDrive, Pencil, Plus, RefreshCw, Settings2, Trash2, UserRound, X } from 'lucide-react'
import type { Remote } from '../../../shared/types'
import { api, errorText, useRemotes, useSubmodules } from '../api'
import { Dialog, Field, Tabs } from '../components/Dialog'
import { t, tx } from '../i18n'
import { useUi } from '../ui'
import { lastLines, type Ws } from '../ws'

export type RepoTab = 'remotes' | 'identity' | 'ignore' | 'lfs' | 'submodules'

export function RepoSettingsDialog({ ws, close, tab: initial = 'remotes' }: { ws: Ws; close: () => void; tab?: RepoTab }) {
  const [tab, setTab] = useState<RepoTab>(initial)
  return (
    <Dialog title={t('저장소 설정 · {name}', { name: ws.info.name })} icon={Settings2} onClose={close} width={720} className="settings-dialog">
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'remotes', label: t('원격|section'), icon: Cloud },
        { value: 'identity', label: t('사용자 정보'), icon: UserRound },
        { value: 'ignore', label: t('무시할 파일'), icon: FileX2 },
        { value: 'lfs', label: t('큰 파일(LFS)'), icon: HardDrive },
        { value: 'submodules', label: t('서브모듈'), icon: Boxes },
      ]} />
      <div className="settings-pane">
        {tab === 'remotes' && <RemotesTab ws={ws} />}
        {tab === 'identity' && <IdentityTab ws={ws} />}
        {tab === 'ignore' && <IgnoreTab ws={ws} />}
        {tab === 'lfs' && <LfsTab ws={ws} />}
        {tab === 'submodules' && <SubmodulesTab ws={ws} />}
      </div>
    </Dialog>
  )
}

function RemotesTab({ ws }: { ws: Ws }) {
  const remotes = useRemotes(ws.repo)
  const [name, setName] = useState(remotes.data?.length ? '' : 'origin')
  const [url, setUrl] = useState('')
  const add = async () => {
    if (await ws.run(t('원격 추가'), () => api.remoteAdd(ws.repo, name.trim(), url.trim()), t('원격을 추가했어요: {name}', { name: name.trim() }))) {
      setName('')
      setUrl('')
    }
  }
  return (
    <>
      <div className="setting-list">
        {remotes.data?.map((r) => <RemoteRow key={r.name} ws={ws} remote={r} />)}
        {remotes.data?.length === 0 && <p className="muted">{t('아직 원격 저장소가 없어요.')}</p>}
      </div>
      <div className="add-row">
        <input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder={t('이름 (origin)')} style={{ width: 140 }} />
        <input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder={t('https://github.com/me/repo.git 또는 git@github.com:me/repo.git')} className="grow"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} />
        <button type="button" className="btn" disabled={!name.trim() || !url.trim()} onClick={add}><Plus />{t('추가')}</button>
      </div>
    </>
  )
}

function RemoteRow({ ws, remote }: { ws: Ws; remote: Remote }) {
  const ui = useUi()
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(remote.name)
  const [url, setUrl] = useState(remote.fetchUrl)
  const save = async () => {
    let ok = true
    if (url.trim() !== remote.fetchUrl) ok = await ws.run(t('주소 바꾸기'), () => api.remoteSetUrl(ws.repo, remote.name, url.trim()))
    if (ok && name.trim() !== remote.name) ok = await ws.run(t('원격 이름 바꾸기'), () => api.remoteRename(ws.repo, remote.name, name.trim()))
    if (ok) setEdit(false)
  }
  if (edit) {
    return (
      <div className="setting-row editing">
        <input value={name} onChange={(e) => setName(e.target.value.trim())} style={{ width: 130 }} />
        <input value={url} onChange={(e) => setUrl(e.target.value.trim())} className="grow" />
        <button type="button" className="icon-btn" onClick={save} aria-label={t('저장')}><CheckIcon /></button>
        <button type="button" className="icon-btn" onClick={() => setEdit(false)} aria-label={t('취소')}><X /></button>
      </div>
    )
  }
  return (
    <div className="setting-row">
      <Cloud />
      <b>{remote.name}</b>
      <span className="mono small grow ellipsis" title={remote.fetchUrl}>{remote.fetchUrl}{remote.pushUrl !== remote.fetchUrl && <span className="muted"> {t('(Push: {url})', { url: remote.pushUrl })}</span>}</span>
      <button type="button" className="icon-btn" onClick={() => setEdit(true)} aria-label={t('고치기')} title={t('고치기')}><Pencil /></button>
      <button type="button" className="icon-btn" aria-label={t('지우기')} title={t('지우기')} onClick={async () => {
        if (await ui.confirm({ title: t('원격 지우기'), message: tx('{name} 원격과 그 원격 브랜치 정보를 지울까요? 원격 저장소 자체는 그대로예요.', { name: <b>{remote.name}</b> }), confirm: t('지우기'), danger: true })) {
          await ws.run(t('원격 지우기'), () => api.remoteRemove(ws.repo, remote.name), t('원격을 지웠어요: {name}', { name: remote.name }))
        }
      }}><Trash2 /></button>
    </div>
  )
}

function IdentityTab({ ws }: { ws: Ws }) {
  const local = useQuery({ queryKey: ['identity', ws.repo], queryFn: () => api.identity(ws.repo) })
  const global = useQuery({ queryKey: ['identity', null], queryFn: () => api.identity(null) })
  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const n = name ?? local.data?.name ?? ''
  const e = email ?? local.data?.email ?? ''
  return (
    <>
      <p className="muted">{t('이 저장소에서 만드는 커밋에만 쓸 이름·이메일이에요. 비우면 전역 설정(앱 설정)을 써요.')}</p>
      <div className="grid2">
        <Field label={t('이름')}><input value={n} onChange={(ev) => setName(ev.target.value)} placeholder={global.data?.name || t('전역 이름')} /></Field>
        <Field label={t('이메일')}><input value={e} onChange={(ev) => setEmail(ev.target.value)} placeholder={global.data?.email || t('전역 이메일')} /></Field>
      </div>
      <div className="row end">
        <button type="button" className="btn primary" onClick={async () => {
          await ws.run(t('사용자 정보 저장'), () => api.setIdentity(ws.repo, { name: n, email: e }), t('이 저장소의 사용자 정보를 저장했어요'))
          void local.refetch()
        }}>{t('저장')}</button>
      </div>
    </>
  )
}

const IGNORE_PRESETS = ['node_modules/', 'dist/', 'build/', '.env', '*.log', '.DS_Store', 'Thumbs.db', '.vscode/', '.idea/', '*.tmp']

function IgnoreTab({ ws }: { ws: Ws }) {
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  useEffect(() => {
    void api.readGitignore(ws.repo).then((t) => {
      setText(t)
      setSaved(t)
    })
  }, [ws.repo])
  if (text === null) return <p className="muted">{t('불러오는 중…')}</p>
  const lines = text.split(/\r?\n/)
  return (
    <>
      <p className="muted">{tx('여기 적은 파일·폴더는 변경 사항에 나오지 않아요. 한 줄에 하나씩, {star}는 아무 글자.', { star: <span className="mono">*</span> })}</p>
      <div className="chips">
        {IGNORE_PRESETS.map((p) => (
          <button key={p} type="button" className={`chip ${lines.includes(p) ? 'on' : ''}`} disabled={lines.includes(p)}
            onClick={() => setText((t) => (t && !t.endsWith('\n') ? t + '\n' : t ?? '') + p + '\n')}>+ {p}</button>
        ))}
      </div>
      <textarea className="code-edit" rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="row end">
        <button type="button" className="btn primary" disabled={text === saved} onClick={async () => {
          if (await ws.run(t('.gitignore 저장'), () => api.writeGitignore(ws.repo, text), t('.gitignore를 저장했어요'))) setSaved(text)
        }}>{t('저장')}</button>
      </div>
    </>
  )
}

function LfsTab({ ws }: { ws: Ws }) {
  const lfs = useQuery({ queryKey: ['lfs', ws.repo], queryFn: () => api.lfsInfo(ws.repo) })
  const [pattern, setPattern] = useState('')
  if (lfs.isPending) return <p className="muted">{t('확인하는 중…')}</p>
  if (lfs.error) return <p className="error">{errorText(lfs.error)}</p>
  if (!lfs.data.installed) {
    return <p className="muted">{t('Git LFS가 설치돼 있지 않아요. Git for Windows 설치 때 같이 고르거나 git-lfs를 설치한 뒤 다시 열어 주세요.')}</p>
  }
  const track = async (p: string, on: boolean) => {
    await ws.run(on ? t('LFS 추적') : t('LFS 추적 해제'), () => api.lfsTrack(ws.repo, p, on), on ? t('{pattern}를 LFS로 관리해요 (.gitattributes를 커밋하세요)', { pattern: p }) : t('{pattern} LFS 추적을 껐어요', { pattern: p }))
    void lfs.refetch()
  }
  return (
    <>
      <p className="muted">{tx('이미지·영상·디자인 파일처럼 큰 파일은 LFS로 관리하면 저장소가 가벼워져요. 규칙은 {file}에 저장돼요.', { file: <span className="mono">.gitattributes</span> })}</p>
      <div className="setting-list">
        {lfs.data.patterns.map((p) => (
          <div key={p} className="setting-row">
            <HardDrive /><span className="mono grow">{p}</span>
            <button type="button" className="icon-btn" onClick={() => track(p, false)} aria-label={t('추적 해제')} title={t('추적 해제')}><Trash2 /></button>
          </div>
        ))}
        {lfs.data.patterns.length === 0 && <p className="muted">{t('LFS로 관리하는 파일 규칙이 없어요.')}</p>}
      </div>
      <div className="add-row">
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="*.psd" className="grow"
          onKeyDown={(e) => { if (e.key === 'Enter' && pattern.trim()) { e.preventDefault(); void track(pattern.trim(), true).then(() => setPattern('')) } }} />
        <button type="button" className="btn" disabled={!pattern.trim()} onClick={() => track(pattern.trim(), true).then(() => setPattern(''))}><Plus />{t('추가')}</button>
      </div>
    </>
  )
}

function SubmodulesTab({ ws }: { ws: Ws }) {
  const subs = useSubmodules(ws.repo)
  const [url, setUrl] = useState('')
  const [path, setPath] = useState('')
  const STATE = { ok: t('최신'), uninitialized: t('받지 않음'), modified: t('다른 커밋'), conflict: t('충돌') } as const
  return (
    <>
      <div className="setting-list">
        {subs.data?.map((s) => (
          <div key={s.path} className="setting-row">
            <Boxes /><b className="grow ellipsis">{s.path}</b>
            <span className="mono muted small">{s.sha.slice(0, 7)}</span>
            <span className={`pill s-${s.state}`}>{STATE[s.state]}</span>
            <button type="button" className="icon-btn" title={t('받기·업데이트')} aria-label={t('업데이트')}
              onClick={() => ws.run(t('서브모듈 업데이트'), () => api.submoduleUpdate(ws.repo, s.path), (o) => t('서브모듈을 업데이트했어요') + (o ? '\n' + lastLines(o) : ''))}><RefreshCw /></button>
          </div>
        ))}
        {subs.data?.length === 0 && <p className="muted">{t('서브모듈이 없어요.')}</p>}
      </div>
      {!!subs.data?.length && (
        <div className="row end">
          <button type="button" className="btn" onClick={() => ws.run(t('서브모듈 업데이트'), () => api.submoduleUpdate(ws.repo, null), t('모든 서브모듈을 업데이트했어요'))}><RefreshCw />{t('모두 받기·업데이트')}</button>
        </div>
      )}
      <div className="add-row">
        <input value={url} onChange={(e) => {
          setUrl(e.target.value.trim())
          if (!path) setPath('')
        }} placeholder={t('서브모듈 저장소 주소')} className="grow" />
        <input value={path} onChange={(e) => setPath(e.target.value.trim())} placeholder={t('넣을 폴더 (libs/{name})', { name: url.split('/').pop()?.replace(/\.git$/, '') || t('이름') })} style={{ width: 200 }} />
        <button type="button" className="btn" disabled={!url} onClick={async () => {
          const p = path || 'libs/' + (url.split('/').pop()?.replace(/\.git$/, '') ?? 'sub')
          if (await ws.run(t('서브모듈 추가'), () => api.submoduleAdd(ws.repo, url, p), t('서브모듈을 추가했어요: {path}', { path: p }))) {
            setUrl('')
            setPath('')
          }
        }}><Plus />{t('추가')}</button>
      </div>
    </>
  )
}
