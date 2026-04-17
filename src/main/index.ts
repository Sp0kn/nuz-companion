import { app, BrowserWindow, screen, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { copyFileSync } from 'fs'
import { createServer, IncomingMessage, ServerResponse } from 'http'

let pythonProcess: ChildProcess | null = null

function startPythonBackend(): void {
  // In dev, uvicorn is started via `npm run dev` (concurrently)
  if (!app.isPackaged) return

  // In production, spawn the PyInstaller-bundled executable
  const backendExe = join(process.resourcesPath, 'backend', 'backend.exe')
  pythonProcess = spawn(backendExe, [], { stdio: 'pipe' })
  pythonProcess.stdout?.on('data', (data) => console.log(`[backend] ${data}`))
  pythonProcess.stderr?.on('data', (data) => console.error(`[backend] ${data}`))
}

function createWindow(): void {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor
  const zoomFactor = 1 + (scaleFactor - 1) * 0.25

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor,
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  if (!app.isPackaged) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function getDbPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'backend', 'nuz_companion.db')
    : join(app.getAppPath(), 'backend', 'nuz_companion.db')
}

function registerIpcHandlers(): void {
  ipcMain.handle('db:backup', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Backup Database',
      defaultPath: `nuz_companion_backup_${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (canceled || !filePath) return { success: false }
    copyFileSync(getDbPath(), filePath)
    return { success: true }
  })

  ipcMain.handle('twitch:open-auth', async (_, url: string) => {
    await shell.openExternal(url)
    return new Promise<{ code: string | null; state: string | null }>((resolve) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const urlObj = new URL(req.url!, 'http://localhost:3000')
        const code = urlObj.searchParams.get('code')
        const state = urlObj.searchParams.get('state')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Authorization successful!</h2><p>You can close this tab and return to NUZ companion.</p></body></html>')
        server.close()
        resolve({ code, state })
      })
      server.listen(3000)
      setTimeout(() => { server.close(); resolve({ code: null, state: null }) }, 300000)
    })
  })

  ipcMain.handle('db:restore', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Restore Database',
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return { success: false }
    copyFileSync(filePaths[0], getDbPath())
    return { success: true }
  })

  ipcMain.handle('dialog:pick-folder', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Select Image Output Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  startPythonBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pythonProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})
