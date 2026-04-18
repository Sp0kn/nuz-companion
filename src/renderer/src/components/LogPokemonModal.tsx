import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, CapturedPokemon, PokemonStatus } from '../lib/api'
import Modal from './Modal'
import PokemonCombobox from './PokemonCombobox'

interface Props {
  runId: number
  gameId: number
  initialZoneId?: number
  onClose: () => void
}

export default function LogPokemonModal({ runId, gameId, initialZoneId, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data: zones = [] } = useQuery({
    queryKey: ['zones', gameId],
    queryFn: () => api.zones.list(gameId),
  })

  const captured: CapturedPokemon[] = queryClient.getQueryData(['pokemon', runId]) ?? []
  const takenZoneIds = new Set(captured.map((p) => p.zone_id))

  const [zoneId, setZoneId] = useState<number | ''>(initialZoneId ?? '')
  const [pokemonName, setPokemonName] = useState('')
  const [nickname, setNickname] = useState('')
  const [status, setStatus] = useState<PokemonStatus>('alive')

  const { mutate, isPending, error } = useMutation({
    mutationFn: () =>
      api.pokemon.create({
        run_id: runId,
        zone_id: zoneId as number,
        pokemon_name: pokemonName.trim(),
        nickname: nickname.trim() || undefined,
        status,
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['pokemon', runId] })
      const previous = queryClient.getQueryData<CapturedPokemon[]>(['pokemon', runId])
      const zone = zones.find((z) => z.id === zoneId)!
      queryClient.setQueryData<CapturedPokemon[]>(['pokemon', runId], (old = []) => [
        ...old,
        {
          id: -Date.now(),
          run_id: runId,
          zone_id: zoneId as number,
          pokemon_name: pokemonName.trim(),
          nickname: nickname.trim() || null,
          twitch_username: null,
          status,
          impatience: 0,
          on_team: false,
          created_at: new Date().toISOString(),
          zone,
        },
      ])
      onClose() // close immediately — server syncs in background
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['pokemon', runId], context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pokemon', runId] }),
  })

  const canSubmit = zoneId !== '' && pokemonName.trim().length > 0

  return (
    <Modal onClose={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-text">Log Pokémon</h2>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Zone</label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(Number(e.target.value))}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent"
              autoFocus={!initialZoneId}
            >
              <option value="" disabled>Select a zone…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id} disabled={takenZoneIds.has(z.id)}>
                  {z.name}{takenZoneIds.has(z.id) ? ' (taken)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Pokémon Name</label>
            <PokemonCombobox
              value={pokemonName}
              onChange={setPokemonName}
              placeholder="e.g. Ralts"
              autoFocus={!!initialZoneId}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
              Nickname <span className="text-muted font-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Luna"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Status</label>
            <div className="flex gap-2">
              {(['alive', 'missed'] as PokemonStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    status === s
                      ? s === 'alive'
                        ? 'bg-alive/20 border-alive text-alive'
                        : 'bg-missed/20 border-missed text-missed'
                      : 'border-border text-muted hover:border-muted'
                  }`}
                >
                  {s === 'missed' ? 'Missed (retry)' : 'Caught'}
                </button>
              ))}
            </div>
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
              {isPending ? 'Logging…' : 'Log Pokémon'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
