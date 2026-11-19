// 실제 앱을 띄워 확인: 히스토리·검색·메뉴 → 브랜치·태그 → 줄 단위 스테이지·커밋 → 스태시 → 대화형 리베이스
// → 병합 충돌 해결 → 올리기 → 설정·파일 기록·blame·새 탭
// 사용: npm run e2e  (스크린샷: E2E_OUT 폴더, 기본은 임시 폴더)
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeSampleRepo } from './sample-repo.mjs'

const out = path.resolve(process.env.E2E_OUT || path.join(os.tmpdir(), 'branchly-e2e'))
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
const { dir: repo, origin } = makeSampleRepo(path.join(out, 'sample'))
// 앱이 이 PC의 전역 git 설정(서명·pull 방식·사용자 정보)을 읽거나 바꾸지 않게
const globalConfig = path.join(out, 'global.gitconfig')
fs.writeFileSync(globalConfig, '[core]\n\tautocrlf = false\n')
const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=false', ...a], {
  cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_GLOBAL: globalConfig },
}).trim()
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** git 상태가 바뀔 때까지 기다림 */
async function until(fn, ms = 10000) {
  const end = Date.now() + ms
  for (;;) {
    try {
      if (await fn()) return true
    } catch {}
    if (Date.now() > end) return false
    await sleep(150)
  }
}

// 한국어로 시작 (선택자가 한국어 문구를 씀). 끝에서 영어로 바꿔 확인한다
fs.mkdirSync(path.join(out, 'userdata'), { recursive: true })
fs.writeFileSync(path.join(out, 'userdata', 'settings.json'), JSON.stringify({ language: 'ko' }))

const electronPath = (await import('electron')).default
const app = await electron.launch({
  executablePath: electronPath,
  args: ['.'],
  env: { ...process.env, BRANCHLY_OPEN: repo, BRANCHLY_USER_DATA: path.join(out, 'userdata'), GIT_CONFIG_GLOBAL: globalConfig },
})
const shot = (win, name) => win.screenshot({ path: path.join(out, name) })

