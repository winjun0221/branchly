// 가져오기·당겨오기·올리기 대화 상자. 마지막 선택(가지치기·리베이스 등)은 기억해 둔다
import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CloudDownload } from 'lucide-react'
import { api } from '../api'
import { Check, Dialog, Field } from '../components/Dialog'
import { t, tx } from '../i18n'
import { lastLines, remoteOf, type Ws } from '../ws'

type P = { ws: Ws; close: () => void }

function remembered<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('branchly.' + key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function remember(key: string, v: unknown) {
  try {
    localStorage.setItem('branchly.' + key, JSON.stringify(v))
  } catch {
    // 기억 못 해도 그만
  }
}

const ALL = '*'

export function FetchDialog({ ws, close }: P) {
  const [remote, setRemote] = useState(ALL)
  const [prune, setPrune] = useState(() => remembered('fetch.prune', true))
  const [tags, setTags] = useState(() => remembered('fetch.tags', true))
  return (
    <Dialog title={t('Fetch')} icon={CloudDownload} onClose={close} submitLabel={t('Fetch')}
      onSubmit={async () => {
        remember('fetch.prune', prune)
        remember('fetch.tags', tags)
        const ok = await ws.run(t('Fetch'), () => api.fetch(ws.repo, { remote: remote === ALL ? null : remote, prune, tags }),
          (out) => t('원격 정보를 Fetch했어요') + (out ? '\n' + lastLines(out) : ''))
        if (ok) close()
      }}>
      <p className="muted">{t('원격 저장소의 새 커밋·브랜치·태그 정보만 받아요. 작업 중인 파일은 바뀌지 않아요.')}</p>
      <Field label={t('원격')}>
        <select value={remote} onChange={(e) => setRemote(e.target.value)}>
          <option value={ALL}>{t('모든 원격')}</option>
          {ws.remotes.map((r) => <option key={r.name}>{r.name}</option>)}
        </select>
      </Field>
      <Check checked={prune} onChange={setPrune}>{t('원격에서 지워진 브랜치는 목록에서도 지우기 (prune)')}</Check>
      <Check checked={tags} onChange={setTags}>{t('모든 태그 받기')}</Check>
    </Dialog>
  )
}

export function PullDialog({ ws, close }: P) {
  const up = ws.status?.upstream ?? null
  const upRemote = up ? remoteOf(ws.remotes, up) : null
  const [remote, setRemote] = useState(upRemote?.name ?? ws.remotes[0]?.name ?? '')
  const branches = useMemo(
    () => (ws.branches?.remote ?? []).filter((b) => b.name.startsWith(remote + '/')).map((b) => b.name.slice(remote.length + 1)),
    [ws.branches, remote],
  )
  const [branch, setBranch] = useState(up && upRemote ? up.slice(upRemote.name.length + 1) : '')
  const [rebase, setRebase] = useState(() => remembered('pull.rebase', false))
  const useDefault = !!up && remote === upRemote?.name && branch === up.slice((upRemote?.name.length ?? 0) + 1)
  return (
    <Dialog title={t('Pull')} icon={ArrowDownToLine} onClose={close} submitLabel={t('Pull')} disabled={!remote || !branch}
      onSubmit={async () => {
        remember('pull.rebase', rebase)
        const ok = await ws.run(t('Pull'), () => api.pull(ws.repo, { remote: useDefault ? null : remote, branch: useDefault ? null : branch, rebase }),
          (r) => t('원격 변경을 받아왔어요') + (r.output ? '\n' + lastLines(r.output) : ''))
        if (ok) close()
      }}>
      <p className="muted">{tx('원격 브랜치의 새 커밋을 받아 현재 브랜치 {branch}에 합쳐요.', { branch: <b>{ws.status?.branch ?? 'HEAD'}</b> })}</p>
      <div className="grid2">
        <Field label={t('원격')}>
          <select value={remote} onChange={(e) => { setRemote(e.target.value); setBranch('') }}>
            {ws.remotes.map((r) => <option key={r.name}>{r.name}</option>)}
          </select>
        </Field>
        <Field label={t('원격 브랜치')}>
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="" disabled>{t('고르세요')}</option>
            {branches.map((b) => <option key={b}>{b}</option>)}
          </select>
        </Field>
      </div>
      <Check checked={rebase} onChange={setRebase}>{t('병합 커밋 대신 내 커밋을 그 위로 다시 쌓기 (rebase)')}</Check>
    </Dialog>
  )
}

export function PushDialog({ ws, close }: P) {
  const local = ws.branches?.local ?? []
  const current = ws.status?.branch ?? null
  const cur = local.find((b) => b.name === current)
  const [remote, setRemote] = useState((cur?.upstream && remoteOf(ws.remotes, cur.upstream)?.name) || (ws.remotes.find((r) => r.name === 'origin') ?? ws.remotes[0])?.name || '')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(current ? [current] : []))
  const [setUpstream, setSetUpstream] = useState(!cur?.upstream)
  const [tags, setTags] = useState(() => remembered('push.tags', false))
  const [force, setForce] = useState(false)
  const toggle = (name: string, on: boolean) => setPicked((s) => {
    const n = new Set(s)
    if (on) n.add(name)
    else n.delete(name)
    return n
  })
  return (
    <Dialog title={t('Push')} icon={ArrowUpFromLine} danger={force} onClose={close} submitLabel={force ? t('강제 Push') : t('Push')} width={560}
      disabled={!remote || (picked.size === 0 && !tags)}
      onSubmit={async () => {
        remember('push.tags', tags)
        const ok = await ws.run(t('Push'), () => api.push(ws.repo, { remote, branches: [...picked], tags, force, setUpstream }),
          (out) => t('원격에 Push했어요') + (out ? '\n' + lastLines(out) : ''))
        if (ok) close()
      }}>
      <Field label={t('원격')}>
        <select value={remote} onChange={(e) => setRemote(e.target.value)}>
          {ws.remotes.map((r) => <option key={r.name}>{r.name}</option>)}
        </select>
      </Field>
      <div className="field">
        <span className="field-label">{t('Push할 브랜치')}</span>
        <div className="pick-list">
          {local.map((b) => (
            <label key={b.name} className="pick-row">
              <input type="checkbox" checked={picked.has(b.name)} onChange={(e) => toggle(b.name, e.target.checked)} />
              <b className="ellipsis">{b.name}</b>
              <span className="muted small ellipsis">{b.upstream ? `→ ${b.upstream}` : t('원격에 없음')}</span>
              {b.ahead > 0 && <span className="ab up">↑{b.ahead}</span>}
              {b.behind > 0 && <span className="ab down">↓{b.behind}</span>}
            </label>
          ))}
        </div>
      </div>
      <Check checked={setUpstream} onChange={setSetUpstream}>{t('올린 원격 브랜치를 추적하기 (-u)')}</Check>
      <Check checked={tags} onChange={setTags}>{t('모든 태그도 Push')}</Check>
      <Check checked={force} onChange={setForce}>
        {t('강제 Push (--force-with-lease)')} <span className="muted">{t('· 원격의 기록을 덮어써요. 내가 받은 뒤로 다른 사람이 올린 게 있으면 멈춰요')}</span>
      </Check>
    </Dialog>
  )
}
