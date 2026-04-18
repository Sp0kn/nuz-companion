import { useState } from 'react'
import type React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, CapturedPokemon, QueuedNickname, PokemonStatus, RunStatus, Run, Zone } from '../lib/api'
import { useRunStore } from '../stores/runStore'
import LogPokemonModal from '../components/LogPokemonModal'
import AddToQueueModal from '../components/AddToQueueModal'
import AssignNicknameModal from '../components/AssignNicknameModal'
import ManageRedemptionTypesModal from '../components/ManageRedemptionTypesModal'
import { getPokemonSpriteUrl } from '../lib/pokemonUtils'
import PokemonCombobox from '../components/PokemonCombobox'

export default function RunDetail() {
  const { selectedRunId, setSelectedRunId } = useRunStore()

  const { data: runs = [] } = useQuery({ queryKey: ['runs'], queryFn: api.runs.list })
  const currentRun = runs.find((r) => r.id === selectedRunId)

  const { data: pokemonList = [], isLoading: loadingPokemon } = useQuery({
    queryKey: ['pokemon', selectedRunId],
    queryFn: () => api.pokemon.list(selectedRunId!),
    enabled: selectedRunId !== null,
    refetchInterval: 5000,
  })

  const { data: queue = [], isLoading: loadingQueue } = useQuery({
    queryKey: ['nicknameQueue', selectedRunId],
    queryFn: () => api.nicknameQueue.list(selectedRunId!),
    enabled: selectedRunId !== null,
    refetchInterval: 5000,
  })

  const { data: zones = [] } = useQuery({
    queryKey: ['zones', currentRun?.game_id],
    queryFn: () => api.zones.list(currentRun!.game_id),
    enabled: currentRun !== undefined,
  })

  const [showLogPokemon, setShowLogPokemon] = useState(false)
  const [logZoneId, setLogZoneId] = useState<number | undefined>(undefined)
  const [showAddToQueue, setShowAddToQueue] = useState(false)
  const [showManageTypes, setShowManageTypes] = useState(false)
  const [assignEntry, setAssignEntry] = useState<QueuedNickname | null>(null)
  const [captureTarget, setCaptureTarget] = useState<CapturedPokemon | null>(null)
  const [pokemonFilter, setPokemonFilter] = useState('')
  const [queueFilter, setQueueFilter] = useState('')
  const [showRoll, setShowRoll] = useState(false)

  if (selectedRunId === null || !currentRun) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <p>No run selected. Create a run to get started.</p>
      </div>
    )
  }

  const pokemonByZone = new Map(pokemonList.map((p) => [p.zone_id, p]))

  const caught = pokemonList.filter((p) => p.status === 'alive').length

  return (
    <div className="p-6 flex flex-col gap-6 min-h-full">
      <RunHeader key={currentRun.id} run={currentRun} onDeleted={() => {
          const next = runs.find((r) => r.id !== selectedRunId)
          setSelectedRunId(next?.id ?? null)
        }} />

      {currentRun.status !== 'active' && (
        <RunSummary pokemonList={pokemonList} totalZones={zones.length} status={currentRun.status} />
      )}

      <div className="grid grid-cols-[220px_1fr_300px] gap-5 items-start">

        {/* Zone List — compact sidebar */}
        <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Zones</h2>
            </div>
            <div className="flex flex-col gap-1">
              {zones.length === 0 ? (
                <p className="text-xs text-muted italic px-1">No zones.</p>
              ) : (
                zones.map((z) => {
                  const p = pokemonByZone.get(z.id)
                  return (
                    <ZoneCompactRow
                      key={z.id}
                      zone={z}
                      pokemon={p}
                      runId={selectedRunId}
                      onLog={() => { setLogZoneId(z.id); setShowLogPokemon(true) }}
                      onCapture={(pk) => setCaptureTarget(pk)}
                    />
                  )
                })
              )}
            </div>
            <p className="text-xs text-muted mt-2 tabular-nums">
              {caught}/{zones.length} caught
            </p>
        </section>

        {/* Captured Pokémon — main section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Captured Pokémon
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRoll(true)}
                className="text-xs font-semibold text-muted hover:text-text transition-colors"
              >
                ⚄ Roll
              </button>
              <button
                onClick={() => { setLogZoneId(undefined); setShowLogPokemon(true) }}
                className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
              >
                + Log Pokémon
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <input
              value={pokemonFilter}
              onChange={(e) => setPokemonFilter(e.target.value)}
              placeholder="Search by name, nickname, @username…"
              className="w-full bg-surface-2 border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-accent"
            />
            {pokemonFilter && (
              <button
                onClick={() => setPokemonFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {loadingPokemon ? (
            <Skeleton />
          ) : (() => {
            const q = pokemonFilter.toLowerCase()
            const filtered = [...pokemonList]
              .filter((p) => p.status !== 'missed')
              .filter((p) => !q || [p.pokemon_name, p.nickname, p.twitch_username].some((v) => v?.toLowerCase().includes(q)))
              .sort((a, b) => {
                const order = (p: CapturedPokemon) => {
                  if (p.status === 'alive' && p.on_team) return 0
                  if (p.status === 'alive') return 1
                  if (p.status === 'fainted') return 2
                  return 3
                }
                return order(a) - order(b)
              })
            if (filtered.length === 0) {
              return <Empty message={pokemonFilter ? 'No Pokémon match your search.' : 'No Pokémon logged yet.'} />
            }
            const teamPokemon = filtered.filter((p) => p.status === 'alive' && p.on_team)
            const restPokemon = filtered.filter((p) => !(p.status === 'alive' && p.on_team))
            return (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted/60 px-1 pt-1">Current Team</p>
                {teamPokemon.length === 0
                  ? <p className="text-xs text-muted/40 italic px-1 pb-1">No Pokémon on the team yet.</p>
                  : teamPokemon.map((p) => <PokemonRow key={p.id} pokemon={p} runId={selectedRunId} />)
                }
                <div className="border-t border-border/50 mt-1" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted/60 px-1 pt-1">Not On Team</p>
                {restPokemon.length === 0
                  ? <p className="text-xs text-muted/40 italic px-1 pb-1">All Pokémon are on the team!</p>
                  : restPokemon.map((p) => <PokemonRow key={p.id} pokemon={p} runId={selectedRunId} />)
                }
              </div>
            )
          })()}
        </section>

        {/* Nickname Queue */}
        <section>
          {(() => {
            const q = queueFilter.toLowerCase()
            const matches = (e: QueuedNickname) => !q || [e.nickname, e.redeemed_by].some((v) => v?.toLowerCase().includes(q))
            const pending = queue.filter((e) => e.status === 'pending' && matches(e))
            const skipped = queue.filter((e) => e.status === 'skipped' && matches(e))
            return (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Nickname Queue</h2>
                    <span className="text-xs bg-surface-2 border border-border text-muted px-2 py-0.5 rounded-full">
                      {pending.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setShowManageTypes(true)} className="text-xs text-muted hover:text-text transition-colors">⚙ Types</button>
                    <button onClick={() => setShowAddToQueue(true)} className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors">+ Add</button>
                  </div>
                </div>

                <div className="relative mb-3">
                  <input
                    value={queueFilter}
                    onChange={(e) => setQueueFilter(e.target.value)}
                    placeholder="Search by nickname, @username…"
                    className="w-full bg-surface-2 border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-accent"
                  />
                  {queueFilter && (
                    <button
                      onClick={() => setQueueFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {loadingQueue ? (
                  <Skeleton />
                ) : pending.length === 0 && skipped.length === 0 ? (
                  <Empty message={queueFilter ? 'No entries match your search.' : 'Queue is empty.'} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {pending.map((entry, i) => (
                      <QueueRow key={entry.id} entry={entry} position={i + 1} runId={selectedRunId} onAssign={() => setAssignEntry(entry)} />
                    ))}
                    {skipped.length > 0 && (
                      <>
                        {pending.length > 0 && <div className="border-t border-border my-1" />}
                        <p className="text-xs text-muted uppercase tracking-wider px-1">Skipped</p>
                        {skipped.map((entry) => (
                          <QueueRow key={entry.id} entry={entry} position={null} runId={selectedRunId} onAssign={() => setAssignEntry(entry)} />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            )
          })()}
        </section>
      </div>

      {/* Modals */}
      {showLogPokemon && currentRun && (
        <LogPokemonModal
          runId={selectedRunId}
          gameId={currentRun.game_id}
          initialZoneId={logZoneId}
          onClose={() => { setShowLogPokemon(false); setLogZoneId(undefined) }}
        />
      )}
      {showAddToQueue && (
        <AddToQueueModal runId={selectedRunId} onClose={() => setShowAddToQueue(false)} />
      )}
      {showManageTypes && (
        <ManageRedemptionTypesModal runId={selectedRunId} onClose={() => setShowManageTypes(false)} />
      )}
      {assignEntry && (
        <AssignNicknameModal
          entry={assignEntry}
          pokemon={pokemonList}
          runId={selectedRunId}
          onClose={() => setAssignEntry(null)}
        />
      )}
      {captureTarget && (
        <CapturePokemonModal
          pokemon={captureTarget}
          runId={selectedRunId}
          onClose={() => setCaptureTarget(null)}
        />
      )}
      {showRoll && (
        <RollModal
          runId={selectedRunId}
          pokemonList={pokemonList}
          onClose={() => setShowRoll(false)}
        />
      )}
    </div>
  )
}

// --- Notepad Icon ---

function SkullIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor">
      <path d="M8 1a5.5 5.5 0 0 0-5.5 5.5c0 1.8.87 3.4 2.2 4.38V12.5a.5.5 0 0 0 .5.5h5.6a.5.5 0 0 0 .5-.5v-1.62A5.5 5.5 0 0 0 8 1ZM6 10a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
      <path d="M6 13h1v2H6zm3 0h1v2H9z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor">
      <path d="M6.5 1.5a.5.5 0 0 0-.5.5v.5h4V2a.5.5 0 0 0-.5-.5h-3Z" />
      <path d="M2 4a.5.5 0 0 0 0 1h.5l.8 8.1A1 1 0 0 0 4.3 14h7.4a1 1 0 0 0 1-.9L13.5 5H14a.5.5 0 0 0 0-1H2Zm4.5 2.5a.5.5 0 0 1 1 0v5a.5.5 0 0 1-1 0v-5Zm3 0a.5.5 0 0 1 1 0v5a.5.5 0 0 1-1 0v-5Z" />
    </svg>
  )
}

function NotepadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
      <path d="M5 5.5h6M5 8h6M5 10.5h4" />
      <path d="M5 1.5v2M11 1.5v2" strokeWidth="1.2" />
    </svg>
  )
}

// --- Notes Modal ---

function NotesModal({ run, onClose }: { run: Run; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(run.notes ?? '')

  const { mutate: save } = useMutation({
    mutationFn: (notes: string) => api.runs.update(run.id, { notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs'] }),
  })

  const handleClose = () => {
    save(value)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={handleClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NotepadIcon className="w-4 h-4 text-muted" />
            <h2 className="text-sm font-semibold text-text">Notes — {run.name}</h2>
          </div>
          <button onClick={handleClose} className="text-muted hover:text-text transition-colors text-xl leading-none">✕</button>
        </div>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Write anything about this run…"
          className="w-full h-64 bg-surface-2 border border-border rounded-lg px-4 py-3 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-accent resize-none leading-relaxed"
        />
        <div className="flex justify-end">
          <button onClick={handleClose} className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
            Save & Close
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Run Header ---


function RunSummary({ pokemonList, totalZones, status }: { pokemonList: CapturedPokemon[]; totalZones: number; status: 'completed' | 'failed' }) {
  const alive = pokemonList.filter((p) => p.status === 'alive')
  const fainted = pokemonList.filter((p) => p.status === 'fainted')
  const missed = pokemonList.filter((p) => p.status === 'missed')
  const encountered = pokemonList.length

  const isCompleted = status === 'completed'
  const accent = isCompleted ? 'border-alive/30 bg-alive/5' : 'border-fainted/30 bg-fainted/5'
  const titleColor = isCompleted ? 'text-alive' : 'text-fainted'
  const title = isCompleted ? '🏆 Run Completed!' : '💀 Run Failed'

  return (
    <div className={`rounded-xl border px-6 py-5 flex flex-col gap-4 ${accent}`}>
      <p className={`text-sm font-bold ${titleColor}`}>{title}</p>

      {/* Stat pills */}
      <div className="flex gap-3 flex-wrap">
        <StatPill label="Alive" value={alive.length} color="text-alive" />
        <StatPill label="Fainted" value={fainted.length} color="text-fainted" />
        <StatPill label="Missed" value={missed.length} color="text-muted" />
        <StatPill label="Zones" value={totalZones > 0 ? `${encountered}/${totalZones}` : encountered} color="text-text" />
      </div>

      {/* Survivors */}
      {alive.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Survivors</p>
          <div className="flex flex-wrap gap-2">
            {alive.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-alive shrink-0" />
                <span className="text-xs text-text font-medium">{p.nickname ?? p.pokemon_name}</span>
                {p.nickname && <span className="text-xs text-muted">({p.pokemon_name})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallen */}
      {fainted.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Fallen</p>
          <div className="flex flex-wrap gap-2">
            {fainted.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-1 opacity-60">
                <span className="w-1.5 h-1.5 rounded-full bg-fainted shrink-0" />
                <span className="text-xs text-text font-medium line-through">{p.nickname ?? p.pokemon_name}</span>
                {p.nickname && <span className="text-xs text-muted">({p.pokemon_name})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col items-center bg-surface border border-border rounded-lg px-4 py-2 min-w-[64px]">
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

function RunHeader({ run, onDeleted }: { run: Run; onDeleted: () => void }) {
  const queryClient = useQueryClient()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(run.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['runs'] })

  const { mutate: updateStatus } = useMutation({
    mutationFn: (status: RunStatus) => api.runs.update(run.id, { status }),
    onSuccess: invalidate,
  })

  const { mutate: saveName } = useMutation({
    mutationFn: (name: string) => api.runs.update(run.id, { name }),
    onSuccess: () => { invalidate(); setEditingName(false) },
  })

  const { mutate: deleteRun, isPending: deleting } = useMutation({
    mutationFn: () => api.runs.delete(run.id),
    onSuccess: () => { invalidate(); onDeleted() },
  })

  const commitName = () => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== run.name) saveName(trimmed)
    else { setNameValue(run.name); setEditingName(false) }
  }

  return (
    <div className="flex items-center gap-4 pb-4 border-b border-border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(run.name); setEditingName(false) } }}
              className="text-lg font-bold bg-surface-2 border border-accent rounded-md px-2 py-0.5 text-text focus:outline-none w-full max-w-xs"
            />
          ) : (
            <h2
              className="text-lg font-bold text-text truncate cursor-pointer hover:text-accent transition-colors group flex items-center gap-2"
              onClick={() => { setNameValue(run.name); setEditingName(true) }}
              title="Click to rename"
            >
              {run.name}
              <span className="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">✏</span>
            </h2>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-border text-muted hover:text-text hover:border-muted transition-colors shrink-0"
            title="Run notes"
          >
            <NotepadIcon className="w-3.5 h-3.5" />
            Notes
          </button>
        </div>
        <p className="text-xs text-muted mt-0.5">
          {run.game.name} · Gen {run.game.generation} · {run.game.region}
        </p>
      </div>

      <div className="flex items-center bg-surface-2 border border-border rounded-lg p-1 gap-0.5 shrink-0">
        {(['active', 'completed', 'failed'] as const).map((s) => {
          const active = run.status === s
          const colors: Record<string, string> = {
            active: active ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'text-muted hover:text-text',
            completed: active ? 'bg-alive/20 text-alive border-alive/30' : 'text-muted hover:text-text',
            failed: active ? 'bg-fainted/20 text-fainted border-fainted/30' : 'text-muted hover:text-text',
          }
          const labels: Record<string, string> = { active: 'Active', completed: 'Completed', failed: 'Failed' }
          return (
            <button
              key={s}
              onClick={() => { if (!active) updateStatus(s) }}
              className={`text-xs font-semibold px-3 py-1 rounded-md border transition-colors ${active ? `${colors[s]} border` : 'border-transparent'} ${colors[s]}`}
            >
              {labels[s]}
            </button>
          )
        })}
      </div>

      {confirmDelete ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-fainted">Sure?</span>
          <button onClick={() => deleteRun()} disabled={deleting} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-fainted text-white hover:bg-fainted/80 transition-colors disabled:opacity-50">
            {deleting ? '…' : 'Delete'}
          </button>
          <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted hover:text-text transition-colors">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-fainted transition-colors shrink-0" title="Delete run"><TrashIcon className="w-3 h-3" /></button>
      )}

      {showNotes && (
        <NotesModal run={run} onClose={() => setShowNotes(false)} />
      )}
    </div>
  )
}

// --- Zone Compact Row ---

function PokeballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M1.5 8h13" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  )
}

function ZoneCompactRow({ zone, pokemon: p, runId, onLog, onCapture }: {
  zone: Zone
  pokemon?: CapturedPokemon
  runId: number
  onLog: () => void
  onCapture: (pokemon: CapturedPokemon) => void
}) {
  const queryClient = useQueryClient()
  const { mutate: remove } = useMutation({
    mutationFn: (id: number) => api.pokemon.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['pokemon', runId] })
      const previous = queryClient.getQueryData<CapturedPokemon[]>(['pokemon', runId])
      queryClient.setQueryData<CapturedPokemon[]>(['pokemon', runId], (old = []) =>
        old.filter((pk) => pk.id !== id)
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['pokemon', runId], context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pokemon', runId] }),
  })

  const statusDot: Record<PokemonStatus, string> = {
    alive: 'bg-alive',
    fainted: 'bg-fainted',
    missed: 'bg-missed',
  }

  if (!p) {
    return (
      <button
        onClick={onLog}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 transition-colors group text-left w-full"
      >
        <span className="w-2 h-2 rounded-full border border-border shrink-0" />
        <span className="text-xs text-muted truncate flex-1">{zone.name}</span>
        <span className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0">+</span>
      </button>
    )
  }

  if (p.status === 'missed') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md group hover:bg-surface-2 transition-colors">
        <span className="w-2 h-2 rounded-full shrink-0 bg-missed" />
        <span className="text-xs text-muted truncate w-16 shrink-0">{zone.name}</span>
        <span className="text-xs text-missed italic truncate flex-1">{p.pokemon_name}</span>
        <button
          onClick={() => onCapture(p)}
          className="opacity-0 group-hover:opacity-100 transition-all shrink-0 text-accent hover:text-white hover:scale-125 hover:drop-shadow-[0_0_5px_theme(colors.accent)]"
          title="Capture this Pokémon"
        >
          <PokeballIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => remove(p.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted hover:text-fainted"
          title="Remove"
        >
          <span className="text-xs leading-none">−</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md group hover:bg-surface-2 transition-colors">
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[p.status as PokemonStatus]}`} />
      <span className="text-xs text-muted truncate w-16 shrink-0">{zone.name}</span>
      <span className={`text-xs truncate flex-1 ${p.status === 'fainted' ? 'line-through text-muted' : 'text-text'}`}>
        {p.pokemon_name}
      </span>
      <button
        onClick={() => remove(p.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted hover:text-fainted"
        title="Remove"
      >
        <span className="text-xs leading-none">−</span>
      </button>
    </div>
  )
}

// --- Capture Pokemon Modal ---

function CapturePokemonModal({ pokemon, runId, onClose }: { pokemon: CapturedPokemon; runId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [pokemonName, setPokemonName] = useState(pokemon.pokemon_name)
  const [nickname, setNickname] = useState('')

  const { mutate: capture, isPending } = useMutation({
    mutationFn: () => api.pokemon.update(pokemon.id, { status: 'alive', pokemon_name: pokemonName.trim() || pokemon.pokemon_name, nickname: nickname.trim() || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pokemon', runId] }); onClose() },
  })

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); capture() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-80 flex flex-col gap-4" onMouseDown={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-sm font-semibold text-text">Capture Pokémon</h2>
          <p className="text-xs text-muted mt-0.5">{pokemon.zone.name}</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Pokémon</label>
            <PokemonCombobox value={pokemonName} onChange={setPokemonName} placeholder="Pokémon name" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Nickname <span className="text-muted/60">(optional)</span></label>
            <input
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Leave blank for none"
              className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5">Cancel</button>
            <button type="submit" disabled={isPending || !pokemonName.trim()} className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50">
              {isPending ? 'Capturing…' : 'Capture!'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- Pokemon Row ---

function PokemonRow({ pokemon: p, runId }: { pokemon: CapturedPokemon; runId: number }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(p.pokemon_name)
  const [editNickname, setEditNickname] = useState(p.nickname ?? '')
  const [editTwitchUsername, setEditTwitchUsername] = useState(p.twitch_username ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { mutate: update, isPending: saving } = useMutation({
    mutationFn: (body: Parameters<typeof api.pokemon.update>[1]) => api.pokemon.update(p.id, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ['pokemon', runId] })
      const previous = queryClient.getQueryData<CapturedPokemon[]>(['pokemon', runId])
      queryClient.setQueryData<CapturedPokemon[]>(['pokemon', runId], (old = []) =>
        old.map((pk) => (pk.id === p.id ? { ...pk, ...body } : pk))
      )
      return { previous }
    },
    onError: (_err, _body, context) => {
      if (context?.previous) queryClient.setQueryData(['pokemon', runId], context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pokemon', runId] }),
  })

  const { mutate: remove, isPending: deleting } = useMutation({
    mutationFn: () => api.pokemon.delete(p.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['pokemon', runId] })
      const previous = queryClient.getQueryData<CapturedPokemon[]>(['pokemon', runId])
      queryClient.setQueryData<CapturedPokemon[]>(['pokemon', runId], (old = []) =>
        old.filter((pk) => pk.id !== p.id)
      )
      return { previous }
    },
    onError: (_err, _body, context) => {
      if (context?.previous) queryClient.setQueryData(['pokemon', runId], context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pokemon', runId] }),
  })

  const commitEdit = () => {
    const name = editName.trim()
    const nick = editNickname.trim()
    const twitch = editTwitchUsername.trim()
    if (name) update({ pokemon_name: name, nickname: nick || null, twitch_username: twitch || null })
    setIsEditing(false)
  }

  const spriteUrl = getPokemonSpriteUrl(p.pokemon_name)
  const fainted = p.status === 'fainted'

  if (isEditing) {
    const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setIsEditing(false) }
    return (
      <div className="bg-surface border border-accent rounded-lg px-4 py-2.5 flex flex-col gap-2">
        {/* Row 1 — species + actions */}
        <div className="flex items-center gap-3">
          <span className="w-[14px] shrink-0" />
          <span className="w-16 shrink-0" />
          <PokemonCombobox
            value={editName}
            onChange={setEditName}
            placeholder="Pokémon name"
            autoFocus
            className="flex-1 bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-text focus:outline-none focus:border-accent min-w-0"
            onKeyDown={onKey}
          />
          <button onClick={commitEdit} disabled={saving} className="text-xs text-alive hover:text-alive/80 transition-colors shrink-0">✓</button>
          <button onClick={() => setIsEditing(false)} className="text-xs text-muted hover:text-text transition-colors shrink-0">✕</button>
        </div>
        {/* Row 2 — nickname + twitch username */}
        <div className="flex items-center gap-3">
          <span className="w-[14px] shrink-0" />
          <span className="w-16 shrink-0" />
          <input
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            placeholder="Nickname"
            className="flex-1 bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-text focus:outline-none focus:border-accent min-w-0"
            onKeyDown={onKey}
          />
          <div className="flex items-center flex-1 min-w-0 bg-surface-2 border border-border rounded-md focus-within:border-accent">
            <span className="pl-2 text-sm text-muted/50 select-none">@</span>
            <input
              value={editTwitchUsername}
              onChange={(e) => setEditTwitchUsername(e.target.value)}
              placeholder="Twitch username"
              className="flex-1 bg-transparent px-1.5 py-1 text-sm text-text focus:outline-none min-w-0"
              onKeyDown={onKey}
            />
          </div>
          {/* spacer to align with the ✓ ✕ buttons above */}
          <span className="w-[28px] shrink-0" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-4 group">
      {/* Vertical team toggle */}
      {p.status === 'alive' ? (
        <button
          onClick={() => update({ on_team: !p.on_team })}
          className={`relative shrink-0 w-[14px] h-8 rounded-full transition-colors duration-200 cursor-pointer hover:opacity-80 ${p.on_team ? 'bg-accent' : 'bg-surface-2 border border-border'}`}
          title={p.on_team ? 'Remove from team' : 'Add to team'}
        >
          <span className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-all duration-200 ${p.on_team ? 'top-[3px]' : 'bottom-[3px]'}`} />
        </button>
      ) : (
        <span className="w-[14px] h-8 shrink-0 opacity-20 rounded-full bg-surface-2 border border-border" />
      )}

      {/* Sprite + status stacked */}
      <div className="flex flex-col items-center gap-1.5 shrink-0 w-16">
        {spriteUrl ? (
          <img
            src={spriteUrl}
            alt={p.pokemon_name}
            className={`w-16 h-16 object-contain ${fainted ? 'opacity-30 grayscale' : ''}`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <span className="w-16 h-16" />
        )}
        <StatusBadge status={p.status as PokemonStatus} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm leading-tight ${fainted ? 'line-through text-muted' : 'text-text'}`}>
          {p.pokemon_name}
        </p>
        <p className="text-sm leading-tight mt-0.5">
          {p.nickname
            ? <span className="text-muted">"{p.nickname}"</span>
            : <span className="text-muted/40 italic">No nickname</span>}
        </p>
        <p className="text-xs leading-tight mt-0.5">
          {p.twitch_username && p.twitch_username !== p.nickname
            ? <span className="text-muted/60">@{p.twitch_username}</span>
            : <span className="text-muted/20">—</span>}
        </p>
      </div>

      <div className="flex flex-row items-center gap-[5px] shrink-0">
        <span className="text-xs text-muted tabular-nums" title="Impatience">⚡{p.impatience}</span>
        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => update({ impatience: p.impatience + 1 })} className="text-[10px] text-muted hover:text-text leading-none transition-colors">▲</button>
          <button onClick={() => { if (p.impatience > 0) update({ impatience: p.impatience - 1 }) }} className={`text-[10px] leading-none transition-colors ${p.impatience === 0 ? 'text-muted/25 cursor-default' : 'text-muted hover:text-text'}`}>▼</button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto">
        <button onClick={() => { setEditName(p.pokemon_name); setEditNickname(p.nickname ?? ''); setEditTwitchUsername(p.twitch_username ?? ''); setIsEditing(true) }} className="text-xs text-muted hover:text-text transition-colors" title="Edit">✏</button>

        {p.status === 'alive' && (
          <button onClick={() => update({ status: 'fainted' })} className="text-muted hover:text-fainted transition-colors" title="Mark fainted"><SkullIcon className="w-3 h-3" /></button>
        )}
        {p.status === 'fainted' && (
          <button onClick={() => update({ status: 'alive' })} className="text-xs text-muted hover:text-alive transition-colors" title="Mark alive">↩</button>
        )}

        {confirmDelete ? (
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => remove()} disabled={deleting} className="text-xs text-fainted hover:text-fainted/80 transition-colors">{deleting ? '…' : 'Sure?'}</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted hover:text-text transition-colors">✕</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-muted hover:text-fainted transition-colors" title="Delete"><TrashIcon className="w-3 h-3" /></button>
        )}
      </div>
    </div>
  )
}

// --- Roll Modal ---

function RollModal({ runId, pokemonList, onClose }: { runId: number; pokemonList: CapturedPokemon[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2>(1)
  const [count, setCount] = useState(3)
  const [includeTeam, setIncludeTeam] = useState(false)
  const [rolled, setRolled] = useState<CapturedPokemon[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const currentTeam = pokemonList.filter((p) => p.on_team && p.status === 'alive')

  const [rollError, setRollError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const friendlyRollError = (msg: string): string => {
    if (msg.includes('No eligible Pokémon')) return includeTeam
      ? 'No Pokémon are available to roll — you need at least one alive Pokémon.'
      : 'All alive Pokémon are already on the team. Try enabling "Include current team in the roll pool".'
    if (msg.includes('count must be at least')) return 'Pick at least 1 Pokémon to roll.'
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'Could not reach the server. Is the backend running?'
    return msg
  }

  const { mutate: roll, isPending: rolling } = useMutation({
    mutationFn: () => api.pokemon.roll(runId, count, includeTeam),
    onSuccess: (data) => {
      setRollError(null)
      setRolled(data)
      setSelected(new Set(currentTeam.map((p) => p.id)))
      setStep(2)
    },
    onError: (err: Error) => setRollError(friendlyRollError(err.message)),
  })

  const { mutate: confirm, isPending: confirming } = useMutation({
    mutationFn: () => api.pokemon.confirmTeam(runId, Array.from(selected)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pokemon', runId] })
      onClose()
    },
    onError: (err: Error) => setConfirmError(err.message),
  })

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= 6) return prev
        next.add(id)
      }
      return next
    })
  }

  const currentTeamIds = new Set(currentTeam.map((p) => p.id))
  const extraRolled = rolled.filter((p) => !currentTeamIds.has(p.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-6 flex flex-col gap-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {step === 1 ? (
          <>
            <h2 className="text-sm font-semibold text-text">Roll Team</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">How many Pokémon to roll?</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(6, Number(e.target.value))))}
                  className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent w-24"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTeam}
                  onChange={(e) => setIncludeTeam(e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-sm text-text">Include current team in the roll pool</span>
              </label>
            </div>
            {rollError && (
              <p className="text-xs text-fainted bg-fainted/10 border border-fainted/30 rounded-lg px-3 py-2">{rollError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5">Cancel</button>
              <button
                onClick={() => roll()}
                disabled={rolling}
                className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {rolling ? 'Rolling…' : 'Roll!'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-semibold text-text">Choose Your Team</h2>
              <p className="text-xs text-muted mt-0.5">{selected.size}/6 selected — non-selected Pokémon will gain +1 impatience</p>
            </div>
            <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
              {currentTeam.length > 0 && (
                <>
                  <p className="text-xs text-muted uppercase tracking-wider">Current Team</p>
                  {currentTeam.map((p) => (
                    <RollPokemonRow
                      key={p.id}
                      pokemon={p}
                      checked={selected.has(p.id)}
                      onToggle={() => toggleSelect(p.id)}
                      disabled={!selected.has(p.id) && selected.size >= 6}
                    />
                  ))}
                </>
              )}
              {extraRolled.length > 0 && (
                <>
                  <p className="text-xs text-muted uppercase tracking-wider mt-1">From Roll</p>
                  {extraRolled.map((p) => (
                    <RollPokemonRow
                      key={p.id}
                      pokemon={p}
                      checked={selected.has(p.id)}
                      onToggle={() => toggleSelect(p.id)}
                      disabled={!selected.has(p.id) && selected.size >= 6}
                    />
                  ))}
                </>
              )}
              {currentTeam.length === 0 && extraRolled.length === 0 && (
                <p className="text-xs text-muted italic">No Pokémon available.</p>
              )}
            </div>
            {confirmError && (
              <p className="text-xs text-fainted bg-fainted/10 border border-fainted/30 rounded-lg px-3 py-2">{confirmError}</p>
            )}
            <div className="flex justify-between items-center pt-1">
              <button onClick={() => { setStep(1); setConfirmError(null) }} className="text-xs text-muted hover:text-text transition-colors">← Back</button>
              <div className="flex gap-2">
                <button onClick={onClose} className="text-xs text-muted hover:text-text transition-colors px-3 py-1.5">Cancel</button>
                <button
                  onClick={() => { setConfirmError(null); confirm() }}
                  disabled={confirming || selected.size === 0}
                  className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {confirming ? 'Confirming…' : 'Confirm Team'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RollPokemonRow({ pokemon: p, checked, onToggle, disabled }: {
  pokemon: CapturedPokemon
  checked: boolean
  onToggle: () => void
  disabled: boolean
}) {
  const spriteUrl = getPokemonSpriteUrl(p.pokemon_name)
  return (
    <label className={`flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer transition-colors select-none ${checked ? 'bg-accent/10 border-accent' : 'bg-surface-2 border-border'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-muted'}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} className="accent-accent shrink-0" />
      {spriteUrl && (
        <img src={spriteUrl} alt={p.pokemon_name} className="w-8 h-8 object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{p.pokemon_name}</p>
        {p.nickname && <p className="text-xs text-muted">"{p.nickname}"</p>}
      </div>
      <span className="text-xs text-muted tabular-nums shrink-0">⚡{p.impatience}</span>
    </label>
  )
}

function StatusBadge({ status }: { status: PokemonStatus }) {
  const config: Record<PokemonStatus, { label: string; className: string }> = {
    alive:   { label: 'Alive',   className: 'bg-alive/15 text-alive border-alive/30' },
    fainted: { label: 'Fainted', className: 'bg-fainted/15 text-fainted border-fainted/30' },
    missed:  { label: 'Missed',  className: 'bg-missed/15 text-missed border-missed/30' },
  }
  const { label, className } = config[status]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${className}`}>
      {label}
    </span>
  )
}

// --- Queue Row ---

function QueueRow({ entry, position, runId, onAssign }: { entry: QueuedNickname; position: number | null; runId: number; onAssign: () => void }) {
  const queryClient = useQueryClient()
  const timeAgo = entry.redeemed_at ? formatTimeAgo(entry.redeemed_at) : null
  const isSkipped = entry.status === 'skipped'

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['nicknameQueue', runId] })

  const optimisticStatus = (newStatus: QueuedNicknameStatus) => async () => {
    await queryClient.cancelQueries({ queryKey: ['nicknameQueue', runId] })
    const previous = queryClient.getQueryData<QueuedNickname[]>(['nicknameQueue', runId])
    queryClient.setQueryData<QueuedNickname[]>(['nicknameQueue', runId], (old = []) =>
      old.map((e) => (e.id === entry.id ? { ...e, status: newStatus } : e))
    )
    return { previous }
  }
  const onError = (_err: unknown, _vars: unknown, context: { previous?: QueuedNickname[] } | undefined) => {
    if (context?.previous) queryClient.setQueryData(['nicknameQueue', runId], context.previous)
  }

  const { mutate: skip } = useMutation({
    mutationFn: () => api.nicknameQueue.update(entry.id, { status: 'skipped' }),
    onMutate: optimisticStatus('skipped'),
    onError,
    onSettled: invalidate,
  })

  const { mutate: restore } = useMutation({
    mutationFn: () => api.nicknameQueue.update(entry.id, { status: 'pending' }),
    onMutate: optimisticStatus('pending'),
    onError,
    onSettled: invalidate,
  })

  const { mutate: remove } = useMutation({
    mutationFn: () => api.nicknameQueue.delete(entry.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['nicknameQueue', runId] })
      const previous = queryClient.getQueryData<QueuedNickname[]>(['nicknameQueue', runId])
      queryClient.setQueryData<QueuedNickname[]>(['nicknameQueue', runId], (old = []) =>
        old.filter((e) => e.id !== entry.id)
      )
      return { previous }
    },
    onError,
    onSettled: invalidate,
  })

  return (
    <div className={`bg-surface border border-border rounded-lg px-3 py-2.5 flex items-center gap-3 group ${isSkipped ? 'opacity-50' : ''}`}>
      <span className="text-xs font-bold text-muted w-4 text-center shrink-0">
        {position ?? '—'}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isSkipped ? 'text-muted line-through' : 'text-text'}`}>"{entry.nickname}"</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs font-medium" style={{ color: entry.redemption_type.color }}>
            {entry.redemption_type.name}
          </span>
          {entry.redeemed_by && <span className="text-xs text-muted">· @{entry.redeemed_by}</span>}
        </div>
        {timeAgo && <p className="text-xs text-muted mt-0.5">{timeAgo}</p>}
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {isSkipped ? (
          <button onClick={() => restore()} className="text-xs font-semibold text-muted hover:text-text transition-colors">Restore</button>
        ) : (
          <>
            <button onClick={onAssign} className="text-xs font-semibold text-muted hover:text-accent transition-colors">Assign</button>
            <button onClick={() => skip()} className="text-xs text-muted hover:text-pending transition-colors">Skip</button>
          </>
        )}
        <button onClick={() => remove()} className="text-xs text-muted hover:text-fainted transition-colors">Delete</button>
      </div>
    </div>
  )
}

// --- Helpers ---

function Empty({ message }: { message: string }) {
  return (
    <div className="bg-surface border border-border border-dashed rounded-lg px-4 py-8 text-center text-sm text-muted">
      {message}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface border border-border rounded-lg h-12 animate-pulse" />
      ))}
    </div>
  )
}

function formatTimeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'

  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)

  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)

  return parts.join(', ') + ' ago'
}
