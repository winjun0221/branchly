// 앱 전체 공용 화면 장치: 알림, 대화 상자(겹쳐 열기), 확인 창, 오른쪽 클릭 메뉴
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TriangleAlert } from 'lucide-react'
import Toasts, { type Toast } from './components/Toasts'
import { Dialog } from './components/Dialog'
import { t } from './i18n'

export type MenuItem =
  | { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | { section: string }
  | 'sep'
  | null
  | false
  | undefined
  | ''

interface Ui {
  notify(text: string, kind?: Toast['kind']): void
  /** 대화 상자 열기. render가 받는 close를 부르면 닫힘 */
  open(render: (close: () => void) => ReactNode): void
  confirm(o: { title: string; message: ReactNode; confirm?: string; danger?: boolean }): Promise<boolean>
  /** 마우스 위치(오른쪽 클릭) 또는 지정한 좌표에 메뉴 */
  menu(at: MouseEvent | { x: number; y: number }, items: MenuItem[]): void
}

const UiContext = createContext<Ui | null>(null)

export function useUi(): Ui {
  const ui = useContext(UiContext)
  if (!ui) throw new Error(t('UiProvider 밖'))
  return ui
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialogs, setDialogs] = useState<{ id: number; node: ReactNode }[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const seq = useRef(0)

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-4), { id, text, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' || kind === 'warn' ? 10000 : 4500)
  }, [])

  const open = useCallback((render: (close: () => void) => ReactNode) => {
    const id = ++seq.current
    const close = () => setDialogs((d) => d.filter((x) => x.id !== id))
    setMenu(null)
    setDialogs((d) => [...d, { id, node: render(close) }])
  }, [])

  const confirm = useCallback<Ui['confirm']>((o) => new Promise((resolve) => {
    open((close) => (
      <Dialog
        title={o.title}
        icon={o.danger ? TriangleAlert : undefined}
        danger={o.danger}
        width={440}
        submitLabel={o.confirm ?? t('확인')}
        onSubmit={() => { resolve(true); close() }}
        onClose={() => { resolve(false); close() }}
      >
        <div className="confirm-text">{o.message}</div>
      </Dialog>
    ))
  }), [open])

  const showMenu = useCallback((at: MouseEvent | { x: number; y: number }, items: MenuItem[]) => {
    let x: number
    let y: number
    if ('preventDefault' in at) {
      at.preventDefault()
      at.stopPropagation()
      x = at.clientX
      y = at.clientY
    } else {
      ;({ x, y } = at)
    }
    if (items.some((i) => i && i !== 'sep' && !('section' in i))) setMenu({ x, y, items })
  }, [])

  const ui = useMemo<Ui>(() => ({ notify, open, confirm, menu: showMenu }), [notify, open, confirm, showMenu])

  return (
    <UiContext.Provider value={ui}>
      {children}
      {dialogs.map((d) => <div key={d.id}>{d.node}</div>)}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      <Toasts toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </UiContext.Provider>
  )
}

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 화면 밖으로 나가면 안쪽으로
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    })
  }, [x, y])

  useEffect(() => {
    const down = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // 앞뒤·연달아 나오는 구분선 정리
  const list = items.filter((i): i is Exclude<MenuItem, null | false | undefined | ''> => !!i)
  const clean = list.filter((it, i) => it !== 'sep' || (i > 0 && i < list.length - 1 && list[i + 1] !== 'sep' && list[i - 1] !== 'sep'))

  return (
    <div className="ctx-menu" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {clean.map((it, i) => {
        if (it === 'sep') return <div key={i} className="menu-sep" />
        if ('section' in it) return <div key={i} className="menu-label">{it.section}</div>
        const Icon = it.icon
        return (
          <button
            key={i}
            className={`menu-item ${it.danger ? 'danger' : ''}`}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { onClose(); it.onClick() }}
          >
            {Icon ? <Icon /> : <span className="menu-icon-gap" />}
            <span className="menu-label-text">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}
