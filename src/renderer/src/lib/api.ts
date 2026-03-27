const BASE = 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
}

// --- Types ---

export interface TwitchConfig {
  channel_name: string
  streamer_display_name: string | null
  has_streamer_token: boolean
  has_bot_token: boolean
}

export type RunStatus = 'active' | 'completed' | 'failed'
export type PokemonStatus = 'alive' | 'fainted' | 'missed'
export type QueuedNicknameStatus = 'pending' | 'assigned' | 'skipped'

export interface Game {
  id: number
  name: string
  slug: string
  generation: number
  region: string
}

export interface Run {
  id: number
  game_id: number
  name: string
  status: RunStatus
  notes: string | null
  created_at: string
  game: Game
}

export interface Zone {
  id: number
  game_id: number
  name: string
  sort_order: number
}

export interface CapturedPokemon {
  id: number
  run_id: number
  zone_id: number
  pokemon_name: string
  nickname: string | null
  twitch_username: string | null
  status: PokemonStatus
  impatience: number
  created_at: string
  zone: Zone
}

export interface RedemptionType {
  id: number
  run_id: number
  name: string
  priority: number
  color: string
  created_at: string
}

export interface QueuedNickname {
  id: number
  run_id: number
  redemption_type_id: number
  nickname: string
  redeemed_by: string | null
  redeemed_at: string | null
  status: QueuedNicknameStatus
  assigned_to_id: number | null
  created_at: string
  redemption_type: RedemptionType
}

// --- API client ---

export const api = {
  games: {
    list: () => get<Game[]>('/games'),
  },
  zones: {
    list: (gameId: number) => get<Zone[]>(`/zones?game_id=${gameId}`),
  },
  runs: {
    list: () => get<Run[]>('/runs'),
    create: (body: { game_id: number; name: string }) => post<Run>('/runs', body),
    update: (id: number, body: { name?: string; status?: RunStatus; notes?: string }) => patch<Run>(`/runs/${id}`, body),
    delete: (id: number) => del(`/runs/${id}`),
  },
  pokemon: {
    list: (runId: number) => get<CapturedPokemon[]>(`/pokemon?run_id=${runId}`),
    create: (body: { run_id: number; zone_id: number; pokemon_name: string; nickname?: string; status?: PokemonStatus }) =>
      post<CapturedPokemon>('/pokemon', body),
    update: (id: number, body: { pokemon_name?: string; nickname?: string | null; twitch_username?: string | null; status?: PokemonStatus; impatience?: number }) =>
      patch<CapturedPokemon>(`/pokemon/${id}`, body),
    delete: (id: number) => del(`/pokemon/${id}`),
  },
  nicknameQueue: {
    list: (runId: number) =>
      get<QueuedNickname[]>(`/nickname-queue?run_id=${runId}`),
    create: (body: { run_id: number; redemption_type_id: number; nickname: string; redeemed_by?: string; redeemed_at?: string }) =>
      post<QueuedNickname>('/nickname-queue', body),
    update: (id: number, body: { status?: QueuedNicknameStatus; assigned_to_id?: number }) =>
      patch<QueuedNickname>(`/nickname-queue/${id}`, body),
    delete: (id: number) => del(`/nickname-queue/${id}`),
  },
  redemptionTypes: {
    list: (runId: number) => get<RedemptionType[]>(`/redemption-types?run_id=${runId}`),
    create: (body: { run_id: number; name: string; priority: number; color?: string }) =>
      post<RedemptionType>('/redemption-types', body),
    update: (id: number, body: { name?: string; priority?: number; color?: string }) =>
      patch<RedemptionType>(`/redemption-types/${id}`, body),
    reorder: (ids: number[]) =>
      post<RedemptionType[]>('/redemption-types/reorder', { ids }),
    delete: (id: number) => del(`/redemption-types/${id}`),
  },
  twitch: {
    getConfig: () => get<TwitchConfig>('/twitch/config'),
    getAuthUrl: () => get<{ url: string; code_verifier: string }>('/twitch/auth/url'),
    exchangeCode: (code: string, codeVerifier: string) => post<TwitchConfig>('/twitch/auth/exchange', { code, code_verifier: codeVerifier }),
    pasteToken: (token: string) => post<TwitchConfig>('/twitch/auth/paste-token', { token }),
    disconnect: () => del('/twitch/auth/streamer'),
    getStatus: () => get<{ irc_connected: boolean; eventsub_connected: boolean }>('/twitch/status'),
    sendChat: (message: string) => post<{ success: boolean }>('/twitch/chat', { message }),
  },
}
