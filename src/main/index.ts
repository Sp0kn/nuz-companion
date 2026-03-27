import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'

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

app.whenReady().then(() => {
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
