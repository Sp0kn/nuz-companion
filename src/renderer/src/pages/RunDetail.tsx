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
  })

  const { data: queue = [], isLoading: loadingQueue } = useQuery({
    queryKey: ['nicknameQueue', selectedRunId],
    queryFn: () => api.nicknameQueue.list(selectedRunId!),
    enabled: selectedRunId !== null,
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
            <button
              onClick={() => { setLogZoneId(undefined); setShowLogPokemon(true) }}
              className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              + Log Pokémon
            </button>
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
                const order: Record<PokemonStatus, number> = { alive: 0, fainted: 1, missed: 2 }
                return order[a.status as PokemonStatus] - order[b.status as PokemonStatus]
              })
            return filtered.length === 0 ? (
              <Empty message={pokemonFilter ? 'No Pokémon match your search.' : 'No Pokémon logged yet.'} />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((p) => (
                  <PokemonRow key={p.id} pokemon={p} runId={selectedRunId} />
                ))}
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pokemon', runId] }),
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
  const [confirmDelete, setConfirmDelete] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pokemon', runId] })

  const { mutate: update, isPending: saving } = useMutation({
    mutationFn: (body: Parameters<typeof api.pokemon.update>[1]) => api.pokemon.update(p.id, body),
    onSuccess: invalidate,
  })

  const { mutate: remove, isPending: deleting } = useMutation({
    mutationFn: () => api.pokemon.delete(p.id),
    onSuccess: invalidate,
  })

  const commitEdit = () => {
    const name = editName.trim()
    const nick = editNickname.trim()
    if (name) update({ pokemon_name: name, nickname: nick || null })
    setIsEditing(false)
  }

  const spriteUrl = getPokemonSpriteUrl(p.pokemon_name)
  const fainted = p.status === 'fainted'

  if (isEditing) {
    return (
      <div className="bg-surface border border-accent rounded-lg px-4 py-2.5 flex items-center gap-3">
        <span className="w-16 h-16 shrink-0" />
        <PokemonCombobox
          value={editName}
          onChange={setEditName}
          placeholder="Pokémon name"
          autoFocus
          className="flex-1 bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-text focus:outline-none focus:border-accent min-w-0"
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setIsEditing(false) }}
        />
        <input
          value={editNickname}
          onChange={(e) => setEditNickname(e.target.value)}
          placeholder="Nickname"
          className="w-28 bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-text focus:outline-none focus:border-accent"
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setIsEditing(false) }}
        />
        <button onClick={commitEdit} disabled={saving} className="text-xs text-alive hover:text-alive/80 transition-colors shrink-0">✓</button>
        <button onClick={() => setIsEditing(false)} className="text-xs text-muted hover:text-text transition-colors shrink-0">✕</button>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-4 group">
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
        <button onClick={() => { setEditName(p.pokemon_name); setEditNickname(p.nickname ?? ''); setIsEditing(true) }} className="text-xs text-muted hover:text-text transition-colors" title="Edit">✏</button>

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

  const { mutate: skip } = useMutation({
    mutationFn: () => api.nicknameQueue.update(entry.id, { status: 'skipped' }),
    onSuccess: invalidate,
  })

  const { mutate: restore } = useMutation({
    mutationFn: () => api.nicknameQueue.update(entry.id, { status: 'pending' }),
    onSuccess: invalidate,
  })

  const { mutate: remove } = useMutation({
    mutationFn: () => api.nicknameQueue.delete(entry.id),
    onSuccess: invalidate,
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
