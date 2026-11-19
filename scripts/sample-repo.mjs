// 화면 확인용 샘플 저장소: 여러 브랜치·병합·태그·원격(앞섬)·한글 파일·작업 중 변경
// 사용: node scripts/sample-repo.mjs <만들 폴더>   (e2e.mjs도 이걸 쓴다)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function makeSampleRepo(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const origin = dir + '-origin.git'
  let day = 0
  const base = Date.UTC(2026, 9, 20, 1, 0, 0) / 1000 // 2026-10-20
  const git = (args, who = ['김개발', 'kim@example.com']) => {
    const t = `${base + day * 86400 + Math.floor(Math.random() * 3600 * 8)} +0900`
    return execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: who[0], GIT_AUTHOR_EMAIL: who[1], GIT_COMMITTER_NAME: who[0], GIT_COMMITTER_EMAIL: who[1], GIT_AUTHOR_DATE: t, GIT_COMMITTER_DATE: t },
    })
  }
  const write = (f, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    fs.writeFileSync(path.join(dir, f), text)
  }
  const commit = (msg, who) => { git(['add', '-A'], who); git(['commit', '-q', '-m', msg], who); day++ }
  const LEE = ['이기획', 'lee@example.com']
  const PARK = ['박운영', 'park@example.com']

  git(['init', '-q', '-b', 'main'])
  git(['config', 'core.autocrlf', 'false'])
  // 앱에서 만드는 커밋(e2e)이 이 PC의 전역 git 사용자 정보를 쓰지 않게, 저장소 전용 테스트 사용자
  git(['config', 'user.name', 'Branchly 테스트'])
  git(['config', 'user.email', 'test@example.com'])
  write('README.md', '# 샘플 프로젝트\n\n소개 문서입니다.\n')
  commit('프로젝트 시작')
  write('src/app.ts', 'export function main() {\n  console.log("hello")\n}\n')
  write('package.json', '{\n  "name": "sample"\n}\n')
  commit('앱 뼈대 추가')
  git(['tag', 'v0.1'])

  git(['checkout', '-q', '-b', 'feature/login'])
  write('src/login.ts', 'export function login(id: string) {\n  return id.length > 0\n}\n')
  commit('로그인 화면 추가', LEE)
  write('src/login.ts', 'export function login(id: string, pw: string) {\n  return id.length > 0 && pw.length >= 8\n}\n')
  commit('비밀번호 길이 검사', LEE)

  git(['checkout', '-q', 'main'])
  write('README.md', '# 샘플 프로젝트\n\n소개 문서입니다.\n\n## 설치\n\nnpm install\n')
  commit('설치 방법 문서화', PARK)
  git(['merge', '-q', '--no-ff', '-m', "Merge branch 'feature/login'", 'feature/login'], LEE)
  day++

  git(['checkout', '-q', '-b', 'hotfix/crash', 'v0.1'])
  write('src/app.ts', 'export function main() {\n  try {\n    console.log("hello")\n  } catch (e) {\n    console.error(e)\n  }\n}\n')
  commit('시작할 때 멈추는 문제 수정', PARK)
  git(['checkout', '-q', 'main'])
  git(['merge', '-q', '--no-ff', '-m', "Merge branch 'hotfix/crash'", 'hotfix/crash'], PARK)
  day++
  git(['tag', 'v0.2'])

  git(['checkout', '-q', '-b', 'feature/graph'])
  write('src/graph.ts', 'export const lanes: string[] = []\n')
  commit('커밋 그래프 시작', LEE)
  write('src/graph.ts', 'export const lanes: string[] = []\nexport const colors = 8\n')
  commit('그래프 색 추가', LEE)

  git(['checkout', '-q', 'main'])
  write('docs/회의록.md', '# 회의록\n\n- 배포 일정 확인\n')
  commit('회의록 추가')

  // 원격: 지금까지 올리고, 하나 더 커밋해서 "앞섬 1"
  execFileSync('git', ['init', '-q', '--bare', origin])
  git(['remote', 'add', 'origin', origin])
  git(['push', '-q', '-u', 'origin', 'main', 'feature/graph'])
  write('src/app.ts', fs.readFileSync(path.join(dir, 'src/app.ts'), 'utf8') + '\nexport const version = "0.3"\n')
  commit('버전 표시')

  // 작업 중 변경: 스테이지된 것 1, 안 된 것 1, 새 파일 1
  write('package.json', '{\n  "name": "sample",\n  "version": "0.3.0"\n}\n')
  git(['add', 'package.json'])
  write('README.md', fs.readFileSync(path.join(dir, 'README.md'), 'utf8') + '\n## 사용법\n\nnpm start\n')
  write('docs/새 기능 메모.md', '# 새 기능\n\n- 브랜치 전환\n- 스태시\n')
  return { dir, origin }
}

if (process.argv[1] && process.argv[1].endsWith('sample-repo.mjs')) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('사용: node scripts/sample-repo.mjs <폴더>')
    process.exit(1)
  }
  console.log(makeSampleRepo(path.resolve(dir)).dir)
}
