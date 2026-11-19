// 설치된 git 실행. 셸을 거치지 않고 인자 배열로 넘기므로 경로·메시지에 특수 문자가 있어도 명령으로 해석되지 않는다.
import { spawn } from 'node:child_process'
import { t } from '../shared/i18n'

export class GitError extends Error {
  readonly code: number
  readonly stderr: string
  readonly stdout: string
  constructor(args: string[], code: number, stderr: string, stdout: string) {
    super((stderr.trim() || stdout.trim() || t('git {cmd} 실패 (코드 {code})', { cmd: args[0], code })).slice(0, 4000))
    this.code = code
    this.stderr = stderr
    this.stdout = stdout
  }
}

export interface GitResult {
  stdout: string
  stderr: string
}

export interface GitOptions {
  input?: string
  /** 0 말고도 정상으로 볼 종료 코드 (diff --no-index는 차이가 있으면 1) */
  okCodes?: number[]
  env?: Record<string, string>
}

/**
 * - core.quotepath=false: 한글 파일 이름을 \353\254... 로 감싸지 않음
 * - GIT_TERMINAL_PROMPT=0: 비밀번호를 터미널로 묻다가 멈추지 않음(Git Credential Manager 창은 그대로 뜸)
 * - GIT_EDITOR=true: 편집기를 띄우지 않음(병합·리베이스 계속 등). 메시지는 항상 인자·파일로 넘긴다
 */
function run(cwd: string, args: string[], opts: GitOptions): Promise<{ code: number; out: Buffer; err: Buffer }> {
  const full = ['-c', 'core.quotepath=false', '-c', 'color.ui=false', '-c', 'core.pager=cat', ...args]
  return new Promise((resolve, reject) => {
    const child = spawn('git', full, {
      cwd,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_EDITOR: 'true', LANG: process.env.LANG ?? 'C.UTF-8', ...opts.env },
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (b: Buffer) => out.push(b))
    child.stderr.on('data', (b: Buffer) => err.push(b))
    child.on('error', (e) => reject(new Error(t('git을 실행할 수 없습니다. Git이 설치돼 있는지 확인하세요. ({error})', { error: e.message }))))
    child.on('close', (code) => resolve({ code: code ?? -1, out: Buffer.concat(out), err: Buffer.concat(err) }))
    if (opts.input !== undefined) child.stdin.end(opts.input, 'utf8')
    else child.stdin.end()
  })
}

export async function git(cwd: string, args: string[], opts: GitOptions = {}): Promise<GitResult> {
  const r = await run(cwd, args, opts)
  const stdout = r.out.toString('utf8')
  const stderr = r.err.toString('utf8')
  if (r.code === 0 || (opts.okCodes ?? []).includes(r.code)) return { stdout, stderr }
  throw new GitError(args, r.code, stderr, stdout)
}

/** 바이너리 출력 (git show rev:path 로 이미지·파일 받기) */
export async function gitBuffer(cwd: string, args: string[]): Promise<Buffer> {
  const r = await run(cwd, args, {})
  if (r.code !== 0) throw new GitError(args, r.code, r.err.toString('utf8'), '')
  return r.out
}
