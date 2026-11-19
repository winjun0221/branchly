// 앱 설정: 화면 · 외부 프로그램 · 전역 사용자 정보 · SSH 키
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleArrowDown, Copy, KeyRound, LoaderCircle, Monitor, Moon, Plus, RefreshCw, Settings, Sun, SquareTerminal, UserRound } from 'lucide-react'
import type { AppSettings } from '../../../shared/types'
import { api, DEFAULT_SETTINGS, errorText, useSettings, useUpdateStatus } from '../api'
import { Check, Dialog, Field, Tabs } from '../components/Dialog'
import { t, tk } from '../i18n'
import { useUi } from '../ui'

type Tab = 'general' | 'identity' | 'ssh' | 'update'

export function AppSettingsDialog({ close, tab: initial = 'general' }: { close: () => void; tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial)
  return (
    <Dialog title={t('앱 설정')} icon={Settings} onClose={close} width={680} className="settings-dialog">
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'general', label: t('일반'), icon: Monitor },
        { value: 'identity', label: t('사용자 정보'), icon: UserRound },
        { value: 'ssh', label: t('SSH 키'), icon: KeyRound },
        { value: 'update', label: t('업데이트'), icon: CircleArrowDown },
      ]} />
      <div className="settings-pane">
        {tab === 'general' && <General />}
        {tab === 'identity' && <GlobalIdentity />}
        {tab === 'ssh' && <SshKeys />}
        {tab === 'update' && <Updates />}
      </div>
    </Dialog>
  )
}

function General() {
  const qc = useQueryClient()
  const ui = useUi()
  const current = useSettings().data ?? DEFAULT_SETTINGS
  const save = async (patch: Partial<AppSettings>) => {
    try {
      const next = await api.saveSettings({ ...current, ...patch })
      qc.setQueryData(['settings'], next)
    } catch (e) {
      ui.notify(errorText(e), 'error')
    }
  }
  const [editor, setEditor] = useState(current.editor)
  return (
    <>
      <Field label={t('테마')}>
        <div className="seg">
          {([['system', t('시스템 따라가기'), Monitor], ['light', t('밝게'), Sun], ['dark', t('어둡게'), Moon]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" className={current.theme === v ? 'on' : ''} onClick={() => save({ theme: v })}><Icon />{label}</button>
          ))}
        </div>
      </Field>
      <Field label={t('언어 (Language)')}>
        <div className="seg">
          {([['auto', t('시스템 따라가기')], ['ko', '한국어'], ['en', 'English']] as const).map(([v, label]) => ( // i18n-ignore
            <button key={v} type="button" className={current.language === v ? 'on' : ''} onClick={() => save({ language: v })}>{label}</button>
          ))}
        </div>
      </Field>
      <Field label={t('화면 배율')} hint={t('자동: 창을 키우면(최대화·전체 화면) 화면도 조금 커져요(1920px에서 약 115%). 단축키 Ctrl + = / Ctrl + - / Ctrl + 0(자동)')}>
        <div className="seg">
          {([[0, t('자동')], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']] as const).map(([v, label]) => (
            <button key={v} type="button" className={current.zoom === v ? 'on' : ''} onClick={() => save({ zoom: v })}>{label}</button>
          ))}
        </div>
      </Field>
      <Field label={t('원격 자동 Fetch')} hint={t('정해진 간격마다 원격의 새 커밋을 조용히 확인해서 ↓ 표시를 새로 고쳐요. 로그인이 필요한 원격은 건너뛰어요.')}>
        <div className="seg">
          {([[0, t('끄기')], [5, t('{n}분', { n: 5 })], [10, t('{n}분', { n: 10 })], [30, t('{n}분', { n: 30 })]] as const).map(([v, label]) => (
            <button key={v} type="button" className={current.autoFetchMinutes === v ? 'on' : ''} onClick={() => save({ autoFetchMinutes: v })}>{label}</button>
          ))}
        </div>
      </Field>
      <Field label={t('변경 내용 글자 크기')}>
        <div className="row">
          <input type="range" min={10} max={20} value={current.diffFontSize} onChange={(e) => save({ diffFontSize: Number(e.target.value) })} />
          <span className="mono">{current.diffFontSize}px</span>
        </div>
      </Field>
      <Check checked={current.syntaxHighlight} onChange={(v) => save({ syntaxHighlight: v })}>{t('변경 내용에 코드 색칠하기 (문법 강조)')}</Check>
      <Check checked={current.sideBySide} onChange={(v) => save({ sideBySide: v })}>{t('변경 내용을 기본으로 나란히(좌우) 보기')}</Check>
      <Check checked={current.ignoreWhitespace} onChange={(v) => save({ ignoreWhitespace: v })}>{t('기본으로 공백 변경 무시하기')}</Check>
      <Field label={t('외부 편집기')} hint={t('파일 열기에 쓸 실행 파일(.exe) 전체 경로. 비우면 Windows 기본 프로그램으로 열어요. 예: C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe')}>
        <div className="row">
          <SquareTerminal className="field-icon" />
          <input className="grow" value={editor} onChange={(e) => setEditor(e.target.value)} onBlur={() => editor !== current.editor && save({ editor })} placeholder={t('비우면 기본 프로그램')} />
        </div>
      </Field>
    </>
  )
}

