// 파일 하나: 기록(이 파일을 바꾼 커밋들 + 그때의 변경) · 줄마다 누가 바꿨나(blame)
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, History, ScanEye } from 'lucide-react'
import { api, errorText, useCommitDiff } from '../api'
import { Dialog } from '../components/Dialog'
import DiffView from '../components/DiffView'
import { fullDate, relativeTime } from '../format'
import { t, tx } from '../i18n'
import { short, type Ws } from '../ws'

export function FileHistoryDialog({ ws, close, path, openBlame }: { ws: Ws; close: () => void; path: string; openBlame: (rev: string | null) => void }) {
  const log = useQuery({ queryKey: ['file-log', ws.repo, path], queryFn: () => api.fileLog(ws.repo, path, 1000) })
  const [sha, setSha] = useState<string | null>(null)
  const sel = sha ?? log.data?.[0]?.sha ?? null
  const diff = useCommitDiff(ws.repo, sel, path, ws.diffOpts)
  return (
    <Dialog title={tx('파일 기록 · {path}', { path: <span className="mono">{path}</span> })} icon={History} onClose={close} width={1200} className="big-dialog"
      footer={sel && (
        <>
          <button type="button" className="btn" onClick={() => openBlame(sel)}><ScanEye />{t('이 버전에서 줄별 작성자')}</button>
          <button type="button" className="btn" onClick={() => ws.run(t('파일 저장'), () => api.saveFileAtRevision(ws.repo, sel, path), (f) => (f ? t('저장했어요: {file}', { file: f }) : null))}><Download />{t('이 버전 저장')}</button>
          <button type="button" className="btn" onClick={() => { ws.focusCommit(sel); close() }}>{t('히스토리에서 보기')}</button>
        </>
      )}>
      <div className="split">
        <div className="split-list">
          {log.isPending && <p className="muted pad">{t('불러오는 중…')}</p>}
          {log.error && <p className="error pad">{errorText(log.error)}</p>}
          {log.data?.length === 0 && <p className="muted pad">{t('기록이 없어요 (아직 커밋하지 않은 파일)')}</p>}
          {log.data?.map((c) => (
            <button key={c.sha} type="button" className={`list-row ${c.sha === sel ? 'selected' : ''}`} onClick={() => setSha(c.sha)}>
              <b className="ellipsis">{c.subject}</b>
              <span className="muted small">{c.author} · {relativeTime(c.time)} · <span className="mono">{short(c.sha)}</span></span>
            </button>
          ))}
        </div>
        <DiffView path={sel ? path : null} raw={diff.data} loading={diff.isFetching && !diff.data} error={diff.error} />
      </div>
    </Dialog>
  )
}

export function BlameDialog({ ws, close, path, rev }: { ws: Ws; close: () => void; path: string; rev: string | null }) {
  const blame = useQuery({ queryKey: ['blame', ws.repo, path, rev], queryFn: () => api.blame(ws.repo, path, rev), staleTime: rev ? Infinity : 0 })
  // 커밋마다 색 하나 (연한 띠)
  const shade = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of blame.data ?? []) if (!m.has(l.sha)) m.set(l.sha, m.size % 6)
    return m
  }, [blame.data])
  return (
    <Dialog title={<>{tx('줄별 작성자 · {path}', { path: <span className="mono">{path}</span> })}{rev && <span className="muted"> @ {short(rev)}</span>}</>} icon={ScanEye} onClose={close} width={1200} className="big-dialog">
      <div className="blame" style={{ fontSize: ws.settings.diffFontSize }}>
        {blame.isPending && <p className="muted pad">{t('불러오는 중…')}</p>}
        {blame.error && <p className="error pad">{errorText(blame.error)}</p>}
        {blame.data && (
          <table>
            <tbody>
              {blame.data.map((l, i) => {
                const first = i === 0 || blame.data[i - 1].sha !== l.sha
                const uncommitted = /^0+$/.test(l.sha)
                return (
                  <tr key={i} className={`b${shade.get(l.sha)} ${first ? 'first' : ''}`}>
                    <td className="blame-who">
                      {first && (uncommitted ? <span className="muted">{t('아직 커밋 안 함')}</span> : (
                        <button type="button" className="blame-commit" title={`${l.summary}\n${fullDate(l.time)}`} onClick={() => { ws.focusCommit(l.sha); close() }}>
                          <span className="mono">{short(l.sha)}</span> <b>{l.author}</b> <span className="muted">{relativeTime(l.time)}</span>
                          <span className="blame-sum">{l.summary}</span>
                        </button>
                      ))}
                    </td>
                    <td className="ln">{l.line}</td>
                    <td className="code">{l.text || ' '}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  )
}
