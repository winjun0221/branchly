import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Download, ExternalLink, FileText, FolderOpen, GitCommitHorizontal, History, Layers, ScanEye } from 'lucide-react'
import { commitUrl, webRepo } from '../../../shared/hosting'
import type { FileChange } from '../../../shared/types'
import { api, useCommitDetail, useCommitDiff, useRange, useRangeDiff } from '../api'
import { useActions } from '../actions'
import { fullDate } from '../format'
import { t } from '../i18n'
import { useUi, type MenuItem } from '../ui'
import { short, useWs } from '../ws'
import DiffView from './DiffView'
import { FileRow } from './FileList'
import { clamp, Splitter, usePaneSize } from './Splitter'

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico)$/i

/** 고른 커밋(또는 두 커밋 사이): 왼쪽 = 정보·바뀐 파일, 오른쪽 = 파일 변경 내용 */
export default function CommitDetail({ repo, sha, compare, multi = 1 }: { repo: string; sha: string | null; compare?: { from: string; to: string } | null; multi?: number }) {
  const ws = useWs()
  const [left, setLeft, resetLeft] = usePaneSize('detailFiles', 380)
  const detailRef = useRef<HTMLDivElement>(null)
  const ui = useUi()
  const a = useActions()
  const detail = useCommitDetail(repo, compare ? null : sha)
  const range = useRange(repo, compare?.from ?? null, compare?.to ?? null)
  const files: FileChange[] | undefined = compare ? range.data : detail.data?.files
  const [file, setFile] = useState<string | null>(null)
  const d = compare ? null : detail.data

  useEffect(() => {
    setFile(files && files.length > 0 ? files[0].path : null)
  }, [files])

  const commitDiff = useCommitDiff(repo, compare ? null : sha, file, ws.diffOpts)
  const rangeDiff = useRangeDiff(repo, compare?.from ?? null, compare?.to ?? null, file, ws.diffOpts)
  const diff = compare ? rangeDiff : commitDiff
  const kind = files?.find((f) => f.path === file)?.kind
  const isImage = !!file && IMAGE.test(file)
  const before = compare ? compare.from : sha ? `${sha}^` : null
  const after = compare ? compare.to : sha
  const images = useQuery({
    queryKey: ['images', repo, before, after, file],
    enabled: isImage && !!after,
    staleTime: Infinity,
    queryFn: async () => ({
      before: kind === 'A' || (d && d.parents.length === 0) ? null : await api.imagePreview(repo, before, file!),
      after: kind === 'D' ? null : await api.imagePreview(repo, after, file!),
    }),
  })

  if (!sha && !compare) {
    return (
      <div className="detail empty-state">
        {multi > 1 ? <Layers /> : <GitCommitHorizontal />}
        <p>{multi > 1 ? t('커밋 {n}개를 골랐어요. 오른쪽 클릭으로 체리픽·패치 저장을 할 수 있어요.', { n: multi }) : t('커밋을 고르세요')}</p>
      </div>
    )
  }

  const rev = compare ? compare.to : sha!
  const revOk = /^[0-9a-f]{7,64}$/i.test(rev)
  const fileMenu = (e: MouseEvent, f: FileChange) => ui.menu(e, [
    { section: f.path },
    { label: t('파일 기록'), icon: History, onClick: () => a.fileHistory(f.path) },
    f.kind !== 'D' && revOk && { label: t('이 버전에서 줄별 작성자'), icon: ScanEye, onClick: () => a.blame(f.path, rev) },
    f.kind !== 'D' && revOk && { label: t('이 버전을 파일로 저장…'), icon: Download, onClick: () => void ws.run(t('파일 저장'), () => api.saveFileAtRevision(ws.repo, rev, f.path), (p) => (p ? t('저장했어요: {path}', { path: p }) : null)) },
    'sep',
    { label: t('작업 폴더의 파일 열기'), icon: FileText, onClick: () => a.openFile(f.path) },
    { label: t('탐색기에서 보기'), icon: FolderOpen, onClick: () => a.showInFolder(f.path) },
    { label: t('경로 복사'), icon: Copy, onClick: () => a.copy(f.path, t('경로')) },
  ] as MenuItem[])

  const origin = ws.remotes.find((r) => r.name === 'origin') ?? ws.remotes[0]
  const web = origin ? webRepo(origin.fetchUrl) : null

  return (
    <div className="detail" ref={detailRef} style={{ gridTemplateColumns: `${left}px 0 minmax(0, 1fr)` }}>
      <div className="detail-side">
        {!compare && detail.isPending && <p className="muted pad">{t('불러오는 중…')}</p>}
        {d && (
          <div className="detail-meta">
            <h2>{d.subject}</h2>
            {d.body && <pre className="detail-body">{d.body}</pre>}
            <dl>
              <dt>{t('작성자')}</dt>
              <dd><span className="avatar" aria-hidden="true">{d.author.slice(0, 1)}</span>{d.author} <span className="muted ellipsis">&lt;{d.email}&gt;</span></dd>
              <dt>{t('날짜')}</dt><dd>{fullDate(d.time)}</dd>
              <dt>{t('커밋')}</dt>
              <dd className="mono">
                {d.sha.slice(0, 12)}
                <button className="icon-btn small" title={t('커밋 번호 복사')} aria-label={t('커밋 번호 복사')} onClick={() => a.copy(d.sha, t('커밋 번호'))}><Copy /></button>
                {web && <button className="icon-btn small" title={t('웹에서 보기')} aria-label={t('웹에서 보기')} onClick={() => a.openUrl(commitUrl(web, d.sha))}><ExternalLink /></button>}
              </dd>
              {d.parents.length > 0 && (
                <>
                  <dt>{t('부모')}</dt>
                  <dd className="mono">
                    {d.parents.map((p) => <button key={p} className="link mono" onClick={() => ws.focusCommit(p)}>{short(p)}</button>)}
                    {d.parents.length > 1 && <span className="muted"> {t('(병합 · 첫 부모와 비교)')}</span>}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}
        <div className="detail-files">
          <h3>{t('바뀐 파일')} <span className="muted">{files?.length ?? ''}</span></h3>
          {compare && range.isPending && <p className="muted pad small">{t('비교하는 중…')}</p>}
          {files?.map((f) => (
            <FileRow key={f.path} file={f} selected={f.path === file} onSelect={() => setFile(f.path)} onContextMenu={(e) => fileMenu(e, f)} onDoubleClick={() => a.fileHistory(f.path)} />
          ))}
          {files?.length === 0 && <p className="muted pad small">{t('바뀐 파일이 없어요')}</p>}
        </div>
      </div>
      <Splitter dir="col" onReset={resetLeft} onDrag={(x) => {
        const r = detailRef.current?.getBoundingClientRect()
        if (r) setLeft(clamp(x - r.left, 220, r.width - 320))
      }} />
      <DiffView path={file} raw={diff.data} loading={diff.isFetching && !diff.data} error={diff.error} images={isImage ? images.data : null} />
    </div>
  )
}
