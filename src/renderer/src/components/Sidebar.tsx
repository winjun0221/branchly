import { useMemo, useState, type ReactNode } from 'react'
import { Archive, Boxes, Check, ChevronRight, Cloud, FilePen, Folder, GitBranch, History, Plus, Search, Tag, X } from 'lucide-react'
import type { Branch } from '../../../shared/types'
import { useSubmodules } from '../api'
import { useActions } from '../actions'
import { relativeTime } from '../format'
import { t } from '../i18n'
import { useUi } from '../ui'
import { useWs } from '../ws'

/** 왼쪽: 작업 공간 + 브랜치(폴더로 묶음)·원격·태그·스태시·서브모듈. 클릭 = 히스토리에서 보기, 더블클릭 = 체크아웃, 오른쪽 클릭 = 메뉴 */
export default function Sidebar() {
  const ws = useWs()
  const ui = useUi()
  const a = useActions()
  const subs = useSubmodules(ws.repo)
  const [filter, setFilter] = useState('')
  const f = filter.trim().toLowerCase()
  const match = (name: string) => !f || name.toLowerCase().includes(f)
  const s = ws.status
  const changeCount = s ? new Set([...s.staged, ...s.unstaged, ...s.conflicted].map((x) => x.path)).size : 0
  const b = ws.branches

  const local = (b?.local ?? []).filter((x) => match(x.name))
  const remoteGroups = useMemo(() => {
    const groups = new Map<string, { name: string; sha: string }[]>()
    for (const r of ws.remotes) groups.set(r.name, [])
    for (const rb of b?.remote ?? []) {
      const owner = ws.remotes.filter((r) => rb.name.startsWith(r.name + '/')).sort((x, y) => y.name.length - x.name.length)[0]?.name ?? rb.name.split('/')[0]
      if (!groups.has(owner)) groups.set(owner, [])
      groups.get(owner)!.push(rb)
    }
    return [...groups.entries()]
  }, [b?.remote, ws.remotes])
  const tags = (b?.tags ?? []).filter((t) => match(t.name)).sort((x, y) => y.name.localeCompare(x.name, undefined, { numeric: true }))

  return (
    <aside className="sidebar">
      <div className="side-group">
        <button className={`side-item ${ws.view === 'changes' ? 'active' : ''}`} onClick={() => ws.setView('changes')}>
          <FilePen />{t('변경 사항')}{changeCount > 0 && <span className="count">{changeCount}</span>}
        </button>
        <button className={`side-item ${ws.view === 'history' ? 'active' : ''}`} onClick={() => ws.setView('history')}>
          <History />{t('히스토리')}
        </button>
      </div>

      <div className="side-search">
        <Search />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('브랜치·태그 찾기')} />
        {filter && <button className="icon-btn small" onClick={() => setFilter('')} aria-label={t('지우기')}><X /></button>}
      </div>

      <Section id="branches" title={t('브랜치|section')} count={b?.local.length} defaultOpen action={{ label: t('새 브랜치'), onClick: () => a.newBranch() }}>
        <Tree<Branch>
          items={local}
          id="local"
          forceOpen={!!f}
          render={(x, leaf) => (
            <button key={x.name}
              className={`side-item side-ref ${x.current ? 'current' : ''}`}
              onClick={() => ws.focusCommit(x.sha)}
              onDoubleClick={() => !x.current && void a.checkout(x.name)}
              onContextMenu={(e) => ui.menu(e, a.branchMenu(x))}
              title={x.upstream ? (x.gone ? t('{name} → {upstream} (원격에서 지워짐)', { name: x.name, upstream: x.upstream }) : `${x.name} → ${x.upstream}`) : x.name}>
              {x.current ? <Check /> : <GitBranch />}
              <span className="ellipsis">{leaf}</span>
              <span className="side-badges">
                {x.ahead > 0 && <span className="ab up">↑{x.ahead}</span>}
                {x.behind > 0 && <span className="ab down">↓{x.behind}</span>}
                {x.gone && <span className="gone" title={t('추적하던 원격 브랜치가 지워졌어요')}>×</span>}
              </span>
            </button>
          )}
        />
        {b && b.local.length === 0 && <p className="side-empty">{t('아직 브랜치가 없어요')}</p>}
      </Section>

      <Section id="remotes" title={t('원격|section')} count={b?.remote.length} defaultOpen={false} action={{ label: t('원격 추가'), onClick: () => a.repoSettings('remotes') }}>
        {remoteGroups.map(([remote, list]) => (
          <Folderish key={remote} id={`remote:${remote}`} label={remote} icon={<Cloud />} forceOpen={!!f}>
            <Tree<{ name: string; sha: string; short: string }>
              items={list.map((x) => ({ ...x, short: x.name.slice(remote.length + 1) })).filter((x) => match(x.name))}
              id={`r:${remote}`}
              nameOf={(x) => x.short}
              forceOpen={!!f}
              depth={1}
              render={(x, leaf) => (
                <button key={x.name} className="side-item side-ref"
                  onClick={() => ws.focusCommit(x.sha)}
                  onDoubleClick={() => a.checkoutRemote(x.name)}
                  onContextMenu={(e) => ui.menu(e, a.remoteBranchMenu(x.name))}
                  title={x.name}>
                  <GitBranch /><span className="ellipsis">{leaf}</span>
                </button>
              )}
            />
            {list.length === 0 && <p className="side-empty">{t('아직 Fetch 전이에요')}</p>}
          </Folderish>
        ))}
        {ws.remotes.length === 0 && <p className="side-empty">{t('원격 저장소가 없어요')}</p>}
      </Section>

      <Section id="tags" title={t('태그')} count={b?.tags.length} defaultOpen={false}>
        {tags.map((tg) => (
          <button key={tg.name} className="side-item side-ref" onClick={() => ws.focusCommit(tg.sha)} onContextMenu={(e) => ui.menu(e, a.tagMenu(tg))} title={tg.annotated ? t('{name} (주석 태그)', { name: tg.name }) : tg.name}>
            <Tag /><span className="ellipsis">{tg.name}</span>
          </button>
        ))}
        {b && b.tags.length === 0 && <p className="side-empty">{t('태그가 없어요')}</p>}
      </Section>

      <Section id="stashes" title={t('스태시')} count={ws.stashes.length} defaultOpen={ws.stashes.length > 0} action={{ label: t('스태시'), onClick: a.stash }}>
        {ws.stashes.map((st) => (
          <button key={st.sha} className="side-item side-ref stash" onClick={() => a.showStash(st)} onContextMenu={(e) => ui.menu(e, a.stashMenu(st))} title={st.message}>
            <Archive />
            <span className="ellipsis">{st.message || t('스태시 #{n}', { n: st.index })}</span>
            <span className="side-badges muted small">{relativeTime(st.time)}</span>
          </button>
        ))}
        {ws.stashes.length === 0 && <p className="side-empty">{t('넣어 둔 변경이 없어요')}</p>}
      </Section>

      {!!subs.data?.length && (
        <Section id="subs" title={t('서브모듈')} count={subs.data.length} defaultOpen={false}>
          {subs.data.map((m) => (
            <button key={m.path} className="side-item side-ref" onClick={() => a.repoSettings('submodules')} title={`${m.path} · ${m.sha.slice(0, 7)}`}>
              <Boxes /><span className="ellipsis">{m.path}</span>
              {m.state !== 'ok' && <span className={`side-badges pill s-${m.state}`}>{m.state === 'uninitialized' ? t('받지 않음') : m.state === 'modified' ? t('바뀜') : t('충돌')}</span>}
            </button>
          ))}
        </Section>
      )}
    </aside>
  )
}

