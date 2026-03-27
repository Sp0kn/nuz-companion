import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import Modal from './Modal'

interface Props {
  runId: number
  onClose: () => void
}

export default function AddToQueueModal({ runId, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data: types = [] } = useQuery({
    queryKey: ['redemptionTypes', runId],
    queryFn: () => api.redemptionTypes.list(runId),
  })

  const [redemptionTypeId, setRedemptionTypeId] = useState<number | ''>('')
  const [nickname, setNickname] = useState('')
  const [redeemedBy, setRedeemedBy] = useState('')

  const { mutate, isPending, error } = useMutation({
    mutationFn: () =>
      api.nicknameQueue.create({
        run_id: runId,
        redemption_type_id: redemptionTypeId as number,
        nickname: nickname.trim(),
        redeemed_by: redeemedBy.trim() || undefined,
        redeemed_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nicknameQueue', runId] })
      onClose()
    },
  })

  const canSubmit = redemptionTypeId !== '' && nickname.trim().length > 0

  return (
    <Modal onClose={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-text">Add to Queue</h2>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Redemption Type</label>
            {types.length === 0 ? (
              <p className="text-xs text-fainted">No redemption types yet. Create one first in the queue settings.</p>
            ) : (
              <select
                value={redemptionTypeId}
                onChange={(e) => setRedemptionTypeId(Number(e.target.value))}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent"
                autoFocus
              >
                <option value="" disabled>Select a type…</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>#{t.priority} — {t.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Thunderbolt"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => e.key === 'Enter' && canSubmit && mutate()}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
              Redeemed By <span className="text-muted font-normal normal-case">(Twitch username, optional)</span>
            </label>
            <input
              type="text"
              value={redeemedBy}
              onChange={(e) => setRedeemedBy(e.target.value)}
              placeholder="e.g. viewer123"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => e.key === 'Enter' && canSubmit && mutate()}
            />
          </div>

          {error && <p className="text-xs text-fainted">{(error as Error).message}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm text-muted hover:text-text hover:border-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={() => mutate()}
              disabled={!canSubmit || isPending}
              className="flex-1 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? 'Adding…' : 'Add to Queue'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
