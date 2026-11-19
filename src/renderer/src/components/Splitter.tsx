// 칸 사이 경계: 드래그로 크기 조절, 더블클릭이면 처음 크기. 크기는 localStorage에 기억(PC마다)
import { useCallback, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { t } from '../i18n'

const KEY = (k: string) => 'branchly.pane.' + k

function load(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(KEY(key)))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

/** [크기, 바꾸기, 처음 크기로] */
export function usePaneSize(key: string, fallback: number) {
  const [size, setSize] = useState(() => load(key, fallback))
  const set = useCallback((v: number) => {
    setSize(v)
    try {
      localStorage.setItem(KEY(key), String(Math.round(v * 10) / 10))
    } catch {
      // 기억 못 해도 지금 크기는 바뀐다
    }
  }, [key])
  const reset = useCallback(() => {
    setSize(fallback)
    try {
      localStorage.removeItem(KEY(key))
    } catch {
      // 무시
    }
  }, [key, fallback])
  return [size, set, reset] as const
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), v))

/** dir: 'col' = 좌우로 끄는 세로 경계, 'row' = 위아래로 끄는 가로 경계. onDrag는 마우스 위치(clientX, clientY)를 받는다 */
export function Splitter({ dir, onDrag, onReset }: { dir: 'col' | 'row'; onDrag: (x: number, y: number) => void; onReset: () => void }) {
  const start = (e: ReactMouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const cls = dir === 'col' ? 'resizing-col' : 'resizing-row'
    // 왼쪽 버튼이 눌린 움직임만 (다른 입력이 섞여도 크기가 튀지 않게). 창 밖에서 놓쳐도 포커스를 잃으면 끝
    const move = (ev: MouseEvent) => {
      if ((ev.buttons & 1) === 1) onDrag(ev.clientX, ev.clientY)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      window.removeEventListener('blur', up)
      document.body.classList.remove(cls)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    window.addEventListener('blur', up)
    document.body.classList.add(cls)
  }
  return (
    <div
      className={`splitter ${dir}`}
      role="separator"
      aria-orientation={dir === 'col' ? 'vertical' : 'horizontal'}
      title={t('드래그해서 크기 조절 · 더블클릭하면 처음 크기')}
      onMouseDown={start}
      onDoubleClick={onReset}
    />
  )
}
