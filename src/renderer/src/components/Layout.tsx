import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, Run } from '../lib/api'
import { useRunStore } from '../stores/runStore'
import CreateRunModal from './CreateRunModal'

export default function Layout() {
  const { data: runs = [] } = useQuery({
    queryKey: ['runs'],
    queryFn: api.runs.list,
  })

  const { selectedRunId, setSelectedRunId } = useRunStore()
  const [showCreateRun, setShowCreateRun] = useState(false)

  // Auto-select when no valid run is selected
  useEffect(() => {
    if (runs.length === 0) return
    if (selectedRunId !== null && runs.some((r) => r.id === selectedRunId)) return
    const active = runs.find((r) => r.status === 'active') ?? runs[0]
    if (active) setSelectedRunId(active.id)
  }, [runs, selectedRunId, setSelectedRunId])

  const selectedRun = runs.find((r) => r.id === selectedRunId)

  return (
    <div className="flex h-screen bg-bg text-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-surface border-r border-border">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
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

        <div className="flex-1" />

        {/* Backend status */}
        <BackendStatus />
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Modals */}
      {showCreateRun && <CreateRunModal onClose={() => setShowCreateRun(false)} />}
    </div>
  )
}

function BackendStatus() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('http://localhost:8000/health').then((r) => r.json()),
    refetchInterval: 5000,
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
