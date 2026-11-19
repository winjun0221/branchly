// 열린 저장소 하나(작업 공간)의 공용 상태와 작업 실행기
import { createContext, useContext } from 'react'
import type { AppSettings, Branches, DiffOptions, OpResult, Remote, RepoInfo, Stash, Status } from '../../shared/types'
import { t } from './i18n'

export type View = 'changes' | 'history'

export interface Ws {
  repo: string
  info: RepoInfo
  status: Status | undefined
  branches: Branches | undefined
  remotes: Remote[]
  stashes: Stash[]
  settings: AppSettings
  view: View
  setView(v: View): void
  /** 히스토리에서 이 커밋을 골라 보여 주기 */
  focusCommit(sha: string): void
  diffOpts: DiffOptions
  setIgnoreWhitespace(v: boolean): void
  /** 진행 중인 작업 이름 (툴바에 돎) */
  busy: string | null
  /**
   * git 작업 실행: 도는 표시 → 성공 알림(또는 충돌 안내) → 저장소 새로고침. 오류는 알림으로.
   * 성공하면 true (대화 상자는 true일 때 닫는다)
   */
  run<T>(label: string, fn: () => Promise<T>, success?: string | ((r: T) => string | null)): Promise<boolean>
  refresh(): void
}

export const WsContext = createContext<Ws | null>(null)

export function useWs(): Ws {
  const ws = useContext(WsContext)
  if (!ws) throw new Error(t('작업 공간 밖'))
  return ws
}

export const isOpResult = (r: unknown): r is OpResult =>
  typeof r === 'object' && r !== null && 'conflicts' in r && typeof (r as OpResult).conflicts === 'boolean'

/** git 출력에서 마지막 몇 줄만 (알림용) */
export function lastLines(out: string, n = 3): string {
  return out.split('\n').map((l) => l.trim()).filter(Boolean).slice(-n).join('\n')
}

/** 이 브랜치의 원격 이름 ("origin/feature/x" → origin). 원격 목록에서 가장 긴 일치 */
export function remoteOf(remotes: Remote[], remoteBranch: string): Remote | null {
  return remotes.filter((r) => remoteBranch.startsWith(r.name + '/')).sort((a, b) => b.name.length - a.name.length)[0] ?? null
}

export const short = (sha: string) => sha.slice(0, 7)
