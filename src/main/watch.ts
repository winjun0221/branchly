// 저장소 변화 감시: 몇 초마다 git status를 부르는 대신, 폴더가 바뀌었을 때만 화면에 알린다.
//   work = 작업 폴더 파일이 바뀜(변경 사항 새로고침), git = .git 안(커밋·브랜치·스태시·fetch 등)이 바뀜(전체 새로고침)
// 자주 바뀌어도 종류마다 잠깐(work 0.6초, git 0.3초)에 한 번만 알린다. 감시가 안 되는 곳은 화면의 주기적 새로고침이 받친다.
import fs from 'node:fs'
import path from 'node:path'

export type ChangeKind = 'work' | 'git'

const watching = new Map<string, fs.FSWatcher>()

/** .git 안에서 상태와 상관없는 것(객체 파일, 잠금 파일, fetch 중 임시 파일) */
const gitNoise = (rel: string) => rel.startsWith('.git/objects/') || rel.endsWith('.lock') || rel.startsWith('.git/lfs/tmp')

export function watchRepo(repo: string, notify: (repo: string, kind: ChangeKind) => void): void {
  if (watching.has(repo)) return
  const pending: Partial<Record<ChangeKind, NodeJS.Timeout>> = {}
  const fire = (kind: ChangeKind) => {
    if (pending[kind]) return
    pending[kind] = setTimeout(() => {
      pending[kind] = undefined
      notify(repo, kind)
    }, kind === 'git' ? 300 : 600)
  }
  try {
    const w = fs.watch(repo, { recursive: true }, (_event, name) => {
      if (!name) return fire('work')
      const rel = name.toString().replace(/\\/g, '/')
      if (rel === '.git' || rel.startsWith('.git/')) {
        if (!gitNoise(rel)) fire('git')
        return
      }
      if (/(^|\/)node_modules\//.test(rel)) return
      fire('work')
    })
    w.on('error', () => unwatchRepo(repo))
    watching.set(repo, w)
  } catch {
    // 감시를 못 하는 폴더(네트워크 드라이브 등)는 주기적 새로고침만
  }
}

export function unwatchRepo(repo: string): void {
  watching.get(repo)?.close()
  watching.delete(repo)
}

export const isWatching = (repo: string) => watching.has(path.resolve(repo))
