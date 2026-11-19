// Git 흐름(git-flow 방식): 처음 설정 → 기능·배포·긴급 수정 브랜치 시작/끝내기
import { useState } from 'react'
import { Workflow } from 'lucide-react'
import type { FlowConfig, FlowType } from '../../../shared/types'
import { api, useFlow } from '../api'
import { Check, Choice, Dialog, Field } from '../components/Dialog'
import { t, tk, tx } from '../i18n'
import type { Ws } from '../ws'

const TYPE_LABEL: Record<FlowType, string> = { feature: tk('기능'), release: tk('배포'), hotfix: tk('긴급 수정') }

/** 문장 속 종류 이름 (영어는 소문자: 'feature 시작' → 'Start feature') */
const typeWord = (ty: FlowType) => t(TYPE_LABEL[ty]).toLowerCase()

/** 현재 브랜치가 흐름 브랜치면 종류·이름 */
export function flowBranch(c: FlowConfig | undefined, branch: string | null): { type: FlowType; name: string } | null {
  if (!c?.initialized || !branch) return null
  for (const type of ['feature', 'release', 'hotfix'] as const) {
    const p = c[type]
    if (p && branch.startsWith(p) && branch.length > p.length) return { type, name: branch.slice(p.length) }
  }
  return null
}

export function FlowDialog({ ws, close }: { ws: Ws; close: () => void }) {
  const flow = useFlow(ws.repo)
  if (!flow.data) return <Dialog title={t('Git 흐름')} icon={Workflow} onClose={close}><p className="muted">{t('불러오는 중…')}</p></Dialog>
  if (!flow.data.initialized) return <FlowInit ws={ws} close={close} cfg={flow.data} />
  return <FlowAction ws={ws} close={close} cfg={flow.data} />
}

function FlowInit({ ws, close, cfg }: { ws: Ws; close: () => void; cfg: FlowConfig }) {
  const [c, setC] = useState<FlowConfig>({ ...cfg, versionTag: cfg.versionTag || 'v' })
  const f = (k: keyof FlowConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value.trim() })
  return (
    <Dialog title={t('Git 흐름 설정')} icon={Workflow} onClose={close} submitLabel={t('설정하기')} width={560}
      onSubmit={async () => {
        if (await ws.run(t('Git 흐름 설정'), () => api.flowInit(ws.repo, c), t('Git 흐름을 설정했어요'))) close()
      }}>
      <p className="muted">{t('배포용 브랜치와 개발용 브랜치를 나누고, 기능·배포·긴급 수정 브랜치를 정해진 이름으로 만들고 합치는 방식이에요. 개발 브랜치가 없으면 만들어요.')}</p>
      <div className="grid2">
        <Field label={t('배포 브랜치')}><input value={c.master} onChange={f('master')} /></Field>
        <Field label={t('개발 브랜치')}><input value={c.develop} onChange={f('develop')} /></Field>
        <Field label={t('기능 브랜치 접두사')}><input value={c.feature} onChange={f('feature')} /></Field>
        <Field label={t('배포 준비 브랜치 접두사')}><input value={c.release} onChange={f('release')} /></Field>
        <Field label={t('긴급 수정 브랜치 접두사')}><input value={c.hotfix} onChange={f('hotfix')} /></Field>
        <Field label={t('버전 태그 접두사')}><input value={c.versionTag} onChange={f('versionTag')} placeholder={t('비워도 돼요')} /></Field>
      </div>
    </Dialog>
  )
}

function FlowAction({ ws, close, cfg }: { ws: Ws; close: () => void; cfg: FlowConfig }) {
  const current = flowBranch(cfg, ws.status?.branch ?? null)
  const [mode, setMode] = useState<'start' | 'finish'>(current ? 'finish' : 'start')
  const [type, setType] = useState<FlowType>('feature')
  const [name, setName] = useState('')
  const [tagMessage, setTagMessage] = useState('')
  const [keep, setKeep] = useState(false)
  const n = name.trim()

  return (
    <Dialog title={t('Git 흐름')} icon={Workflow} onClose={close} width={560}
      submitLabel={mode === 'start' ? t('시작하기') : t('끝내기')}
      disabled={mode === 'start' ? !n : !current}
      onSubmit={async () => {
        const ok = mode === 'start'
          ? await ws.run(t('{type} 시작', { type: typeWord(type) }), () => api.flowStart(ws.repo, type, n), t('{type} 브랜치를 시작했어요: {name}', { type: typeWord(type), name: `${cfg[type]}${n}` }))
          : await ws.run(t('{type} 끝내기', { type: typeWord(current!.type) }), () => api.flowFinish(ws.repo, current!.type, current!.name, tagMessage, keep),
            t('{type} {name}을(를) 끝냈어요', { type: typeWord(current!.type), name: current!.name }))
        if (ok) close()
      }}>
      <Choice value={mode} onChange={setMode} options={[
        { value: 'start', label: t('새로 시작'), desc: t('기능·배포·긴급 수정 브랜치를 만들어요') },
        { value: 'finish', label: current ? t('지금 브랜치 끝내기 · {branch}', { branch: String(ws.status?.branch) }) : t('지금 브랜치 끝내기'), desc: current ? finishDesc(cfg, current.type) : t('Git 흐름 브랜치에 있을 때만 끝낼 수 있어요') },
      ]} />
      {mode === 'start' && (
        <>
          <div className="seg">
            {(['feature', 'release', 'hotfix'] as const).map((ty) => (
              <button key={ty} type="button" className={type === ty ? 'on' : ''} onClick={() => setType(ty)}>{t(TYPE_LABEL[ty])}</button>
            ))}
          </div>
          <Field label={type === 'feature' ? t('기능 이름') : t('버전')} hint={tx('만들 브랜치: {branch} · 시작 위치: {start}', { branch: <span className="mono">{cfg[type]}{n || '…'}</span>, start: type === 'hotfix' ? cfg.master : cfg.develop })}>
            <input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} placeholder={type === 'feature' ? t('로그인') : '1.2.0'} />
          </Field>
        </>
      )}
      {mode === 'finish' && current && (
        <>
          {current.type !== 'feature' && (
            <Field label={t('태그 메시지 (태그: {tag})', { tag: `${cfg.versionTag}${current.name}` })}>
              <input value={tagMessage} onChange={(e) => setTagMessage(e.target.value)} placeholder={`${current.type} ${current.name}`} />
            </Field>
          )}
          <Check checked={keep} onChange={setKeep}>{t('끝낸 뒤에도 브랜치 남겨 두기')}</Check>
        </>
      )}
    </Dialog>
  )
}

function finishDesc(c: FlowConfig, ty: FlowType): string {
  if (ty === 'feature') return t('{develop}에 병합하고 브랜치를 지워요', { develop: c.develop })
  return t('{master}에 병합 → 버전 태그 → {develop}에도 병합하고 브랜치를 지워요', { master: c.master, develop: c.develop })
}
