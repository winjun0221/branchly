import type { MouseEvent, ReactNode } from 'react'
import { ChevronRight, Folder } from 'lucide-react'
import type { FileChange } from '../../../shared/types'
import { CHANGE_LABEL, splitPath } from '../format'
import { t } from '../i18n'

/** 변경 종류 배지 (M 수정, A 추가 …) */
export function KindBadge({ kind }: { kind: FileChange['kind'] }) {
  const k = kind === '?' ? 'N' : kind
  return <span className={`kind kind-${k}`} title={t(CHANGE_LABEL[kind])}>{k}</span>
}

/** 파일 한 줄: 종류 · 파일 이름 + 폴더(흐리게), 오른쪽에 동작 버튼 */
export function FileRow({ file, selected, onSelect, onContextMenu, onDoubleClick, action, nameOnly, depth = 0 }: {
  file: FileChange
  selected: boolean
  onSelect: (e: MouseEvent) => void
  onContextMenu?: (e: MouseEvent) => void
  onDoubleClick?: () => void
  action?: ReactNode
  /** 트리 보기: 폴더는 빼고 이름만 */
  nameOnly?: boolean
  depth?: number
}) {
  const [dir, name] = splitPath(file.path)
  return (
    <div className={`file-row ${selected ? 'selected' : ''}`} style={depth ? { paddingLeft: 14 + depth * 14 } : undefined}
      onMouseDown={onSelect} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick}
      title={file.origPath ? `${file.origPath} → ${file.path}` : file.path}>
      <KindBadge kind={file.kind} />
      <span className="file-path">
        <span className="file-name">{name}</span>
        {!nameOnly && dir && <span className="file-dir">{dir.replace(/\/$/, '')}</span>}
      </span>
      {action && <span className="file-action" onMouseDown={(e) => e.stopPropagation()}>{action}</span>}
    </div>
  )
}

/** 파일을 폴더 트리로 (한 자식뿐인 폴더는 a/b/c처럼 합쳐서) */
export interface FileTreeNode {
  name: string
  path: string
  folders: FileTreeNode[]
  files: FileChange[]
}

export function buildFileTree(files: FileChange[]): FileTreeNode {
  const root: FileTreeNode = { name: '', path: '', folders: [], files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join('/')
      let next = node.folders.find((x) => x.path === p)
      if (!next) {
        next = { name: parts[i], path: p, folders: [], files: [] }
        node.folders.push(next)
      }
      node = next
    }
    node.files.push(f)
  }
  const squash = (n: FileTreeNode): FileTreeNode => {
    n.folders = n.folders.map(squash)
    if (n.path && n.files.length === 0 && n.folders.length === 1) {
      const c = n.folders[0]
      return { ...c, name: `${n.name}/${c.name}` }
    }
    return n
  }
  return squash(root)
}

export function FolderRow({ node, depth, open, onToggle, onContextMenu }: { node: FileTreeNode; depth: number; open: boolean; onToggle: () => void; onContextMenu?: (e: MouseEvent) => void }) {
  return (
    <div className={`file-row folder-row ${open ? 'open' : ''}`} style={{ paddingLeft: 8 + depth * 14 }} onMouseDown={onToggle} onContextMenu={onContextMenu}>
      <ChevronRight className="fold" />
      <Folder className="folder-icon" />
      <span className="file-name">{node.name}</span>
    </div>
  )
}
