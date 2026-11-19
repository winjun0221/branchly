import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderGit2, Plus, X } from 'lucide-react'
import type { RepoInfo } from '../../shared/types'
import { api, DEFAULT_SETTINGS, errorText, useBranches, useRefreshRepo, useRemotes, useSettings, useStashes, useStatus } from './api'
import { resolveLang } from '../../shared/i18n'
import { setLang, t } from './i18n'
import { UiProvider, useUi } from './ui'
import { isOpResult, WsContext, type View, type Ws } from './ws'
import Welcome from './components/Welcome'
import Toolbar from './components/Toolbar'
import OperationBanner from './components/OperationBanner'
import Sidebar from './components/Sidebar'
import HistoryView from './components/HistoryView'
import ChangesView from './components/ChangesView'
import UpdateChip from './components/UpdateChip'

const TABS_KEY = 'branchly.tabs'
const ACTIVE_KEY = 'branchly.activeTab'

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // 저장 못 해도 다음에 시작 화면이 뜰 뿐
  }
}

export default function App() {
  // 언어는 설정을 읽은 뒤 정한다. 바꾸면 화면 전체를 다시 그린다(key)
  const settings = useSettings()
  if (!settings.data && !settings.error) return <div className="splash" />
  const lang = resolveLang(settings.data?.language, navigator.language)
  setLang(lang)
  document.documentElement.lang = lang
  return (
    <UiProvider key={lang}>
      <Shell />
    </UiProvider>
  )
}

/** 저장소 탭들 + 시작 화면(새 탭) */
function Shell() {
  const ui = useUi()
  const [tabs, setTabs] = useState<RepoInfo[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)

  // 실행할 때 넘긴 폴더 + 지난번 탭들을 다시 연다
  useEffect(() => {
    void (async () => {
      const opened: RepoInfo[] = []
      const startup = await api.startupRepo().catch(() => null)
      const saved = load<string[]>(TABS_KEY, [])
      for (const p of [...saved, ...(startup ? [startup] : [])]) {
        try {
          const r = await api.openRepo(p)
          if (!opened.some((o) => o.path === r.path)) opened.push(r)
        } catch {
          // 없어진 저장소는 건너뜀
        }
      }
      setTabs(opened)
      const want = startup ? opened.find((o) => o.path.toLowerCase() === startup.toLowerCase())?.path ?? opened[opened.length - 1]?.path : load<string | null>(ACTIVE_KEY, null)
      setActive(opened.find((o) => o.path === want)?.path ?? opened[0]?.path ?? null)
      setBooting(false)
    })()
  }, [])

  useEffect(() => {
    if (booting) return
    save(TABS_KEY, tabs.map((t) => t.path))
    save(ACTIVE_KEY, active)
    const t = tabs.find((x) => x.path === active)
    document.title = t ? `${t.name} — Branchly` : 'Branchly'
  }, [tabs, active, booting])

  const openTab = useCallback((r: RepoInfo) => {
    setTabs((t) => (t.some((x) => x.path === r.path) ? t : [...t, r]))
    setActive(r.path)
  }, [])

  // 이미 켜진 상태에서 Branchly를 다시 실행하며 폴더를 넘기면(탐색기·명령줄) 여기서 새 탭으로 연다
  useEffect(() => {
    if (booting) return
    const take = async () => {
      for (const dir of await api.takePendingOpen().catch(() => [] as string[])) {
        try {
          openTab(await api.openRepo(dir))
        } catch (e) {
          ui.notify(errorText(e), 'error')
        }
      }
    }
    void take()
    window.addEventListener('focus', take)
    const timer = window.setInterval(take, 2000)
    return () => {
      window.removeEventListener('focus', take)
      window.clearInterval(timer)
    }
  }, [booting, openTab, ui])

  const closeTab = useCallback((path: string) => {
    setTabs((t) => {
      const i = t.findIndex((x) => x.path === path)
      const next = t.filter((x) => x.path !== path)
      setActive((a) => (a === path ? next[Math.min(i, next.length - 1)]?.path ?? null : a))
      return next
    })
  }, [])

  // Ctrl+T 새 탭, Ctrl+W 탭 닫기, Ctrl+Tab 다음 탭
  const state = useRef({ tabs, active })
  state.current = { tabs, active }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      const { tabs: ts, active: a } = state.current
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setActive(null)
      } else if ((e.key === 'w' || e.key === 'W') && a) {
        e.preventDefault()
        closeTab(a)
      } else if (e.key === 'Tab' && ts.length > 1) {
        e.preventDefault()
        const i = ts.findIndex((t) => t.path === a)
        setActive(ts[(i + (e.shiftKey ? -1 : 1) + ts.length) % ts.length].path)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [closeTab])

  if (booting) return <div className="splash" />
  const current = tabs.find((t) => t.path === active)

  return (
    <div className="app">
      <nav className="tabbar" role="tablist">
        {tabs.map((tab) => (
          <div key={tab.path} role="tab" aria-selected={tab.path === active} className={`tab ${tab.path === active ? 'on' : ''}`}
            title={tab.path} onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.path) } else setActive(tab.path) }}>
            <FolderGit2 />
            <span className="ellipsis">{tab.name}</span>
            <button className="tab-close" aria-label={t('탭 닫기')} onMouseDown={(e) => e.stopPropagation()} onClick={() => closeTab(tab.path)}><X /></button>
          </div>
        ))}
        <button className={`tab-new ${active === null ? 'on' : ''}`} title={t('새 탭 (Ctrl+T)')} aria-label={t('새 탭')} onClick={() => setActive(null)}><Plus /></button>
        <span className="spacer" />
        <UpdateChip />
      </nav>
      {current ? <Workspace key={current.path} info={current} /> : <Welcome onOpen={openTab} notify={ui.notify} />}
    </div>
  )
}

