import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
}

/** 可收合的設定卡片：點標題收合/展開，預設展開 */
export default function Section({ title, children }: Props) {
  return (
    <details className="card" open>
      <summary>
        <h2>{title}</h2>
      </summary>
      {children}
    </details>
  )
}
