import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Game } from '../lib/api'
import { useRunStore } from '../stores/runStore'
import Modal from './Modal'

interface Props {
  onClose: () => void
}

export default function CreateRunModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const { setSelectedRunId } = useRunStore()

  const { data: games = [] } = useQuery({
    queryKey: ['games'],
    queryFn: api.games.list,
  })

  const [gameId, setGameId] = useState<number | ''>('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (!gameId) return
    const game = games.find((g) => g.id === gameId)
    if (game && !name) setName(`${game.name} Nuzlocke`)
  }, [gameId, games])

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => api.runs.create({ game_id: gameId as number, name }),
    onSuccess: (newRun) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      setSelectedRunId(newRun.id)
      onClose()
    },
  })

  const byGen = games.reduce<Record<number, Game[]>>((acc, g) => {
    ;(acc[g.generation] ??= []).push(g)
    return acc
  }, {})

  const canSubmit = gameId !== '' && name.trim().length > 0

  return (
    <Modal onClose={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-text">New Run</h2>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Game</label>
            <select
              value={gameId}
              onChange={(e) => setGameId(Number(e.target.value))}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent"
            >
              <option value="" disabled>Select a game…</option>
              {Object.entries(byGen)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([gen, genGames]) => (
                  <optgroup key={gen} label={`Generation ${gen}`}>
                    {genGames.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Run Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Emerald Nuzlocke"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => e.key === 'Enter' && canSubmit && mutate()}
              autoFocus={!!gameId}
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
              {isPending ? 'Creating…' : 'Create Run'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
