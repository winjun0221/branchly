// 대화형 리베이스 할 일 목록(todo) 만들기. 테스트: test/rebase.test.ts
//
// 편집기를 띄우지 않으려고: 메시지를 바꾸는 단계(reword, squash)는 `pick`/`fixup` 다음에
// `exec git commit --amend -F <파일>`을 넣어 미리 써 둔 메시지로 바꾼다.
import type { RebaseStep } from './types'
import { t } from './i18n'

export interface Todo {
  todo: string
  /** 메시지 파일로 써야 할 내용 (todo의 exec가 이 파일을 읽음) */
  messages: { file: string; text: string }[]
}

/** msgFile(n): n번째 메시지 파일 경로 (sh에서 읽히도록 / 구분, 작은따옴표 없는 경로) */
export function buildTodo(steps: RebaseStep[], msgFile: (n: number) => string): Todo {
  if (steps.length === 0) throw new Error(t('리베이스할 커밋이 없습니다'))
  const lines: string[] = []
  const messages: { file: string; text: string }[] = []
  let last: string | null = null // 지금까지 남은 커밋의 메시지

  const amend = (text: string) => {
    const file = msgFile(messages.length)
    if (file.includes("'")) throw new Error(t('임시 폴더 경로에 작은따옴표가 있습니다'))
    messages.push({ file, text: text.trim() + '\n' })
    lines.push(`exec git commit --amend --only --allow-empty --no-verify -F '${file}'`)
  }

  for (const s of steps) {
    if (!/^[0-9a-f]{7,64}$/i.test(s.sha)) throw new Error(t('잘못된 커밋'))
    switch (s.action) {
      case 'drop':
        lines.push(`drop ${s.sha}`)
        break
      case 'pick':
        lines.push(`pick ${s.sha}`)
        last = s.message
        break
      case 'reword':
        if (!s.message.trim()) throw new Error(t('새 커밋 메시지를 입력하세요'))
        lines.push(`pick ${s.sha}`)
        amend(s.message)
        last = s.message
        break
      case 'squash': {
        if (last === null) throw new Error(t('맨 앞 커밋은 합칠 대상이 없어 squash할 수 없습니다'))
        const combined: string = `${last.trim()}\n\n${s.message.trim()}`
        lines.push(`fixup ${s.sha}`)
        amend(combined)
        last = combined
        break
      }
      case 'fixup':
        if (last === null) throw new Error(t('맨 앞 커밋은 합칠 대상이 없어 fixup할 수 없습니다'))
        lines.push(`fixup ${s.sha}`)
        break
    }
  }
  if (!steps.some((s) => s.action !== 'drop')) throw new Error(t('모든 커밋을 버릴 수는 없습니다'))
  return { todo: lines.join('\n') + '\n', messages }
}
