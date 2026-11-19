import { CircleCheck, GitBranchPlus, Play, SkipForward, Square, TriangleAlert } from 'lucide-react'
import { useActions } from '../actions'
import { useWs } from '../ws'
import { t, tk } from '../i18n'

const KIND = { merge: tk('병합'), rebase: tk('리베이스'), 'cherry-pick': tk('체리픽'), revert: tk('되돌리기') } as const

/** 충돌로 멈춘 병합·리베이스 등을 알려 주고 계속/건너뛰기/중단, 또는 HEAD 분리 상태 안내 */
export default function OperationBanner() {
  const ws = useWs()
  const a = useActions()
  const s = ws.status
  if (!s) return null
  const op = s.operation
  if (op) {
    const left = s.conflicted.length
    return (
      <div className={`op-banner ${left ? 'warn' : 'ok'}`}>
        {left ? <TriangleAlert /> : <CircleCheck />}
        <span className="op-text">
          <b>{t('{kind} 진행 중', { kind: t(KIND[op.kind]) })}</b>
          {op.step && op.total ? <span className="muted"> · {op.step}/{op.total}</span> : null}
          {op.detail && <span className="muted ellipsis"> · {op.detail}</span>}
          <span> — {left ? t('충돌 파일 {n}개를 해결하세요', { n: left }) : t('충돌을 모두 해결했어요. 계속을 누르세요')}</span>
        </span>
        <span className="spacer" />
        {left > 0 && ws.view !== 'changes' && <button className="btn small" onClick={() => ws.setView('changes')}>{t('충돌 보기')}</button>}
        <button className="btn small primary" disabled={left > 0} onClick={() => void a.continueOp()}><Play />{t('계속')}</button>
        {(op.kind === 'rebase' || op.kind === 'cherry-pick') && <button className="btn small" onClick={() => void a.skipOp()}><SkipForward />{t('이 커밋 건너뛰기')}</button>}
        <button className="btn small danger-outline" onClick={() => void a.abortOp()}><Square />{t('중단')}</button>
      </div>
    )
  }
  if (s.detached) {
    return (
      <div className="op-banner info">
        <TriangleAlert />
        <span className="op-text"><b>{t('HEAD 분리 상태')}</b> — {t('브랜치가 아닌 커밋을 보고 있어요. 여기서 커밋하려면 새 브랜치를 만드세요.')}</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => a.newBranch()}><GitBranchPlus />{t('여기서 새 브랜치')}</button>
      </div>
    )
  }
  return null
}
