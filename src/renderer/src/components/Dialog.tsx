import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle, X, type LucideIcon } from 'lucide-react'
import { t } from '../i18n'

/** 대화 상자 틀: 제목 · 내용 · 아래 버튼. 내용은 form이라 Enter로 확인. Esc·바깥 클릭으로 닫기 */
export function Dialog({ title, icon: Icon, onClose, onSubmit, submitLabel = t('확인'), cancelLabel = t('취소'), danger, disabled, width = 520, footer, children, className }: {
  title: ReactNode
  icon?: LucideIcon
  onClose: () => void
  /** 없으면 '닫기' 버튼만. Promise면 끝날 때까지 버튼이 돈다 */
  onSubmit?: () => unknown
  submitLabel?: string
  cancelLabel?: string
  danger?: boolean
  disabled?: boolean
  width?: number
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const all = document.querySelectorAll('.dialog')
      if (all[all.length - 1] === ref.current && !busy) onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose, busy])

  // 첫 입력 칸에 커서
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]):not([type=radio]), textarea, select')
    el?.focus()
  }, [])

  const submit = async () => {
    if (!onSubmit || disabled || busy) return
    setBusy(true)
    try {
      await onSubmit()
    } finally {
      if (ref.current) setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <form
        ref={ref}
        className={`dialog ${className ?? ''}`}
        style={{ width: `min(${width}px, calc(100vw - 40px))` }}
        role="dialog"
        aria-modal="true"
        onSubmit={(e) => { e.preventDefault(); void submit() }}
      >
        <div className="dialog-head">
          {Icon && <span className={`dialog-icon ${danger ? 'danger' : ''}`}><Icon /></span>}
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label={t('닫기')}><X /></button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">
          {footer}
          <span className="spacer" />
          {onSubmit ? (
            <>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>{cancelLabel}</button>
              <button type="submit" className={`btn ${danger ? 'danger' : 'primary'}`} disabled={disabled || busy}>
                {busy && <LoaderCircle className="spin" />}{submitLabel}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={onClose}>{t('닫기')}</button>
          )}
        </div>
      </form>
    </div>
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`check ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

/** 고르기 카드 (리셋 방식 등) */
export function Choice<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; desc: ReactNode; danger?: boolean }[]
}) {
  return (
    <div className="choices" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={`choice ${value === o.value ? 'on' : ''} ${o.danger ? 'danger' : ''}`}>
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>
            <b>{o.label}</b>
            <span className="muted small">{o.desc}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

/** 위쪽 탭 (설정 창 안) */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; icon?: LucideIcon }[] }) {
  return (
    <div className="seg" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={value === t.value ? 'on' : ''} onClick={() => onChange(t.value)}>
          {t.icon && <t.icon />}{t.label}
        </button>
      ))}
    </div>
  )
}
