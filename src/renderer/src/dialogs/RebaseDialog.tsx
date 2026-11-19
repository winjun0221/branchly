// 대화형 리베이스: base 다음 커밋들을 순서 바꾸기·메시지 고치기·합치기·버리기
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ListRestart } from 'lucide-react'
import type { RebaseAction, RebaseStep } from '../../../shared/types'
import { api, errorText } from '../api'
import { Dialog } from '../components/Dialog'
import { t, tk, tx } from '../i18n'
import { short, type Ws } from '../ws'

const ACTIONS: { value: RebaseAction; label: string; desc: string }[] = [
  { value: 'pick', label: tk('그대로'), desc: tk('커밋을 그대로 둬요') },
  { value: 'reword', label: tk('메시지 고치기'), desc: tk('내용은 두고 메시지만 바꿔요') },
  { value: 'squash', label: tk('위 커밋에 합치기'), desc: tk('바로 위(이전) 커밋과 합치고 메시지도 이어 붙여요') },
  { value: 'fixup', label: tk('위 커밋에 합치기(메시지 버림)'), desc: tk('바로 위 커밋과 합치고 이 메시지는 버려요') },
  { value: 'drop', label: tk('버리기|drop'), desc: tk('이 커밋을 없애요') },
]

export function RebaseDialog({ ws, close, base, baseLabel }: { ws: Ws; close: () => void; base: string; baseLabel: string }) {
  const [steps, setSteps] = useState<RebaseStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [orig, setOrig] = useState('')

  useEffect(() => {
    api.rebaseSteps(ws.repo, base).then((s) => {
      setSteps(s)
      setOrig(s.map((x) => x.sha).join())
    }, (e) => setError(errorText(e)))
  }, [ws.repo, base])

  const set = (i: number, patch: Partial<RebaseStep>) => setSteps((s) => s!.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: -1 | 1) => setSteps((s) => {
    const n = [...s!]
    const j = i + d
    if (j < 0 || j >= n.length) return n
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })

  // 화면은 git과 같은 순서(오래된 것 위). 첫 줄은 합칠 대상이 없음
  const firstKept = steps?.findIndex((s) => s.action !== 'drop') ?? -1
  const invalid = !steps || steps.length === 0 || steps.every((s) => s.action === 'drop')
    || (firstKept >= 0 && (steps[firstKept].action === 'squash' || steps[firstKept].action === 'fixup'))
  const changed = !!steps && (steps.some((s) => s.action !== 'pick') || steps.map((x) => x.sha).join() !== orig)

  return (
    <Dialog title={t('대화형 리베이스')} icon={ListRestart} onClose={close} submitLabel={t('리베이스 시작')} width={820} className="rebase-dialog"
      disabled={invalid || !changed}
      onSubmit={async () => {
        if (await ws.run(t('대화형 리베이스'), () => api.interactiveRebase(ws.repo, base, steps!), t('커밋 기록을 다시 썼어요'))) close()
      }}
      footer={<span className="muted small">{t('이미 Push한 커밋을 바꾸면 다시 Push할 때 강제 Push해야 해요')}</span>}>
      <p className="muted">{tx('{base} 다음 커밋들을 위에서부터 차례로 다시 쌓아요. 위아래 화살표로 순서를 바꿀 수 있어요.', { base: <b>{baseLabel}</b> })}</p>
      {error && <p className="error">{error}</p>}
      {!steps && !error && <p className="muted">{t('불러오는 중…')}</p>}
      {steps && steps.length === 0 && <p className="muted">{t('이 커밋 다음으로 쌓인 커밋이 없어요.')}</p>}
      {steps && steps.length > 0 && (
        <div className="rebase-list">
          {steps.map((s, i) => (
            <div key={s.sha} className={`rebase-row a-${s.action}`}>
              <div className="rebase-move">
                <button type="button" className="icon-btn small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('위로')}><ArrowUp /></button>
                <button type="button" className="icon-btn small" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={t('아래로')}><ArrowDown /></button>
              </div>
              <select value={s.action} onChange={(e) => {
                const action = e.target.value as RebaseAction
                set(i, { action })
                if (action === 'reword') setEditing(i)
              }} title={t(ACTIONS.find((a) => a.value === s.action)?.desc ?? '') || undefined}>
                {ACTIONS.map((a) => <option key={a.value} value={a.value} disabled={i === firstKept && (a.value === 'squash' || a.value === 'fixup')}>{t(a.label)}</option>)}
              </select>
              <span className="mono muted">{short(s.sha)}</span>
              {editing === i && s.action === 'reword' ? (
                <textarea className="rebase-msg" rows={3} value={s.message} onChange={(e) => set(i, { message: e.target.value })} onBlur={() => setEditing(null)} autoFocus />
              ) : (
                <button type="button" className="rebase-subject" onClick={() => s.action === 'reword' && setEditing(i)} title={s.message}>
                  {s.action === 'reword' ? s.message.split('\n')[0] : s.subject}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