try {
  const win = await app.firstWindow()
  await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
  const menu = async (target, item) => {
    await target.click({ button: 'right' })
    await win.locator('.ctx-menu .menu-item', { hasText: item }).first().click()
  }
  const submit = () => win.locator('.dialog button[type=submit]').last().click()

  // ── 히스토리 ──
  await win.waitForSelector('.commit-row', { timeout: 20000 })
  const rows = await win.locator('.commit-row').count()
  check('history shows commits', rows >= 10, `${rows} rows`)
  check('repo tab', (await win.locator('.tab.on').innerText()).includes('sample'))
  check('branch chip shows ahead 1', (await win.locator('.branch-chip').innerText()).includes('↑1'))
  check('ref badges', (await win.locator('.ref.head').count()) === 1 && (await win.locator('.ref.tag').count()) >= 2)
  check('uncommitted row', (await win.locator('.pending-row').innerText()).includes('3'))
  await win.waitForSelector('.detail-meta h2')
  await shot(win, '1-history.png')

  // 병합 커밋 상세
  await win.locator('.commit-row', { hasText: "Merge branch 'feature/login'" }).click()
  await win.waitForFunction(() => document.querySelector('.detail-meta h2')?.textContent?.includes('feature/login'))
  await win.waitForSelector('.diff-table .line', { timeout: 10000 })
  check('merge commit detail lists files', (await win.locator('.detail-files .file-row').count()) >= 1)

  // 사이드바: feature 폴더 안 graph 브랜치 → 그 커밋
  await win.locator('.side-item.side-ref:not(.folder)', { hasText: /^graph$/ }).click()
  await win.waitForFunction(() => document.querySelector('.commit-row.selected')?.textContent?.includes('그래프 색 추가'))
  check('sidebar branch folder → focuses its commit', true)

  // 검색·범위
  await win.fill('.search-box input', '로그인')
  await win.press('.search-box input', 'Enter')
  check('search by message', await until(async () => (await win.locator('.commit-row').count()) === 1))
  await win.selectOption('.search-box select', 'file')
  await win.fill('.search-box input', 'graph')
  await win.press('.search-box input', 'Enter')
  check('search by file', await until(async () => (await win.locator('.commit-row').count()) === 2))
  await win.locator('.search-box .icon-btn').click()
  await win.locator('.history-bar .seg button', { hasText: '현재 브랜치' }).click()
  check('scope: current branch hides feature/graph', await until(async () => (await win.locator('.commit-row', { hasText: '그래프 색 추가' }).count()) === 0))
  await win.locator('.history-bar .seg button', { hasText: '모든 브랜치' }).click()
  await win.waitForSelector('.commit-row >> text=그래프 색 추가')

  // 두 커밋 비교 (Ctrl+클릭)
  await win.locator('.commit-row', { hasText: '프로젝트 시작' }).click()
  await win.locator('.commit-row', { hasText: '앱 뼈대 추가' }).click({ modifiers: ['Control'] })
  check('compare two commits', await until(async () => (await win.locator('.compare-bar').count()) === 1 && (await win.locator('.detail-files .file-row').count()) === 2))
  await win.locator('.compare-bar .btn').click()

  // 커밋 메뉴 → 태그
  const head = win.locator('.commit-row', { hasText: '버전 표시' })
  await head.click({ button: 'right' })
  await win.waitForSelector('.ctx-menu')
  await shot(win, '2-commit-menu.png')
  await win.locator('.ctx-menu .menu-item', { hasText: '태그 만들기' }).click()
  await win.fill('.dialog input', 'v0.3-e2e')
  await win.fill('.dialog textarea', 'e2e 태그')
  await submit()
  check('create annotated tag', await until(() => git('cat-file', '-t', 'v0.3-e2e') === 'tag'))

  // 새 브랜치 (체크아웃 안 함)
  await win.locator('.tool-btn', { hasText: '브랜치' }).click()
  await win.fill('.dialog input', 'feature/e2e')
  await win.locator('.dialog .check input').uncheck()
  await submit()
  check('create branch', await until(() => git('branch', '--list', 'feature/e2e').includes('feature/e2e')) && git('branch', '--show-current') === 'main')

  // ── 변경 사항: 줄 단위 스테이지 ──
  await win.locator('.side-item', { hasText: '변경 사항' }).click()
  await win.waitForSelector('.changes .file-row')
  const section = (i) => win.locator('.file-section').nth(i)
  check('changes lists staged and unstaged', (await section(0).locator('.file-row').count()) === 1 && (await section(1).locator('.file-row').count()) === 2)
  await section(1).locator('.file-row', { hasText: 'README.md' }).click()
  await win.waitForSelector('.diff-table .hunk-btn')
  const usage = win.locator('.diff-table tr.line.add', { hasText: '## 사용법' })
  await usage.locator('td.ln').nth(1).click()
  await win.waitForSelector('.line-bar')
  await shot(win, '3-line-staging.png')
  await win.locator('.line-bar .btn.primary').click()
  check('stage one line', await until(() => {
    const cached = git('diff', '--cached', '--', 'README.md')
    return cached.includes('+## 사용법') && !cached.includes('+npm start')
  }))

  // 새 한글 파일 올리기 → 커밋
  await section(1).locator('.file-row', { hasText: '새 기능 메모.md' }).hover()
  await section(1).locator('.file-row', { hasText: '새 기능 메모.md' }).locator('.mini-btn[title="스테이지에 올리기"]').click()
  check('stage file', await until(() => git('diff', '--cached', '--name-only').includes('새 기능 메모.md')))
  await win.fill('.commit-summary', '새 기능 메모와 버전 올림')
  await win.fill('.commit-desc', 'e2e 테스트에서 만든 커밋')
  await win.locator('.commit-actions .btn.primary').click()
  check('commit created', await until(() => git('log', '-1', '--format=%s') === '새 기능 메모와 버전 올림'))
  check('rest of README stays unstaged', git('diff', '--', 'README.md').includes('+npm start'))

  // ── 스태시 ──
  await win.locator('.tool-btn', { hasText: '스태시' }).click()
  await win.fill('.dialog input', 'README 작업 중')
  await submit()
  check('stash save', await until(() => git('stash', 'list').includes('README 작업 중')))
  await win.waitForSelector('.side-item.stash')

  // ── 대화형 리베이스: 마지막 커밋 메시지 고치기 ──
  await win.locator('.side-item', { hasText: '히스토리' }).click()
  await menu(win.locator('.commit-row', { hasText: '회의록 추가' }), '대화형 리베이스')
  await win.waitForSelector('.rebase-row')
  check('rebase dialog lists 2 commits', (await win.locator('.rebase-row').count()) === 2)
  await win.locator('.rebase-row').nth(1).locator('select').selectOption('reword')
  await win.locator('.rebase-msg').fill('새 기능 메모 (리베이스로 고침)')
  await win.locator('.dialog-head h2').click() // 편집 끝
  await shot(win, '4-interactive-rebase.png')
  await submit()
  check('interactive rebase reword', await until(() => git('log', '-1', '--format=%s') === '새 기능 메모 (리베이스로 고침)'))

  // 스태시 꺼내기 (사이드바 메뉴)
  await menu(win.locator('.side-item.stash').first(), '꺼내기')
  check('stash pop', await until(() => git('stash', 'list') === '' && git('diff', '--', 'README.md').includes('+npm start')))

  // ── 병합 충돌 → 상대 쪽으로 해결 → 계속 ──
  // 작업 폴더(README 변경 중)는 그대로 두고, 임시 작업 트리에서 충돌 브랜치를 만든다
  const wt = path.join(out, 'wt')
  git('worktree', 'add', '-q', '-b', 'conflict', wt, 'HEAD~2')
  fs.writeFileSync(path.join(wt, 'docs', '회의록.md'), '# 회의록\n\n- 다른 쪽에서 고친 줄\n')
  execFileSync('git', ['commit', '-q', '-am', '충돌 만들기'], { cwd: wt, env: { ...process.env, GIT_CONFIG_GLOBAL: globalConfig } })
  git('worktree', 'remove', '--force', wt)
  fs.writeFileSync(path.join(repo, 'docs', '회의록.md'), '# 회의록\n\n- 메인에서 고친 줄\n')
  git('commit', '-q', '-m', '메인 쪽 회의록', '--', 'docs/회의록.md') // README 작업 중 변경은 남겨 둠
  // 앱 밖(git 명령)에서 만든 브랜치·커밋을 알아채는지 (5초마다 상태 확인 → HEAD 바뀜 → 목록 새로고침)
  check('notices outside commit', await until(async () => (await win.locator('.side-item.side-ref', { hasText: /^conflict$/ }).count()) === 1, 15000))
  await win.locator('.tool-btn', { hasText: '병합' }).click()
  await win.locator('.ctx-menu .menu-item', { hasText: /^conflict$/ }).click()
  await submit()
  await win.waitForSelector('.op-banner.warn', { timeout: 15000 })
  check('merge conflict banner', (await win.locator('.op-banner').innerText()).includes('병합 진행 중'))
  await win.waitForSelector('.file-section.danger .file-row')
  await win.locator('.file-section.danger .file-row').click()
  await win.waitForSelector('.diff-table.conflict')
  await shot(win, '5-conflict.png')
  await menu(win.locator('.file-section.danger .file-row'), '상대 쪽')
  await win.waitForSelector('.op-banner.ok', { timeout: 10000 })
  await win.locator('.op-banner .btn.primary').click()
  check('merge completed', await until(() => git('log', '-1', '--format=%P').split(' ').length === 2 && fs.readFileSync(path.join(repo, 'docs', '회의록.md'), 'utf8').includes('다른 쪽')))

  // ── 올리기 ──
  await win.locator('.tool-btn', { hasText: 'Push' }).click()
  await win.waitForSelector('.dialog .pick-row')
  await submit()
  check('push main', await until(() => execFileSync('git', ['rev-parse', 'main'], { cwd: origin, encoding: 'utf8' }).trim() === git('rev-parse', 'main')))

  // ── 파일 기록·blame ──
  await win.locator('.side-item', { hasText: '히스토리' }).click()
  await win.locator('.commit-row', { hasText: '앱 뼈대 추가' }).click()
  await win.waitForSelector('.detail-files .file-row')
  await menu(win.locator('.detail-files .file-row', { hasText: 'app.ts' }), '파일 기록')
  await win.waitForSelector('.split-list .list-row')
  check('file history', (await win.locator('.split-list .list-row').count()) >= 3)
  await shot(win, '6-file-history.png')
  await win.locator('.dialog-foot .btn', { hasText: '줄별 작성자' }).click()
  await win.waitForSelector('.blame tr')
  check('blame', (await win.locator('.blame tr').count()) >= 3)
  await shot(win, '7-blame.png')
  await win.keyboard.press('Escape')
  await win.keyboard.press('Escape')

  // ── 설정 ──
  await win.locator('.toolbar .icon-btn[title="저장소 설정"]').click()
  await win.waitForSelector('.setting-row')
  check('repo settings: remotes', (await win.locator('.setting-row').innerText()).includes('origin'))
  await shot(win, '8-repo-settings.png')
  await win.keyboard.press('Escape')

  // ── 어두운 화면 ──
  // 알림에는 임시 폴더 경로(PC 사용자 이름)가 나올 수 있어 문서용 스크린샷 전에 닫는다
  while (await win.locator('.toast .icon-btn').count()) await win.locator('.toast .icon-btn').first().click()
  await win.locator('.side-item', { hasText: '히스토리' }).click()
  await win.locator('.commit-row').first().click()
  await win.emulateMedia({ colorScheme: 'dark' })
  await sleep(300)
  await shot(win, '9-history-dark.png')
  await win.locator('.side-item', { hasText: '변경 사항' }).click()
  await win.waitForSelector('.changes .file-row')
  await shot(win, '10-changes-dark.png')
  await win.emulateMedia({ colorScheme: 'light' })

  // ── 새 탭 ──
  await win.locator('.tab-new').click()
  await win.waitForSelector('.start-btn')
  check('new tab shows start screen', (await win.locator('.start-btn').count()) === 3)
  await shot(win, '11-welcome.png')
  await win.locator('.tab').first().click()
  await win.waitForSelector('.toolbar')

  // ── 영어로 바꾸기 (앱 설정 > 언어) ──
  await win.locator('.toolbar .icon-btn[title="더 보기"]').click()
  await win.locator('.ctx-menu .menu-item', { hasText: '앱 설정' }).click()
  await win.locator('.dialog .seg button', { hasText: 'English' }).click()
  check('switch to English', await until(async () => (await win.locator('.tool-btn', { hasText: 'Fetch' }).count()) === 1))
  // 툴바·사이드바·히스토리 머리에 한글이 남지 않았는지 (커밋 메시지 같은 저장소 내용은 빼고)
  const leftover = await win.evaluate(() => ['.toolbar', '.sidebar', '.history-bar', '.commit-head', '.detail-files h3', '.tabbar']
    .map((s) => document.querySelector(s)?.textContent ?? '').join(' ').match(/[가-힣]+/g))
  check('no Korean left in English UI chrome', !leftover, leftover ? leftover.slice(0, 8).join(', ') : '')
  while (await win.locator('.toast .icon-btn').count()) await win.locator('.toast .icon-btn').first().click()
  await win.locator('.side-item', { hasText: 'History' }).click()
  await win.locator('.commit-row').first().click()
  await sleep(300)
  await shot(win, '12-history-en.png')
  await win.locator('.side-item', { hasText: 'Changes' }).click()
  await win.waitForSelector('.changes .file-row')
  const changesLeft = await win.evaluate(() => ['.changes-bar', '.section-head', '.commit-box', '.diff-head']
    .map((s) => [...document.querySelectorAll(s)].map((e) => e.textContent).join(' ')).join(' ').match(/[가-힣]+/g))
  check('no Korean left in English changes view', !changesLeft, changesLeft ? changesLeft.slice(0, 8).join(', ') : '')
  await shot(win, '13-changes-en.png')
} catch (e) {
  check('unexpected error', false, String(e?.message ?? e).split('\n').slice(0, 6).join(' | '))
  try {
    const win = await app.firstWindow()
    await win.screenshot({ path: path.join(out, 'error.png') })
  } catch {}
} finally {
  await app.close()
}

console.log(`\nscreenshots: ${out}`)
const failed = results.filter((r) => !r.ok)
console.log(failed.length === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
