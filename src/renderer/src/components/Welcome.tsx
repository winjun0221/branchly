import { useEffect, useState } from 'react'
import { FolderGit2, FolderOpen, FolderPlus, GitBranch, GitFork, Settings, X } from 'lucide-react'
import type { RepoInfo } from '../../../shared/types'
import { api, errorText } from '../api'
import { useUi } from '../ui'
import { CloneDialog, initRepoFlow } from '../dialogs/CloneDialog'
import { AppSettingsDialog } from '../dialogs/AppSettings'
import { t } from '../i18n'

/** 저장소를 열기 전(새 탭) 화면: 열기 · 복제 · 새로 만들기 + 최근 저장소 */
export default function Welcome({ onOpen, notify }: { onOpen: (r: RepoInfo) => void; notify: (t: string, k?: 'error') => void }) {
  const ui = useUi()
  const [recent, setRecent] = useState<RepoInfo[]>([])

  useEffect(() => {
    void api.recentRepos().then(setRecent).catch(() => setRecent([]))
  }, [])

  const tryOpen = async (fn: () => Promise<RepoInfo | null>) => {
    try {
      const r = await fn()
      if (r) onOpen(r)
    } catch (e) {
      notify(errorText(e), 'error')
    }
  }
  const forget = async (path: string) => {
    await api.forgetRepo(path)
    setRecent((r) => r.filter((x) => x.path !== path))
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="logo"><GitBranch /></div>
        <h1>Branchly</h1>
        <p className="muted">{t('저장소를 열어 커밋 그래프와 변경 사항을 확인하세요.')}</p>
        <div className="start-actions">
          <button className="start-btn primary" onClick={() => tryOpen(() => api.pickRepo())}>
            <FolderOpen /><b>{t('저장소 열기')}</b><span>{t('내 PC의 git 폴더')}</span>
          </button>
          <button className="start-btn" onClick={() => ui.open((close) => <CloneDialog close={close} onOpen={onOpen} />)}>
            <GitFork /><b>{t('복제하기')}</b><span>{t('GitHub 등 원격 주소로')}</span>
          </button>
          <button className="start-btn" onClick={() => void initRepoFlow(onOpen, notify)}>
            <FolderPlus /><b>{t('새로 만들기')}</b><span>{t('빈 폴더를 git 저장소로')}</span>
          </button>
        </div>
        {recent.length > 0 && (
          <div className="recent">
            <h3>{t('최근 저장소')}</h3>
            {recent.map((r) => (
              <div key={r.path} className="recent-item">
                <button className="recent-open" onClick={() => tryOpen(() => api.openRepo(r.path))}>
                  <FolderGit2 />
                  <span>
                    <b>{r.name}</b>
                    <span className="muted small">{r.path}</span>
                  </span>
                </button>
                <button className="icon-btn" title={t('목록에서 빼기')} aria-label={t('목록에서 빼기')} onClick={() => forget(r.path)}><X /></button>
              </div>
            ))}
          </div>
        )}
        <button className="link" onClick={() => ui.open((close) => <AppSettingsDialog close={close} />)}><Settings />{t('앱 설정')}</button>
      </div>
    </div>
  )
}