// 접힘 상태는 저장소를 바꿔도 유지 (세션 동안)
const closed = new Set<string>()

function useFold(id: string, defaultOpen: boolean): [boolean, () => void] {
  const [, force] = useState(0)
  const key = (defaultOpen ? 'o:' : 'c:') + id
  const open = defaultOpen ? !closed.has(key) : closed.has(key)
  return [open, () => {
    if (closed.has(key)) closed.delete(key)
    else closed.add(key)
    force((n) => n + 1)
  }]
}

function Section({ id, title, count, defaultOpen, action, children }: {
  id: string
  title: string
  count?: number
  defaultOpen: boolean
  action?: { label: string; onClick: () => void }
  children: ReactNode
}) {
  const [open, toggle] = useFold('section:' + id, defaultOpen)
  return (
    <section className="side-section">
      <div className="side-head-row">
        <button className={`side-head ${open ? 'open' : ''}`} onClick={toggle} aria-expanded={open}>
          <ChevronRight />
          {title}
          {count !== undefined && count > 0 && <span className="muted">{count}</span>}
        </button>
        {action && <button className="icon-btn small side-add" title={action.label} aria-label={action.label} onClick={action.onClick}><Plus /></button>}
      </div>
      {open && <div className="side-list">{children}</div>}
    </section>
  )
}

function Folderish({ id, label, icon, children, forceOpen, depth = 0 }: { id: string; label: string; icon?: ReactNode; children: ReactNode; forceOpen?: boolean; depth?: number }) {
  const [open, toggle] = useFold(id, true)
  const show = open || forceOpen
  return (
    <div className="side-folder">
      <button className={`side-item side-ref folder ${show ? 'open' : ''}`} style={{ paddingLeft: 10 + depth * 12 }} onClick={toggle}>
        <ChevronRight className="fold" />
        {icon ?? <Folder />}
        <span className="ellipsis">{label}</span>
      </button>
      {show && <div className="side-children">{children}</div>}
    </div>
  )
}

/** "feature/login/ui" 같은 이름을 폴더로 묶어 보여 준다 */
function Tree<T extends { name: string }>({ items, id, render, nameOf = (x) => x.name, forceOpen, depth = 0 }: {
  items: T[]
  id: string
  render: (x: T, leaf: string) => ReactNode
  nameOf?: (x: T) => string
  forceOpen?: boolean
  depth?: number
}) {
  const folders = new Map<string, T[]>()
  const leaves: T[] = []
  for (const x of items) {
    const n = nameOf(x)
    const i = n.indexOf('/')
    if (i > 0) {
      const k = n.slice(0, i)
      if (!folders.has(k)) folders.set(k, [])
      folders.get(k)!.push(x)
    } else leaves.push(x)
  }
  return (
    <>
      {[...folders.entries()].map(([folder, list]) => (
        <Folderish key={folder} id={`${id}/${folder}`} label={folder} forceOpen={forceOpen} depth={depth}>
          <Tree<T>
            items={list}
            id={`${id}/${folder}`}
            nameOf={(x) => nameOf(x).slice(folder.length + 1)}
            render={render}
            forceOpen={forceOpen}
            depth={depth + 1}
          />
        </Folderish>
      ))}
      {leaves.map((x) => <div key={x.name} style={{ paddingLeft: depth * 12 }}>{render(x, nameOf(x))}</div>)}
    </>
  )
}
