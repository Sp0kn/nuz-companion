import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  backupDb: () => ipcRenderer.invoke('db:backup'),
  restoreDb: () => ipcRenderer.invoke('db:restore'),
  twitchOpenAuth: (url: string) => ipcRenderer.invoke('twitch:open-auth', url),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder') as Promise<string | null>,
})
