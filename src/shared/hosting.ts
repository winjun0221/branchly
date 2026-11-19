// 원격 주소 → 웹 주소 (GitHub·GitLab·Bitbucket). 테스트: test/hosting.test.ts

export type HostKind = 'github' | 'gitlab' | 'bitbucket' | 'other'

export interface WebRepo {
  base: string
  kind: HostKind
}

/** git@github.com:me/repo.git, ssh://git@host/me/repo.git, https://user:pw@host/me/repo.git → https://host/me/repo */
export function webRepo(remoteUrl: string): WebRepo | null {
  const url = remoteUrl.trim()
  let host = ''
  let path = ''
  let m = url.match(/^(?:[^@\s/]+@)?([^:/\s]+):(?!\/\/)(.+)$/) // scp 형식
  if (m && !/^[a-z]+:\/\//i.test(url)) {
    host = m[1]
    path = m[2]
  } else {
    m = url.match(/^(?:ssh|git|https?):\/\/(?:[^@/]+@)?([^/:]+)(?::(\d+))?\/(.+)$/i)
    if (!m) return null
    host = /^https?:/i.test(url) && m[2] ? `${m[1]}:${m[2]}` : m[1]
    path = m[3]
  }
  path = path.replace(/\.git\/?$/, '').replace(/\/+$/, '').replace(/^\/+/, '')
  // C:\repos\x 같은 로컬 경로(드라이브 글자 한 개 + 역슬래시)는 웹 주소가 없다
  if (!host || !path || /\s/.test(host) || /^[a-z]$/i.test(host) || path.includes('\\')) return null
  const h = host.toLowerCase()
  const kind: HostKind = h.includes('github') ? 'github' : h.includes('gitlab') ? 'gitlab' : h.includes('bitbucket') ? 'bitbucket' : 'other'
  return { base: `https://${host}/${path}`, kind }
}

const enc = (s: string) => encodeURIComponent(s).replace(/%2F/g, '/')

export function commitUrl(r: WebRepo, sha: string): string {
  if (r.kind === 'gitlab') return `${r.base}/-/commit/${sha}`
  if (r.kind === 'bitbucket') return `${r.base}/commits/${sha}`
  return `${r.base}/commit/${sha}`
}

export function branchUrl(r: WebRepo, branch: string): string {
  if (r.kind === 'gitlab') return `${r.base}/-/tree/${enc(branch)}`
  if (r.kind === 'bitbucket') return `${r.base}/branch/${enc(branch)}`
  return `${r.base}/tree/${enc(branch)}`
}

/** 풀 리퀘스트(머지 리퀘스트) 만들기 화면. 알 수 없는 호스팅이면 null */
export function pullRequestUrl(r: WebRepo, branch: string, target: string): string | null {
  if (r.kind === 'github') return `${r.base}/compare/${enc(target)}...${enc(branch)}?expand=1`
  if (r.kind === 'gitlab') {
    return `${r.base}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(target)}`
  }
  if (r.kind === 'bitbucket') return `${r.base}/pull-requests/new?source=${encodeURIComponent(branch)}&dest=${encodeURIComponent(target)}`
  return null
}
