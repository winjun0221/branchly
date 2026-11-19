import { useQueryClient } from '@tanstack/react-query'
import { CircleArrowDown, LoaderCircle, RotateCw } from 'lucide-react'
import { api, errorText, useUpdateStatus } from '../api'
import { useUi } from '../ui'
import { t } from '../i18n'

/** 탭 줄 오른쪽 끝: 새 버전을 받는 중이면 진행률, 다 받았으면 "다시 시작해서 설치" */
export default function UpdateChip() {
  const ui = useUi()
  const qc = useQueryClient()
  const s = useUpdateStatus().data
  if (!s) return null

  if (s.state === 'downloading') {
    return (
      <span className="update-chip busy" title={t('새 버전 {version}을(를) 받는 중', { version: s.newVersion ?? '' })}>
        <LoaderCircle className="spin" />{t('새 버전 받는 중 {n}%', { n: s.progress ?? 0 })}
      </span>
    )
  }
  if (s.state === 'ready') {
    return (
      <button className="update-chip ready" title={t('지금 다시 시작하면 새 버전이 설치돼요. 나중에 앱을 끌 때 설치해도 돼요.')}
        onClick={async () => {
          const ok = await ui.confirm({
            title: t('새 버전 {version} 설치', { version: s.newVersion ?? '' }),
            message: <>{t('Branchly를 닫고 새 버전을 설치한 뒤 다시 켜요. 열려 있는 저장소 탭은 그대로 다시 열려요.')}<br /><span className="muted small">{t('지금 말고 나중에 앱을 끌 때 설치해도 돼요.')}</span></>,
            confirm: t('다시 시작해서 설치'),
          })
          if (!ok) return
          try {
            await api.installUpdate()
          } catch (e) {
            ui.notify(errorText(e), 'error')
            void qc.invalidateQueries({ queryKey: ['update'] })
          }
        }}>
        <CircleArrowDown />{t('새 버전 {version} · 다시 시작해서 설치', { version: s.newVersion ?? '' })}<RotateCw className="small-icon" />
      </button>
    )
  }
  return null
}
