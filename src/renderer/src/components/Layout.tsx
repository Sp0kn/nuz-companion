import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Run, CapturedPokemon } from '../lib/api'
import { useRunStore } from '../stores/runStore'
import { useThemeStore } from '../stores/themeStore'
import CreateRunModal from './CreateRunModal'

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

  return (
    <div className="flex h-screen bg-bg text-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-surface border-r border-border">
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

declare global {
  interface Window {
    electronAPI: {
      backupDb: () => Promise<{ success: boolean }>
      restoreDb: () => Promise<{ success: boolean }>
      twitchOpenAuth: (url: string) => Promise<{ code: string | null; state: string | null }>
    }
  }
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, setTheme } = useThemeStore()
  const queryClient = useQueryClient()
  const [backupStatus, setBackupStatus] = useState<'idle' | 'ok'>('idle')
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'ok'>('idle')
  const [restoreConfirm, setRestoreConfirm] = useState<'idle' | 'confirm'>('idle')

  const { data: twitchConfig } = useQuery({
    queryKey: ['twitchConfig'],
    queryFn: api.twitch.getConfig,
  })

  const refetchTwitchConfig = () => queryClient.invalidateQueries({ queryKey: ['twitchConfig'] })

  const handleBackup = async () => {
    const result = await window.electronAPI.backupDb()
    if (result.success) { setBackupStatus('ok'); setTimeout(() => setBackupStatus('idle'), 2000) }
  }

  const handleRestore = async () => {
    setRestoreConfirm('idle')
    const result = await window.electronAPI.restoreDb()
    if (result.success) { setRestoreStatus('ok'); setTimeout(() => { setRestoreStatus('idle'); onClose() }, 1500) }
  }

  const handleTwitchOAuth = async () => {
    const { url, code_verifier } = await api.twitch.getAuthUrl()
    const { code } = await window.electronAPI.twitchOpenAuth(url)
    if (code) {
      await api.twitch.exchangeCode(code, code_verifier)
      refetchTwitchConfig()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div className="bg-surface border border-border rounded-xl p-5 w-96 flex flex-col gap-5 max-h-[90vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-text">Settings</h2>

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

        {/* Twitch */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Twitch Integration</p>
          <TwitchAccountRow
            connected={twitchConfig?.has_streamer_token ?? false}
            displayName={twitchConfig?.streamer_display_name ?? null}
            onOAuth={handleTwitchOAuth}
            onPasteToken={async (t) => { await api.twitch.pasteToken(t); refetchTwitchConfig() }}
            onDisconnect={async () => { await api.twitch.disconnect(); refetchTwitchConfig() }}
          />
        </div>

        {/* Database */}
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

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="text-xs font-semibold px-4 py-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-muted transition-colors">Close</button>
        </div>
      </div>
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
            <button onClick={onOAuth} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#9146ff] text-white hover:bg-[#7d2ff7] transition-colors">
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