function GlobalIdentity() {
  const ui = useUi()
  const id = useQuery({ queryKey: ['identity', null], queryFn: () => api.identity(null) })
  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const n = name ?? id.data?.name ?? ''
  const e = email ?? id.data?.email ?? ''
  return (
    <>
      <p className="muted">{t('모든 저장소의 커밋에 기본으로 쓰는 이름·이메일이에요 (git config --global). 저장소마다 따로 정하려면 저장소 설정을 쓰세요.')}</p>
      <div className="grid2">
        <Field label={t('이름')}><input value={n} onChange={(ev) => setName(ev.target.value)} /></Field>
        <Field label={t('이메일')}><input value={e} onChange={(ev) => setEmail(ev.target.value)} /></Field>
      </div>
      <div className="row end">
        <button type="button" className="btn primary" onClick={async () => {
          try {
            await api.setIdentity(null, { name: n, email: e })
            ui.notify(t('전역 사용자 정보를 저장했어요'), 'success')
            void id.refetch()
          } catch (err) {
            ui.notify(errorText(err), 'error')
          }
        }}>{t('저장')}</button>
      </div>
    </>
  )
}

function SshKeys() {
  const ui = useUi()
  const keys = useQuery({ queryKey: ['ssh-keys'], queryFn: () => api.sshKeys() })
  const [comment, setComment] = useState('')
  const [pass, setPass] = useState('')
  const [making, setMaking] = useState(false)
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text)
    ui.notify(t('공개 키를 복사했어요. GitHub·GitLab 설정의 SSH 키에 붙여 넣으세요.'), 'success')
  }
  return (
    <>
      <p className="muted">{t('SSH 주소(git@…)로 원격을 쓸 때 필요한 키예요. 공개 키(.pub)를 복사해서 호스팅 서비스에 등록하세요. 키 파일은 사용자 폴더의 .ssh에 있어요.')}</p>
      <div className="setting-list">
        {keys.data?.map((k) => (
          <div key={k.file} className="setting-row">
            <KeyRound />
            <span className="grow ellipsis">
              <b>{k.file.split(/[\\/]/).pop()}</b> <span className="muted small">{k.type} · {k.comment || t('설명 없음')}</span>
            </span>
            <button type="button" className="btn small" onClick={() => copy(k.publicKey)}><Copy />{t('공개 키 복사')}</button>
          </div>
        ))}
        {keys.data?.length === 0 && <p className="muted">{t('SSH 키가 없어요. 아래에서 새로 만들 수 있어요.')}</p>}
        {keys.error && <p className="error">{errorText(keys.error)}</p>}
      </div>
      <div className="add-row">
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('설명 (보통 이메일)')} className="grow" />
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('암호 (선택)')} style={{ width: 160 }} autoComplete="new-password" />
        <button type="button" className="btn" disabled={making} onClick={async () => {
          setMaking(true)
          try {
            const k = await api.generateSshKey(comment, pass)
            setPass('')
            void keys.refetch()
            copy(k.publicKey)
          } catch (err) {
            ui.notify(errorText(err), 'error')
          } finally {
            setMaking(false)
          }
        }}><Plus />{t('새 키 만들기 (ed25519)')}</button>
      </div>
    </>
  )
}

const STATE_TEXT = {
  disabled: tk('꺼져 있어요'),
  idle: tk('아직 확인하지 않았어요'),
  checking: tk('확인하는 중…'),
  latest: tk('최신 버전이에요'),
  downloading: tk('새 버전을 받는 중'),
  ready: tk('새 버전을 받아 뒀어요'),
  error: tk('확인하지 못했어요'),
} as const

function Updates() {
  const ui = useUi()
  const qc = useQueryClient()
  const current = useSettings().data ?? DEFAULT_SETTINGS
  const st = useUpdateStatus()
  const s = st.data
  const save = async (patch: Partial<AppSettings>) => {
    try {
      qc.setQueryData(['settings'], await api.saveSettings({ ...current, ...patch }))
      void st.refetch()
      return true
    } catch (e) {
      ui.notify(errorText(e), 'error')
      return false
    }
  }
  return (
    <>
      <div className="update-box">
        <div>
          <b>Branchly {s?.current ?? ''}</b>
          <div className={`muted small ${s?.state === 'error' ? 'error' : ''}`}>
            {s ? t(STATE_TEXT[s.state]) : '…'}
            {s?.newVersion && (s.state === 'downloading' || s.state === 'ready') && ` · ${s.newVersion}`}
            {s?.state === 'downloading' && ` ${s.progress ?? 0}%`}
            {s?.message && ` — ${s.message}`}
            {s?.checkedAt && s.state === 'latest' && ` · ${t('{time} 확인', { time: new Date(s.checkedAt).toLocaleTimeString() })}`}
          </div>
          {s?.state === 'downloading' && <div className="progress"><span style={{ width: `${s.progress ?? 0}%` }} /></div>}
        </div>
        <span className="spacer" />
        {s?.state === 'ready'
          ? <button type="button" className="btn primary" onClick={() => api.installUpdate().catch((e) => ui.notify(errorText(e), 'error'))}><RefreshCw />{t('다시 시작해서 설치')}</button>
          : <button type="button" className="btn" disabled={!s || s.state === 'disabled' || s.state === 'checking' || s.state === 'downloading'}
              onClick={async () => { qc.setQueryData(['update'], await api.checkForUpdates()) }}>
              {s?.state === 'checking' ? <LoaderCircle className="spin" /> : <RefreshCw />}{t('지금 확인')}
            </button>}
      </div>
      <Check checked={current.autoUpdate} onChange={(v) => void save({ autoUpdate: v })}>{t('켤 때와 4시간마다 새 버전 확인하고 미리 받아 두기')}</Check>
      <p className="muted small">{t('받아 둔 새 버전은 "다시 시작해서 설치"를 누르거나, 다음에 앱을 끌 때 조용히 설치돼요. 포터블 exe와 개발 버전은 자동 업데이트를 하지 않아요.')}</p>
    </>
  )
}
