import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, RedemptionType } from '../lib/api'
import Modal from './Modal'

const PRESET_COLORS = [
  '#8890b0', // gray (default)
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
]

interface Props {
  runId: number
  onClose: () => void
}

export default function ManageRedemptionTypesModal({ runId, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data: types = [] } = useQuery({
    queryKey: ['redemptionTypes', runId],
    queryFn: () => api.redemptionTypes.list(runId),
  })

  const [ordered, setOrdered] = useState<RedemptionType[]>([])
  useEffect(() => { setOrdered(types) }, [types])

  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['redemptionTypes', runId] })

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: () =>
      api.redemptionTypes.create({ run_id: runId, name: name.trim(), priority: ordered.length + 1, color }),
    onSuccess: () => { invalidate(); setName(''); setColor(PRESET_COLORS[0]) },
  })

  const { mutate: reorder } = useMutation({
    mutationFn: (ids: number[]) => api.redemptionTypes.reorder(ids),
    onSuccess: invalidate,
  })

  const { mutate: remove } = useMutation({
    mutationFn: (id: number) => api.redemptionTypes.delete(id),
    onSuccess: invalidate,
  })

  const move = (index: number, dir: -1 | 1) => {
    const next = [...ordered]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setOrdered(next)
    reorder(next.map((t) => t.id))
  }

  const canCreate = name.trim().length > 0

  return (
    <Modal onClose={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-text">Redemption Types</h2>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-2 mb-5">
          {ordered.length === 0 ? (
            <p className="text-sm text-muted italic">No types yet.</p>
          ) : (
            ordered.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 bg-surface-2 border border-border rounded-lg px-3 py-2.5">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-muted hover:text-text transition-colors disabled:opacity-20 text-xs leading-none"
                    title="Move up"
                  >▲</button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === ordered.length - 1}
                    className="text-muted hover:text-text transition-colors disabled:opacity-20 text-xs leading-none"
                    title="Move down"
                  >▼</button>
                </div>
                <span className="text-xs text-muted w-4 text-center font-bold shrink-0">{i + 1}</span>
                <span
                  className="w-3 h-3 rounded-full shrink-0 border border-white/10"
                  style={{ backgroundColor: t.color }}
                />
                <span className="flex-1 text-sm" style={{ color: t.color }}>{t.name}</span>
                <button
                  onClick={() => remove(t.id)}
                  className="text-muted hover:text-fainted transition-colors shrink-0 px-1 py-0.5 rounded hover:bg-fainted/10"
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Add Type</p>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'}`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sub Redemption"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-accent"
              style={{ color }}
              onKeyDown={(e) => e.key === 'Enter' && canCreate && create()}
              autoFocus
            />
            <button
              onClick={() => create()}
              disabled={!canCreate || creating}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
