import { contextBridge } from 'electron'

// Expose a typed API to the renderer via window.api
// Add IPC methods here as needed
contextBridge.exposeInMainWorld('api', {})
