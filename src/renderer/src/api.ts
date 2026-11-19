import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Api, AppSettings, DiffKind, DiffOptions, LogQuery } from '../../shared/types'

declare global {
  interface Window {
    api: Api
  }
}

export const api = window.api

// 저장소마다 쿼리 키 두 번째 칸이 저장소 경로 → 쓰기 뒤 refreshRepo(repo)로 한 번에 새로고침

export const useStatus = (repo: string) =>
  useQuery({ queryKey: ['status', repo], queryFn: () => api.status(repo), refetchInterval: 5_000 })

export const useLog = (repo: string, q: LogQuery) =>
  useQuery({ queryKey: ['log', repo, q], queryFn: () => api.log(repo, q), placeholderData: (prev) => prev })

export const useBranches = (repo: string) => useQuery({ queryKey: ['branches', repo], queryFn: () => api.branches(repo), refetchInterval: 10_000 })
export const useStashes = (repo: string) => useQuery({ queryKey: ['stashes', repo], queryFn: () => api.stashes(repo), refetchInterval: 15_000 })
export const useRemotes = (repo: string) => useQuery({ queryKey: ['remotes', repo], queryFn: () => api.remotes(repo) })
export const useSubmodules = (repo: string) => useQuery({ queryKey: ['submodules', repo], queryFn: () => api.submodules(repo) })
export const useFlow = (repo: string) => useQuery({ queryKey: ['flow', repo], queryFn: () => api.flowConfig(repo) })

export const useCommitDetail = (repo: string, sha: string | null) =>
  useQuery({ queryKey: ['detail', repo, sha], queryFn: () => api.commitDetail(repo, sha!), enabled: !!sha, staleTime: Infinity })

export const useWorkingDiff = (repo: string, path: string | null, kind: DiffKind, o: DiffOptions) =>
  useQuery({ queryKey: ['diff-working', repo, path, kind, o], queryFn: () => api.diffWorking(repo, path!, kind, o), enabled: !!path })

export const useCommitDiff = (repo: string, sha: string | null, path: string | null, o: DiffOptions) =>
  useQuery({ queryKey: ['diff-commit', repo, sha, path, o], queryFn: () => api.diffCommit(repo, sha!, path!, o), enabled: !!sha && !!path, staleTime: Infinity })

export const useRange = (repo: string, from: string | null, to: string | null) =>
  useQuery({ queryKey: ['range', repo, from, to], queryFn: () => api.diffRange(repo, from!, to!), enabled: !!from && !!to, staleTime: Infinity })

export const useRangeDiff = (repo: string, from: string | null, to: string | null, path: string | null, o: DiffOptions) =>
  useQuery({
    queryKey: ['range-diff', repo, from, to, path, o],
    queryFn: () => api.diffRangeFile(repo, from!, to!, path!, o),
    enabled: !!from && !!to && !!path,
    staleTime: Infinity,
  })

// 배율은 단축키(Ctrl +/-/0)로 메인 쪽에서도 바뀌므로 화면을 열 때마다 다시 읽는다
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.settings(), staleTime: Infinity, refetchOnMount: 'always' })

export const DEFAULT_SETTINGS: AppSettings = { theme: 'system', editor: '', diffFontSize: 12, sideBySide: false, ignoreWhitespace: false, zoom: 0, updateUrl: '', autoUpdate: true, language: 'auto' }

export function useRefreshRepo() {
  const qc = useQueryClient()
  return (repo: string) => {
    // 커밋 내용(detail, diff-commit)은 바뀌지 않으니 두고, 나머지 저장소 상태만
    for (const key of ['status', 'log', 'branches', 'stashes', 'remotes', 'submodules', 'flow', 'diff-working', 'range']) {
      void qc.invalidateQueries({ queryKey: [key, repo] })
    }
  }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
}

/** 자동 업데이트 상태: 받는 중이면 1초, 아니면 30초마다 */
export const useUpdateStatus = () =>
  useQuery({
    queryKey: ['update'],
    queryFn: () => api.updateStatus(),
    refetchInterval: (q) => (q.state.data?.state === 'downloading' || q.state.data?.state === 'checking' ? 1000 : 30_000),
  })