function Workspace({ info }: { info: RepoInfo }) {
  const repo = info.path
  const ui = useUi()
  const status = useStatus(repo)
  const branches = useBranches(repo)
  const remotes = useRemotes(repo)
  const stashes = useStashes(repo)
  const settings = useSettings().data ?? DEFAULT_SETTINGS
  const refreshRepo = useRefreshRepo()
  const [view, setView] = useState<View>(() => load<View>('branchly.view', 'history'))
  const [focus, setFocus] = useState<{ sha: string; n: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [ignoreWs, setIgnoreWs] = useState<boolean | null>(null)
  const pending = useRef(0)

  useEffect(() => save('branchly.view', view), [view])

  // 다른 프로그램(터미널·에디터)에서 커밋·체크아웃·브랜치를 바꾸면: HEAD나 브랜치 목록이 바뀐 걸 보고 새로고침
  const qc = useQueryClient()
  const outside = `${status.data?.head ?? ''}|${status.data?.branch ?? ''}|${branches.data ? JSON.stringify(branches.data) : ''}`
  const lastOutside = useRef<string | null>(null)
  useEffect(() => {
    if (!status.data || !branches.data) return
    if (lastOutside.current !== null && lastOutside.current !== outside) {
      void qc.invalidateQueries({ queryKey: ['log', repo] })
      void qc.invalidateQueries({ queryKey: ['branches', repo] })
    }
    lastOutside.current = outside
  }, [outside, qc, repo, status.data, branches.data])

  const refresh = useCallback(() => refreshRepo(repo), [refreshRepo, repo])

  const run = useCallback<Ws['run']>(async (label, fn, success) => {
    pending.current++
    setBusy(label)
    try {
      const r = await fn()
      if (isOpResult(r) && r.conflicts) {
        ui.notify(t("{label}: 충돌이 났어요.\n변경 사항에서 충돌 파일을 해결한 뒤 위쪽 막대의 '계속'을 누르세요.", { label }), 'warn')
        setView('changes')
      } else {
        const msg = typeof success === 'function' ? success(r) : success
        if (msg) ui.notify(msg, 'success')
      }
      return true
    } catch (e) {
      ui.notify(t('{label} 실패\n{error}', { label, error: errorText(e) }), 'error')
      return false
    } finally {
      if (--pending.current === 0) setBusy(null)
      refreshRepo(repo)
    }
  }, [refreshRepo, repo, ui])

  const ws = useMemo<Ws>(() => ({
    repo,
    info,
    status: status.data,
    branches: branches.data,
    remotes: remotes.data ?? [],
    stashes: stashes.data ?? [],
    settings,
    view,
    setView,
    focusCommit: (sha: string) => {
      setView('history')
      setFocus({ sha, n: Date.now() })
    },
    diffOpts: { ignoreWhitespace: ignoreWs ?? settings.ignoreWhitespace },
    setIgnoreWhitespace: setIgnoreWs,
    busy,
    run,
    refresh,
  }), [repo, info, status.data, branches.data, remotes.data, stashes.data, settings, view, ignoreWs, busy, run, refresh])

  // F5 새로고침
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault()
        refresh()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [refresh])

  return (
    <WsContext.Provider value={ws}>
      <div className="workspace">
        <Toolbar />
        <OperationBanner />
        <div className="body">
          <Sidebar />
          <main className="main">
            {status.error && <div className="banner error">{errorText(status.error)}</div>}
            {view === 'history' ? <HistoryView focus={focus} onFocusTaken={() => setFocus(null)} /> : <ChangesView />}
          </main>
        </div>
      </div>
    </WsContext.Provider>
  )
}
