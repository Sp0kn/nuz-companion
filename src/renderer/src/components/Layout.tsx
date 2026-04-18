import { useState, useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Run, CapturedPokemon, TwitchRewardsConfig, RunLevelCap } from '../lib/api'
import { useRunStore } from '../stores/runStore'
import { useThemeStore } from '../stores/themeStore'
import CreateRunModal from './CreateRunModal'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function Layout() {
  const { data: runs = [] } = useQuery({
    queryKey: ['runs'],
    queryFn: api.runs.list,
  })

  const { selectedRunId, setSelectedRunId } = useRunStore()
  const [showCreateRun, setShowCreateRun] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Auto-select when no valid run is selected
  useEffect(() => {
    if (runs.length === 0) return
    if (selectedRunId !== null && runs.some((r) => r.id === selectedRunId)) return
    const active = runs.find((r) => r.status === 'active') ?? runs[0]
    if (active) setSelectedRunId(active.id)
  }, [runs, selectedRunId, setSelectedRunId])

  const selectedRun = runs.find((r) => r.id === selectedRunId)

  // Keep backend in sync with the currently selected run (for auto-queuing)
  useEffect(() => {
    api.twitch.setCurrentRun(selectedRunId).catch(() => {})
  }, [selectedRunId])

  return (
    <div className="flex h-screen bg-bg text-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-surface border-r border-border overflow-y-auto">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="none">
            {/* Bottom white half */}
            <path d="M2 12 A10 10 0 0 0 22 12 Z" fill="white" />
            {/* Top red half */}
            <path d="M2 12 A10 10 0 0 1 22 12 Z" fill="#cc2200" />
            {/* Outer circle */}
            <circle cx="12" cy="12" r="10" stroke="#1a1a1a" strokeWidth="1.5" />
            {/* Middle band */}
            <line x1="2" y1="12" x2="22" y2="12" stroke="#1a1a1a" strokeWidth="2.5" />
            {/* Center button */}
            <circle cx="12" cy="12" r="3.5" fill="white" stroke="#1a1a1a" strokeWidth="1.5" />
          </svg>
          <h1 className="text-lg font-bold tracking-wide text-accent">
            NUZ<span className="text-text">companion</span>
          </h1>
        </div>

        {/* Run selector */}
        <div className="px-4 py-4 border-b border-border flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Active Run
            </label>
            <button
              onClick={() => setShowCreateRun(true)}
              className="text-xs text-accent hover:text-accent-hover font-semibold transition-colors"
              title="New Run"
            >
              + New
            </button>
          </div>

          {runs.length === 0 ? (
            <button
              onClick={() => setShowCreateRun(true)}
              className="w-full text-xs text-muted border border-dashed border-border rounded-md px-2 py-2 hover:border-accent hover:text-accent transition-colors"
            >
              Create your first run
            </button>
          ) : (
            <select
              value={selectedRunId ?? ''}
              onChange={(e) => setSelectedRunId(Number(e.target.value))}
              className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
            >
              {(['active', 'completed', 'failed'] as const).map((status) => {
                const group = runs.filter((r) => r.status === status)
                if (group.length === 0) return null
                const label = status.charAt(0).toUpperCase() + status.slice(1)
                const color = { active: '#f97316', completed: '#22c55e', failed: '#ef4444' }[status]
                return (
                  <optgroup key={status} label={label}>
                    {group.map((r: Run) => (
                      <option key={r.id} value={r.id} style={{ color }}>{r.name}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          )}

          {selectedRun && (
            <p className="text-xs text-muted">
              {selectedRun.game.name} · Gen {selectedRun.game.generation}
            </p>
          )}
        </div>

        {/* Run stats */}
        {selectedRun && <RunStats runId={selectedRun.id} gameId={selectedRun.game_id} />}

        {/* Level caps */}
        {selectedRun && <NavLevelCaps runId={selectedRun.id} />}

        <div className="flex-1" />

        {/* Settings button */}
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-xs text-muted hover:text-text transition-colors w-full"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Settings
          </button>
        </div>

        {/* Backend status */}
        <BackendStatus />
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Modals */}
      {showCreateRun && <CreateRunModal onClose={() => setShowCreateRun(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function RunStats({ runId, gameId }: { runId: number; gameId: number }) {
  const { data: pokemon = [] } = useQuery({
    queryKey: ['pokemon', runId],
    queryFn: () => api.pokemon.list(runId),
    refetchInterval: 5000,
  })

  const { data: zones = [] } = useQuery({
    queryKey: ['zones', gameId],
    queryFn: () => api.zones.list(gameId),
  })

  const { data: queue = [] } = useQuery({
    queryKey: ['nicknameQueue', runId],
    queryFn: () => api.nicknameQueue.list(runId),
    refetchInterval: 5000,
  })

  const alive = pokemon.filter((p) => p.status === 'alive').length
  const fainted = pokemon.filter((p) => p.status === 'fainted').length
  const missed = pokemon.filter((p) => p.status === 'missed').length
  const encountered = pokemon.length
  const totalZones = zones.length
  const pendingNicknames = queue.filter((e) => e.status === 'pending').length

  const top3 = [...pokemon]
    .filter((p) => p.status === 'alive' && p.impatience > 0)
    .sort((a, b) => b.impatience - a.impatience)
    .slice(0, 3)

  return (
    <div className="px-4 py-4 border-b border-border flex flex-col gap-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">Run Stats</p>

      {/* Status counts */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-alive"><span className="w-1.5 h-1.5 rounded-full bg-alive inline-block" />Alive</span>
          <span className="font-semibold text-text">{alive}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-fainted"><span className="w-1.5 h-1.5 rounded-full bg-fainted inline-block" />Fainted</span>
          <span className="font-semibold text-text">{fainted}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted"><span className="w-1.5 h-1.5 rounded-full bg-muted/50 inline-block" />Missed</span>
          <span className="font-semibold text-text">{missed}</span>
        </div>
      </div>

      {/* Zone completion */}
      {totalZones > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Zones</span>
            <span className="font-semibold text-text">{encountered}/{totalZones}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${Math.round((encountered / totalZones) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Nickname queue */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Nicknames in queue</span>
        <span className="font-semibold text-text">{pendingNicknames}</span>
      </div>

      {/* Top 3 most impatient */}
      {top3.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted">Most impatient</p>
          {top3.map((p: CapturedPokemon) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className="text-text truncate">{p.nickname ?? p.pokemon_name}</span>
              <span className="text-amber-400 font-semibold shrink-0 ml-1">⚡{p.impatience}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sortable row for a single level-cap milestone ───────────────────────────
function SortableCapRow({
  cap,
  editingId,
  editLevel,
  setEditingId,
  setEditLevel,
  onToggleCleared,
  onCommitLevel,
  onRemove,
}: {
  cap: RunLevelCap
  editingId: number | null
  editLevel: string
  setEditingId: (id: number | null) => void
  setEditLevel: (v: string) => void
  onToggleCleared: (cap: RunLevelCap) => void
  onCommitLevel: (cap: RunLevelCap) => void
  onRemove: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cap.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 px-1 py-0.5 rounded group transition-opacity ${cap.is_cleared ? 'opacity-35' : ''}`}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-muted/30 hover:text-muted shrink-0 cursor-grab active:cursor-grabbing select-none text-[10px] leading-none"
        title="Drag to reorder"
      >
        ⠿
      </span>

      {/* Cleared toggle */}
      <button
        onClick={() => onToggleCleared(cap)}
        className={`text-xs shrink-0 w-4 transition-colors ${cap.is_cleared ? 'text-alive' : 'text-muted/40 hover:text-muted'}`}
        title={cap.is_cleared ? 'Mark as upcoming' : 'Mark as cleared'}
      >
        {cap.is_cleared ? '✓' : '○'}
      </button>

      {/* Milestone label */}
      <span className={`text-xs flex-1 min-w-0 truncate ${cap.is_cleared ? 'line-through text-muted' : 'text-text'}`}>
        {cap.milestone}
      </span>

      {/* Level inline edit */}
      {editingId === cap.id ? (
        <input
          type="number"
          value={editLevel}
          autoFocus
          min={1} max={100}
          onChange={(e) => setEditLevel(e.target.value)}
          onBlur={() => onCommitLevel(cap)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitLevel(cap)
            if (e.key === 'Escape') setEditingId(null)
          }}
          className="w-10 text-xs text-right bg-surface-2 border border-accent rounded px-1 py-0.5 focus:outline-none tabular-nums"
        />
      ) : (
        <button
          onClick={() => { setEditingId(cap.id); setEditLevel(String(cap.level)) }}
          className="text-xs font-semibold tabular-nums text-muted hover:text-accent shrink-0 transition-colors"
          title="Edit level"
        >
          {cap.level}
        </button>
      )}

      {/* Remove */}
      <button
        onClick={() => onRemove(cap.id)}
        className="text-muted/0 group-hover:text-muted/40 hover:!text-fainted shrink-0 text-xs transition-colors"
        title="Remove"
      >✕</button>
    </div>
  )
}

// ── Level caps widget in the left navbar ─────────────────────────────────────
function NavLevelCaps({ runId }: { runId: number }) {
  const queryClient = useQueryClient()
  const { data: caps = [], isLoading } = useQuery({
    queryKey: ['runLevelCaps', runId],
    queryFn: () => api.runLevelCaps.list(runId),
  })

  // Local optimistic order — kept in sync with server data
  const [orderedIds, setOrderedIds] = useState<number[]>([])
  const prevCapsRef = useRef<RunLevelCap[]>([])

  useEffect(() => {
    // Only reset local order when the server IDs actually change (add/delete)
    const prevIds = prevCapsRef.current.map((c) => c.id).join(',')
    const nextIds = caps.map((c) => c.id).join(',')
    if (prevIds !== nextIds) {
      setOrderedIds(caps.map((c) => c.id))
      prevCapsRef.current = caps
    }
  }, [caps])

  const orderedCaps = orderedIds
    .map((id) => caps.find((c) => c.id === id))
    .filter((c): c is RunLevelCap => c !== undefined)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLevel, setEditLevel] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newMilestone, setNewMilestone] = useState('')
  const [newLevel, setNewLevel] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['runLevelCaps', runId] })

  const { mutate: update } = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof api.runLevelCaps.update>[1] }) =>
      api.runLevelCaps.update(id, body),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: ['runLevelCaps', runId] })
      const previous = queryClient.getQueryData<RunLevelCap[]>(['runLevelCaps', runId])
      queryClient.setQueryData<RunLevelCap[]>(['runLevelCaps', runId], (old = []) =>
        old.map((c) => (c.id === id ? { ...c, ...body } : c))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['runLevelCaps', runId], context.previous)
    },
    onSettled: invalidate,
  })
  const { mutate: create } = useMutation({
    mutationFn: (body: Parameters<typeof api.runLevelCaps.create>[0]) =>
      api.runLevelCaps.create(body),
    onSuccess: () => { invalidate(); setAddingNew(false); setNewMilestone(''); setNewLevel('') },
  })
  const { mutate: remove } = useMutation({
    mutationFn: (id: number) => api.runLevelCaps.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['runLevelCaps', runId] })
      const previous = queryClient.getQueryData<RunLevelCap[]>(['runLevelCaps', runId])
      queryClient.setQueryData<RunLevelCap[]>(['runLevelCaps', runId], (old = []) =>
        old.filter((c) => c.id !== id)
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['runLevelCaps', runId], context.previous)
    },
    onSettled: invalidate,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = orderedIds.indexOf(active.id as number)
    const newIndex = orderedIds.indexOf(over.id as number)
    const newOrder = arrayMove(orderedIds, oldIndex, newIndex)
    setOrderedIds(newOrder)

    // Persist new sort_orders to backend
    newOrder.forEach((id, idx) => {
      if (caps.find((c) => c.id === id)?.sort_order !== idx) {
        update({ id, body: { sort_order: idx } })
      }
    })
  }

  const commitLevelEdit = (cap: RunLevelCap) => {
    const l = parseInt(editLevel)
    if (!isNaN(l) && l >= 1 && l <= 100) update({ id: cap.id, body: { level: l } })
    setEditingId(null)
  }
  const commitNewCap = () => {
    const l = parseInt(newLevel)
    if (!newMilestone.trim() || isNaN(l) || l < 1) return
    create({ run_id: runId, milestone: newMilestone.trim(), level: l })
  }

  const activeCap = orderedCaps.find((c) => !c.is_cleared)

  if (isLoading || caps.length === 0) return null

  return (
    <div className="px-4 py-4 border-b border-border flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Level Cap</p>
        <button
          onClick={() => setAddingNew((v) => !v)}
          className="text-xs text-muted hover:text-text transition-colors"
          title="Add milestone"
        >+</button>
      </div>

      {/* Active cap badge */}
      {activeCap && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
          <span className="text-xs text-accent font-medium truncate pr-2">{activeCap.milestone}</span>
          <span className="text-sm font-bold text-accent tabular-nums shrink-0">Lv {activeCap.level}</span>
        </div>
      )}

      {/* Sortable milestone list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-0.5">
            {orderedCaps.map((cap) => (
              <SortableCapRow
                key={cap.id}
                cap={cap}
                editingId={editingId}
                editLevel={editLevel}
                setEditingId={setEditingId}
                setEditLevel={setEditLevel}
                onToggleCleared={(c) => update({ id: c.id, body: { is_cleared: !c.is_cleared } })}
                onCommitLevel={commitLevelEdit}
                onRemove={remove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {addingNew && (
        <div className="flex flex-col gap-1.5 border border-border rounded-lg px-2 py-2">
          <input
            value={newMilestone}
            onChange={(e) => setNewMilestone(e.target.value)}
            placeholder="Milestone name"
            autoFocus
            className="text-xs bg-surface-2 border border-border rounded px-2 py-1 text-text focus:outline-none focus:border-accent"
            onKeyDown={(e) => { if (e.key === 'Enter') commitNewCap(); if (e.key === 'Escape') setAddingNew(false) }}
          />
          <div className="flex gap-1">
            <input
              type="number"
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
              placeholder="Lv"
              min={1} max={100}
              className="text-xs bg-surface-2 border border-border rounded px-2 py-1 text-text focus:outline-none focus:border-accent w-16 tabular-nums"
              onKeyDown={(e) => { if (e.key === 'Enter') commitNewCap(); if (e.key === 'Escape') setAddingNew(false) }}
            />
            <button onClick={commitNewCap} className="text-xs text-alive hover:text-alive/80 transition-colors px-2">✓</button>
            <button onClick={() => { setAddingNew(false); setNewMilestone(''); setNewLevel('') }} className="text-xs text-muted hover:text-text transition-colors px-1">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

declare global {
  interface Window {
    electronAPI: {
      backupDb: () => Promise<{ success: boolean }>
      restoreDb: () => Promise<{ success: boolean }>
      twitchOpenAuth: (url: string) => Promise<{ code: string | null; state: string | null }>
      pickFolder: () => Promise<string | null>
    }
  }
}

type SettingsTab = 'general' | 'twitch' | 'database'

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('general')
  const queryClient = useQueryClient()

  const { data: twitchConfig } = useQuery({
    queryKey: ['twitchConfig'],
    queryFn: api.twitch.getConfig,
  })
  const refetchTwitchConfig = () => {
    queryClient.invalidateQueries({ queryKey: ['twitchConfig'] })
    queryClient.invalidateQueries({ queryKey: ['twitchRewards'] })
  }

  const handleTwitchOAuth = async () => {
    const { url, code_verifier } = await api.twitch.getAuthUrl()
    const { code } = await window.electronAPI.twitchOpenAuth(url)
    if (code) {
      await api.twitch.exchangeCode(code, code_verifier)
      refetchTwitchConfig()
    }
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'twitch', label: 'Twitch' },
    { id: 'database', label: 'Database' },
  ]

  const connected = twitchConfig?.has_streamer_token ?? false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div className="bg-surface border border-border rounded-xl w-[580px] h-[520px] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-sm font-semibold text-text">Settings</h2>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-5 border-b border-border shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-1.5 transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-accent text-text font-semibold'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — scrolls independently */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {tab === 'twitch' && (
            <div className="grid grid-cols-2 gap-5 h-full">
              {/* Left: account + sub info */}
              <div className="flex flex-col gap-3">
                <TwitchAccountRow
                  connected={connected}
                  displayName={twitchConfig?.streamer_display_name ?? null}
                  onOAuth={handleTwitchOAuth}
                  onPasteToken={async (t) => { await api.twitch.pasteToken(t); refetchTwitchConfig() }}
                  onDisconnect={async () => { await api.twitch.disconnect(); refetchTwitchConfig() }}
                />
                <SubSection />
              </div>
              {/* Right: channel rewards */}
              <RewardsSection connected={connected} />
            </div>
          )}
          {tab === 'general' && <GeneralTab />}
          {tab === 'database' && <DatabaseTab onClose={onClose} />}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end">
          <button onClick={onClose} className="text-xs font-semibold px-4 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-muted transition-colors">Close</button>
        </div>
      </div>
    </div>
  )
}

function GeneralTab() {
  const { theme, setTheme } = useThemeStore()
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['appSettings'],
    queryFn: api.appSettings.get,
  })

  const { mutate: saveSettings } = useMutation({
    mutationFn: (body: { image_output_path: string | null }) => api.appSettings.update(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appSettings'] }),
  })

  const handlePickFolder = async () => {
    const folder = await window.electronAPI.pickFolder()
    if (folder !== null) saveSettings({ image_output_path: folder || null })
  }

  const handleClearFolder = () => saveSettings({ image_output_path: null })

  return (
    <div className="flex flex-col gap-5">
      {/* Appearance */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Appearance</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text">Theme</span>
          <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1 border border-border">
            <button onClick={() => setTheme('dark')} className={`text-xs px-3 py-1 rounded-md transition-colors ${theme === 'dark' ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}>Dark</button>
            <button onClick={() => setTheme('light')} className={`text-xs px-3 py-1 rounded-md transition-colors ${theme === 'light' ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}>Light</button>
          </div>
        </div>
      </div>

      {/* Image output */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Image Output</p>
        <p className="text-xs text-muted leading-relaxed">
          Folder where overlay images are saved. The team image is saved as <span className="text-text font-medium">team.png</span> and individual Pokémon are saved inside a <span className="text-text font-medium">Captured Pokemon/</span> subfolder.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 bg-surface-2 border border-border rounded-lg px-3 py-2">
            {settings?.image_output_path
              ? <span className="text-xs text-text truncate block">{settings.image_output_path}</span>
              : <span className="text-xs text-muted italic">No folder selected</span>
            }
          </div>
          <button
            onClick={handlePickFolder}
            className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
          >
            Browse…
          </button>
          {settings?.image_output_path && (
            <button
              onClick={handleClearFolder}
              className="shrink-0 text-xs text-muted hover:text-fainted transition-colors"
              title="Clear path"
            >✕</button>
          )}
        </div>
      </div>
    </div>
  )
}

function DatabaseTab({ onClose }: { onClose: () => void }) {
  const [backupStatus, setBackupStatus] = useState<'idle' | 'ok'>('idle')
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'ok'>('idle')
  const [restoreConfirm, setRestoreConfirm] = useState<'idle' | 'confirm'>('idle')

  const handleBackup = async () => {
    const result = await window.electronAPI.backupDb()
    if (result.success) { setBackupStatus('ok'); setTimeout(() => setBackupStatus('idle'), 2000) }
  }

  const handleRestore = async () => {
    setRestoreConfirm('idle')
    const result = await window.electronAPI.restoreDb()
    if (result.success) { setRestoreStatus('ok'); setTimeout(() => { setRestoreStatus('idle'); onClose() }, 1500) }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">Database</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-text">Backup</p><p className="text-xs text-muted">Save a copy of your data</p></div>
          <button onClick={handleBackup} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-muted transition-colors shrink-0">
            {backupStatus === 'ok' ? '✓ Saved' : 'Backup'}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-text">Restore</p><p className="text-xs text-muted">Overwrites current data</p></div>
            {restoreConfirm === 'confirm' ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-fainted">Sure?</span>
                <button onClick={handleRestore} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-fainted text-white hover:bg-fainted/80 transition-colors">{restoreStatus === 'ok' ? '✓ Done' : 'Yes'}</button>
                <button onClick={() => setRestoreConfirm('idle')} className="text-xs text-muted hover:text-text transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setRestoreConfirm('confirm')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted hover:text-fainted hover:border-fainted transition-colors shrink-0">Restore</button>
            )}
          </div>
          {restoreConfirm === 'confirm' && <p className="text-xs text-amber-400">Backup your current data first!</p>}
          {restoreStatus === 'ok' && <p className="text-xs text-amber-400">Fetching data...</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Rewards section (inside Twitch tab) ─────────────────────────────────────

function RewardsSection({ connected }: { connected: boolean }) {
  const queryClient = useQueryClient()
  const { data: rewards, isLoading } = useQuery({
    queryKey: ['twitchRewards'],
    queryFn: api.twitch.getRewards,
  })
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['twitchRewards'] })

  if (isLoading) return <p className="text-xs text-muted">Loading…</p>
  if (!rewards) return null

  return (
    <div className="flex flex-col gap-4">
      {!connected && (
        <p className="text-xs text-amber-400">Connect your Twitch account first to manage rewards.</p>
      )}
      <NicknameRewardSection rewards={rewards} connected={connected} onUpdate={refetch} />
      <ImpatienceRewardSection rewards={rewards} connected={connected} onUpdate={refetch} />
    </div>
  )
}

function NicknameRewardSection({ rewards, connected, onUpdate }: {
  rewards: TwitchRewardsConfig; connected: boolean; onUpdate: () => void
}) {
  const [cost, setCost] = useState(String(rewards.nickname_reward_cost))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setError(null); setSaving(true)
    try { await api.twitch.createNicknameReward(); onUpdate() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setError(null); setSaving(true)
    try { await api.twitch.deleteNicknameReward(); onUpdate() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleSaveCost = async () => {
    const n = parseInt(cost)
    if (isNaN(n) || n < 1) return
    setSaving(true)
    try { await api.twitch.updateNicknameReward(n); onUpdate() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-text">Nickname Reward</p>
          <p className="text-xs text-muted">Viewer redeems to get their username as a nickname</p>
        </div>
        {rewards.nickname_reward_id ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-alive">Active</span>
            <button onClick={handleDelete} disabled={saving} className="text-xs text-muted hover:text-fainted transition-colors">Delete</button>
          </div>
        ) : (
          <button onClick={handleCreate} disabled={!connected || saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 shrink-0">
            Create
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted w-20 shrink-0">Cost (pts)</label>
        <input
          type="number" min={1} value={cost}
          onChange={(e) => setCost(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCost() }}
          className="w-24 bg-surface-2 border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
        />
        <button onClick={handleSaveCost} disabled={saving} className="text-xs font-semibold px-2.5 py-1 rounded-md border border-border text-muted hover:text-text hover:border-muted transition-colors disabled:opacity-40">
          Save
        </button>
      </div>
      {error && <p className="text-xs text-fainted">{error}</p>}
      <p className="text-xs text-muted">Creates the "Channel Reward" redemption type in all runs.</p>
    </div>
  )
}

function ImpatienceRewardSection({ rewards, connected, onUpdate }: {
  rewards: TwitchRewardsConfig; connected: boolean; onUpdate: () => void
}) {
  const [cost, setCost] = useState(String(rewards.impatience_reward_cost))
  const [normal, setNormal] = useState(String(rewards.impatience_points_normal))
  const [vip, setVip] = useState(String(rewards.impatience_points_vip))
  const [sub, setSub] = useState(String(rewards.impatience_points_sub))
  const [priority, setPriority] = useState<string[]>(rewards.impatience_priority.split(',').map((s) => s.trim()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setError(null); setSaving(true)
    try { await api.twitch.createImpatienceReward(); onUpdate() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setError(null); setSaving(true)
    try { await api.twitch.deleteImpatienceReward(); onUpdate() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleSaveCost = async () => {
    const n = parseInt(cost)
    if (isNaN(n) || n < 1) return
    setSaving(true)
    try { await api.twitch.updateImpatienceReward(n); onUpdate() }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleSaveSettings = async () => {
    setSaving(true); setError(null)
    try {
      await api.twitch.updateRewards({
        impatience_points_normal: parseInt(normal) || 1,
        impatience_points_vip: parseInt(vip) || 1,
        impatience_points_sub: parseInt(sub) || 1,
        impatience_priority: priority.join(','),
      })
      onUpdate()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const movePriority = (idx: number, dir: -1 | 1) => {
    const next = [...priority]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]]
    setPriority(next)
  }

  const tierLabel: Record<string, string> = { sub: 'Subscriber', vip: 'VIP', normal: 'Normal' }
  const tierValue: Record<string, string> = { sub, vip, normal }
  const tierSet: Record<string, (v: string) => void> = { sub: setSub, vip: setVip, normal: setNormal }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-text">Impatience Reward</p>
          <p className="text-xs text-muted">Viewer enters a Pokémon name/nickname to add impatience points</p>
        </div>
        {rewards.impatience_reward_id ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-alive">Active</span>
            <button onClick={handleDelete} disabled={saving} className="text-xs text-muted hover:text-fainted transition-colors">Delete</button>
          </div>
        ) : (
          <button onClick={handleCreate} disabled={!connected || saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 shrink-0">
            Create
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted w-20 shrink-0">Cost (pts)</label>
        <input
          type="number" min={1} value={cost}
          onChange={(e) => setCost(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCost() }}
          className="w-24 bg-surface-2 border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
        />
        <button onClick={handleSaveCost} disabled={saving} className="text-xs font-semibold px-2.5 py-1 rounded-md border border-border text-muted hover:text-text hover:border-muted transition-colors disabled:opacity-40">
          Save
        </button>
      </div>

      <div className="flex flex-col gap-2 bg-surface-2 border border-border rounded-lg p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Points &amp; Priority</p>
          <p className="text-xs text-muted">highest priority first</p>
        </div>
        <p className="text-xs text-muted">If a viewer qualifies for multiple tiers, the highest-priority one applies.</p>
        {priority.map((tier, idx) => (
          <div key={tier} className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5 shrink-0">
              <button onClick={() => movePriority(idx, -1)} disabled={idx === 0} className="text-[10px] leading-none px-1 py-0.5 rounded border border-border text-muted hover:text-text disabled:opacity-30 transition-colors">↑</button>
              <button onClick={() => movePriority(idx, 1)} disabled={idx === priority.length - 1} className="text-[10px] leading-none px-1 py-0.5 rounded border border-border text-muted hover:text-text disabled:opacity-30 transition-colors">↓</button>
            </div>
            <label className="text-xs text-muted w-20 shrink-0">{tierLabel[tier]}</label>
            <input
              type="number" min={0} value={tierValue[tier]}
              onChange={(e) => tierSet[tier](e.target.value)}
              className="w-16 bg-surface border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-muted">pts</span>
          </div>
        ))}
        <button onClick={handleSaveSettings} disabled={saving} className="self-end text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 mt-1">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
      {error && <p className="text-xs text-fainted">{error}</p>}
    </div>
  )
}

function SubSection() {
  return (
    <div className="flex flex-col gap-1.5 mt-auto">
      <p className="text-xs font-semibold text-text">Subs &amp; Gift Subs</p>
      <p className="text-xs text-muted leading-relaxed">
        Automatically handled when connected — each sub or gift sub creates an empty nickname slot in the queue.
        Gift subs create one slot per gift, attributed to the gifter.
        Creates the <span className="text-text">"Twitch Sub"</span> redemption type (red, priority 1) in all runs.
      </p>
    </div>
  )
}

function TwitchAccountRow({ connected, displayName, onOAuth, onPasteToken, onDisconnect }: {
  connected: boolean; displayName: string | null
  onOAuth: () => void; onPasteToken: (t: string) => void; onDisconnect: () => void
}) {
  const [showPaste, setShowPaste] = useState(false)
  const [token, setToken] = useState('')

  const handlePaste = () => {
    if (token.trim()) { onPasteToken(token.trim()); setToken(''); setShowPaste(false) }
  }

  return (
    <div className="flex flex-col gap-2 bg-surface-2 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-text">Your Twitch channel</p>
          <p className="text-xs text-muted">Enables the bot and channel point redemptions</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-alive' : 'bg-muted/40'}`} />
          <span className={`text-xs ${connected ? 'text-alive' : 'text-muted'}`}>
            {connected ? (displayName ?? 'Connected') : 'Not connected'}
          </span>
        </div>
      </div>

      {connected ? (
        <button onClick={onDisconnect} className="text-xs text-muted hover:text-fainted transition-colors self-start">Disconnect</button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2 items-center">
            <button
              onClick={onOAuth}
              title="Grants permission to manage channel rewards, read subscriptions, and read VIP status. Re-authenticate if you connected before rewards were added."
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#9146ff] text-white hover:bg-[#7d2ff7] transition-colors"
            >
              Login with Twitch
            </button>
            <button onClick={() => setShowPaste(!showPaste)} className="text-xs text-muted hover:text-text transition-colors">
              or paste token
            </button>
          </div>
          {showPaste && (
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePaste() }}
                placeholder="Paste your OAuth token…"
                className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
              />
              <button onClick={handlePaste} className="text-xs font-semibold px-2.5 py-1 rounded-md bg-accent text-white hover:bg-accent-hover transition-colors">Save</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BackendStatus() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('http://localhost:8000/health').then((r) => r.json()),
    refetchInterval: 15_000,
    retry: false,
  })

  const online = !isError && data?.status === 'ok'

  return (
    <div className="px-5 py-3 border-t border-border flex items-center gap-2 text-xs text-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-alive' : 'bg-fainted animate-pulse'}`} />
      {online ? 'Backend online' : 'Backend offline'}
    </div>
  )
}
