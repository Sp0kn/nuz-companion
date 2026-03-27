import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, CapturedPokemon, QueuedNickname } from '../lib/api'
import Modal from './Modal'

interface Props {
  entry: QueuedNickname
  pokemon: CapturedPokemon[]
  runId: number
  onClose: () => void
}

export default function AssignNicknameModal({ entry, pokemon, runId, onClose }: Props) {
  const queryClient = useQueryClient()
  const [confirmTarget, setConfirmTarget] = useState<CapturedPokemon | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pokemon', runId] })
    queryClient.invalidateQueries({ queryKey: ['nicknameQueue', runId] })
  }

  const { mutate, isPending } = useMutation({
    mutationFn: (p: CapturedPokemon) =>
      Promise.all([
        api.pokemon.update(p.id, { nickname: entry.nickname, twitch_username: entry.redeemed_by ?? null }),
        api.nicknameQueue.update(entry.id, { status: 'assigned', assigned_to_id: p.id }),
      ]),
    onSuccess: () => { invalidate(); onClose() },
  })

  const handleClick = (p: CapturedPokemon) => {
    if (p.nickname) {
      setConfirmTarget(p)
    } else {
      mutate(p)
    }
  }

  const sorted = [...pokemon].sort((a, b) => {
    if (!a.nickname && b.nickname) return -1
    if (a.nickname && !b.nickname) return 1
    return 0
  })

  return (
    <Modal onClose={() => { setConfirmTarget(null); onClose() }}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-text">Assign Nickname</h2>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>

        <p className="text-sm text-muted mb-5">
          Assign <span className="text-pending font-semibold">"{entry.nickname}"</span> to a Pokémon
        </p>

        {confirmTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text">
              <span className="font-semibold">{confirmTarget.pokemon_name}</span> already has the nickname{' '}
              <span className="font-semibold text-muted">"{confirmTarget.nickname}"</span>. Overwrite it with{' '}
              <span className="font-semibold text-pending">"{entry.nickname}"</span>?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmTarget(null)} className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5">Cancel</button>
              <button
                onClick={() => mutate(confirmTarget)}
                disabled={isPending}
                className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isPending ? '…' : 'Overwrite'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted italic">No Pokémon captured yet.</p>
            ) : (
              sorted.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleClick(p)}
                  disabled={isPending}
                  className={`flex items-center gap-3 border rounded-lg px-4 py-3 text-left transition-colors disabled:opacity-50 group ${
                    p.nickname
                      ? 'bg-surface border-border opacity-50 hover:opacity-100 hover:border-accent'
                      : 'bg-surface-2 border-border hover:border-alive'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-text">{p.pokemon_name}</span>
                    {p.nickname
                      ? <span className="ml-2 text-xs text-muted">already has "{p.nickname}"</span>
                      : <span className="ml-2 text-xs text-muted">no nickname</span>
                    }
                    <p className="text-xs text-muted mt-0.5">{p.zone.name}</p>
                  </div>
                  <span className={`text-xs opacity-0 group-hover:opacity-100 transition-opacity ${p.nickname ? 'text-accent' : 'text-alive'}`}>Assign →</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
