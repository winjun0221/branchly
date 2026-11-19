// 화면 전용: 문장 안에 굵은 글씨·코드 같은 요소를 끼워 넣는 번역
//   tx('{name} 브랜치를 지울까요?', { name: <b>{branch}</b> })
import { Fragment, type ReactNode } from 'react'
import { template } from '../../shared/i18n'

export { getLang, setLang, t, tk } from '../../shared/i18n'

export function tx(ko: string, vars: Record<string, ReactNode>): ReactNode {
  const parts = template(ko).split(/\{(\w+)\}/)
  return parts.map((p, i) => (i % 2 === 0 ? p : <Fragment key={i}>{p in vars ? vars[p] : `{${p}}`}</Fragment>))
}
