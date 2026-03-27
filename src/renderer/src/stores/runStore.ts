import { create } from 'zustand'

interface RunStore {
  selectedRunId: number | null
  setSelectedRunId: (id: number | null) => void
}

export const useRunStore = create<RunStore>((set) => ({
  selectedRunId: null,
  setSelectedRunId: (id) => set({ selectedRunId: id }),
}))
