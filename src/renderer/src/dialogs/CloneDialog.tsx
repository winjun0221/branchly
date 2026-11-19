// 원격 저장소 복제 · 새 저장소 만들기 (시작 화면)
import { useState } from 'react'
import { FolderOpen, FolderPlus, GitFork } from 'lucide-react'
import type { RepoInfo } from '../../../shared/types'
import { api, errorText } from '../api'
import { Check, Dialog, Field } from '../components/Dialog'
import { t } from '../i18n'

/** https://github.com/me/app.git → app */
export const repoNameFromUrl = (url: string) => url.trim().replace(/[\\/]+$/, '').split(/[/:\\]/).pop()?.replace(/\.git$/, '') ?? ''

export function CloneDialog({ close, onOpen }: { close: () => void; onOpen: (r: RepoInfo) => void }) {
  const [url, setUrl] = useState('')
  const [parent, setParent] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [branch, setBranch] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const folder = name ?? repoNameFromUrl(url)
  return (
    <Dialog title={t('원격 저장소 복제')} icon={GitFork} onClose={close} submitLabel={t('복제')} width={600} disabled={!url.trim() || !parent || !folder}
      onSubmit={async () => {
        setError(null)
        try {
          onOpen(await api.cloneRepo(url.trim(), parent, folder, branch.trim() || null, recursive))
          close()
        } catch (e) {
          setError(errorText(e))
        }
      }}>
      <Field label={t('저장소 주소')} hint={t('https 주소는 처음 한 번 로그인 창(Git Credential Manager)이 뜰 수 있어요')}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/me/app.git" />
      </Field>
      <Field label={t('넣을 위치')}>
        <div className="row">
          <input className="grow" value={parent} readOnly placeholder={t('폴더를 고르세요')} />
          <button type="button" className="btn" onClick={async () => {
            const p = await api.pickFolder(t('복제할 위치 고르기'))
            if (p) setParent(p)
          }}><FolderOpen />{t('고르기')}</button>
        </div>
      </Field>
      <div className="grid2">
        <Field label={t('새 폴더 이름')}><input value={folder} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('브랜치 (비우면 기본)')}><input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" /></Field>
      </div>
      <Check checked={recursive} onChange={setRecursive}>{t('서브모듈도 같이 받기')}</Check>
      {parent && folder && <p className="muted small mono">{parent}\{folder}</p>}
      {error && <pre className="error small">{error}</pre>}
    </Dialog>
  )
}

export async function initRepoFlow(onOpen: (r: RepoInfo) => void, notify: (t: string, k?: 'error') => void) {
  const dir = await api.pickFolder(t('새 저장소를 만들 폴더 고르기'))
  if (!dir) return
  try {
    onOpen(await api.initRepo(dir))
  } catch (e) {
    notify(errorText(e), 'error')
  }
}

export const InitIcon = FolderPlus
