import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { t } from '../i18n'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'warn' | 'error'
}

const ICON = { info: Info, success: CircleCheck, warn: TriangleAlert, error: CircleAlert }

/** 오른쪽 아래 알림 (git 작업 결과·오류) */
export default function Toasts({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICON[toast.kind]
        return (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <Icon />
            <pre>{toast.text}</pre>
            <button className="icon-btn small" onClick={() => onClose(toast.id)} aria-label={t('닫기')}><X /></button>
          </div>
        )
      })}
    </div>
  )
}
