import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { EV } from '@shared/channels'
import { Db } from './db/database'
import { migrate } from './db/schema'
import { HardwareManager } from './hardware'
import { broadcast, registerIpcHandlers } from './ipc'
import { createServices } from './services'

let mainWindow: BrowserWindow | null = null
let db: Db | null = null
let hardware: HardwareManager | null = null
let shuttingDown = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    title: 'Gym Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  void hardware?.stop()
  try {
    db?.close()
  } catch {
    // the database may already be closed if SQLite shut down first
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    shutdown()
  })

  void app.whenReady().then(() => {
    const databaseFile = join(app.getPath('userData'), 'gym-manager.db')
    const database = new Db(databaseFile)
    migrate(database)
    db = database

    const services = createServices(database)
    const manager = new HardwareManager({
      getSettings: () => services.settings.get(),
      onScan: async (uid, source) => {
        const outcome = await services.access.processScan(uid, source)
        broadcast(EV.accessResult, outcome)
        return outcome
      },
      onCaptured: (uid) => broadcast(EV.scanCaptured, uid),
      onStatus: (status) => broadcast(EV.hardwareStatus, status),
      getDatabaseStatus: () => ({ connected: true, detail: databaseFile })
    })
    hardware = manager
    services.setTurnstile(manager.getTurnstile())
    services.subscriptions.expireDueSubscriptions()

    registerIpcHandlers({ services, hardware: manager })
    manager.start()
    createWindow()
  })
}
