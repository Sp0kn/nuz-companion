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

          {loadingPokemon ? (
            <Skeleton />
          ) : pokemonList.filter((p) => p.status !== 'missed').length === 0 ? (
            <Empty message="No Pokémon logged yet." />
          ) : (
            <div className="flex flex-col gap-2">
              {[...pokemonList]
                .filter((p) => p.status !== 'missed')
                .sort((a, b) => {
                  const order: Record<PokemonStatus, number> = { alive: 0, fainted: 1, missed: 2 }
                  return order[a.status as PokemonStatus] - order[b.status as PokemonStatus]
                })
                .map((p) => (
                  <PokemonRow key={p.id} pokemon={p} runId={selectedRunId} />
                ))}
            </div>
          )}
        </section>

        {/* Nickname Queue */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Nickname Queue
              </h2>
              <span className="text-xs bg-surface-2 border border-border text-muted px-2 py-0.5 rounded-full">
                {queue.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowManageTypes(true)}
                className="text-xs text-muted hover:text-text transition-colors"
              >
                ⚙ Types
              </button>
              <button
                onClick={() => setShowAddToQueue(true)}
                className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
              >
                + Add
              </button>
            </div>
          </div>

          {loadingQueue ? (
            <Skeleton />
          ) : queue.length === 0 ? (
            <Empty message="Queue is empty." />
          ) : (
            <div className="flex flex-col gap-2">
              {queue.map((entry, i) => (
                <QueueRow
                  key={entry.id}
                  entry={entry}
                  position={i + 1}
                  runId={selectedRunId}
                  onAssign={() => setAssignEntry(entry)}
                />
              ))}
            </div>
          )}
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

const RUN_STATUS_CONFIG: Record<RunStatus, { label: string; className: string }> = {
  active:    { label: 'Active',    className: 'bg-alive/15 text-alive border-alive/30' },
  completed: { label: 'Completed', className: 'bg-surface-2 text-muted border-border' },
  failed:    { label: 'Failed',    className: 'bg-fainted/15 text-fainted border-fainted/30' },
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

  const { label, className } = RUN_STATUS_CONFIG[run.status]

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

      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${className}`}>
        {label}
      </span>

      {run.status === 'active' && (
        <>
          <button onClick={() => updateStatus('completed')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-alive hover:border-alive transition-colors shrink-0">
            ✓ Complete
          </button>
          <button onClick={() => updateStatus('failed')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-fainted hover:border-fainted transition-colors shrink-0">
            ✕ Fail
          </button>
        </>
      )}
      {run.status !== 'active' && (
        <button onClick={() => updateStatus('active')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-muted transition-colors shrink-0">
          ↩ Reactivate
        </button>
      )}

      {confirmDelete ? (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-fainted">Sure?</span>
          <button onClick={() => deleteRun()} disabled={deleting} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-fainted text-white hover:bg-fainted/80 transition-colors disabled:opacity-50">
            {deleting ? '…' : 'Delete'}
          </button>
          <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted hover:text-text transition-colors">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="text-xs text-muted hover:text-fainted transition-colors shrink-0" title="Delete run">🗑</button>
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

      <div className="flex flex-col items-center shrink-0">
        <button onClick={() => update({ impatience: p.impatience + 1 })} className="text-[10px] text-muted hover:text-text leading-none transition-colors opacity-0 group-hover:opacity-100">▲</button>
        <span className="text-xs text-muted tabular-nums" title="Impatience">⚡{p.impatience}</span>
        <button onClick={() => { if (p.impatience > 0) update({ impatience: p.impatience - 1 }) }} className={`text-[10px] leading-none transition-colors opacity-0 group-hover:opacity-100 ${p.impatience === 0 ? 'text-muted/25 cursor-default' : 'text-muted hover:text-text'}`}>▼</button>
      </div>

      <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto">
        <button onClick={() => { setEditName(p.pokemon_name); setEditNickname(p.nickname ?? ''); setIsEditing(true) }} className="text-xs text-muted hover:text-text transition-colors" title="Edit">✏</button>

        {p.status === 'alive' && (
          <button onClick={() => update({ status: 'fainted' })} className="text-xs text-muted hover:text-fainted transition-colors" title="Mark fainted">☠</button>
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
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-muted hover:text-fainted transition-colors" title="Delete">🗑</button>
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

function QueueRow({ entry, position, runId, onAssign }: { entry: QueuedNickname; position: number; runId: number; onAssign: () => void }) {
  const queryClient = useQueryClient()
  const timeAgo = entry.redeemed_at ? formatTimeAgo(entry.redeemed_at) : null

  const { mutate: skip } = useMutation({
    mutationFn: () => api.nicknameQueue.update(entry.id, { status: 'skipped' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nicknameQueue', runId] }),
  })

  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2.5 flex items-center gap-3 group">
      <span className="text-xs font-bold text-muted w-4 text-center shrink-0">{position}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-text truncate">"{entry.nickname}"</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="text-xs font-medium"
            style={{ color: entry.redemption_type.color }}
          >
            {entry.redemption_type.name}
          </span>
          {entry.redeemed_by && (
            <span className="text-xs text-muted">· @{entry.redeemed_by}</span>
          )}
        </div>
        {timeAgo && <p className="text-xs text-muted mt-0.5">{timeAgo}</p>}
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onAssign} className="text-xs font-semibold text-muted hover:text-accent transition-colors">Assign</button>
        <button onClick={() => skip()} className="text-xs text-muted hover:text-fainted transition-colors" title="Skip">✕</button>
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
