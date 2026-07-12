import { useState } from 'react'

type Props = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange' | 'min' | 'max'> & {
  value: number
  min?: number
  max?: number
  onCommit: (v: number) => void
}

/**
 * 數字輸入框：編輯中允許整個清空（不會被塞回預設值），
 * 數值在範圍內時即時套用；失焦時空值/無效值回復原值，超出範圍夾回上下限。
 */
export default function NumberInput({ value, min, max, onCommit, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const lo = min ?? -Infinity
  const hi = max ?? Infinity

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value)
        const v = Number(e.target.value)
        if (e.target.value !== '' && Number.isFinite(v) && v >= lo && v <= hi) onCommit(v)
      }}
      onBlur={() => {
        if (draft !== null && draft !== '') {
          const v = Number(draft)
          if (Number.isFinite(v)) onCommit(Math.min(hi, Math.max(lo, v)))
        }
        setDraft(null)
      }}
    />
  )
}
