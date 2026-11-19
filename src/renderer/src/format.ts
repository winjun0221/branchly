import type { ChangeKind } from '../../shared/types'
import { t, tk } from './i18n'

export const CHANGE_LABEL: Record<ChangeKind, string> = {
  M: tk('수정'), A: tk('추가'), D: tk('삭제'), R: tk('이름 바꿈'), C: tk('복사'), T: tk('형식 바뀜'), U: tk('충돌'), '?': tk('새 파일'),
}

/** 방금 전 / 3분 전 / 2시간 전 / 어제 / 5일 전 / 2026-11-02 */
export function relativeTime(unix: number): string {
  const sec = Math.floor(Date.now() / 1000 - unix)
  if (sec < 60) return t('방금 전')
  if (sec < 3600) return t('{n}분 전', { n: Math.floor(sec / 60) })
  if (sec < 86400) return t('{n}시간 전', { n: Math.floor(sec / 3600) })
  const days = Math.floor(sec / 86400)
  if (days === 1) return t('어제')
  if (days < 7) return t('{n}일 전', { n: days })
  return fullDate(unix).slice(0, 10)
}

export function fullDate(unix: number): string {
  const d = new Date(unix * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** "src/app/login.ts" → ["src/app/", "login.ts"] */
export function splitPath(path: string): [string, string] {
  const i = path.lastIndexOf('/')
  return i < 0 ? ['', path] : [path.slice(0, i + 1), path.slice(i + 1)]
}
