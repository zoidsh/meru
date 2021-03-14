import * as path from 'path'
import {
  app,
  ipcMain as ipc,
  BrowserWindow,
  dialog,
  nativeTheme
} from 'electron'
import { is } from 'electron-util'
import { init as initAutoUpdates } from './updates'
import config, { ConfigKey } from './config'
import { init as initDebug } from './debug'
import { init as initDownloads } from './downloads'
import { getAppMenuItemById, initAppMenu } from './app-menu'
import { setAppMenuBarVisibility, sendChannelToAllWindows } from './utils'
import ensureOnline from './ensure-online'
import {
  createView,
  getViewAccountId,
  getView,
  selectView,
  sendToViews
} from './views'
import electronContextMenu = require('electron-context-menu')
import { updateUnreadCount } from './unread'
import { initTray, toggleAppVisiblityTrayItem } from './tray'
import { shouldStartMinimized } from './constants'
import { initDock } from './dock'

initDebug()
initDownloads()
initAutoUpdates()

electronContextMenu({ showCopyImageAddress: true, showSaveImageAs: true })

if (!config.get(ConfigKey.HardwareAcceleration)) {
  app.disableHardwareAcceleration()
}

app.setAppUserModelId('io.cheung.gmail-desktop')

let mainWindow: BrowserWindow
let isQuitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.show()
  }
})

switch (config.get(ConfigKey.DarkMode)) {
  case 'system':
    nativeTheme.themeSource = 'system'
    break
  case true:
    nativeTheme.themeSource = 'dark'
    break
  default:
    nativeTheme.themeSource = 'light'
}

function createWindow(): void {
  const lastWindowState = config.get(ConfigKey.LastWindowState)

  mainWindow = new BrowserWindow({
    title: app.name,
    titleBarStyle: config.get(ConfigKey.CompactHeader)
      ? 'hiddenInset'
      : 'default',
    width: lastWindowState.bounds.width,
    height: lastWindowState.bounds.height,
    x: lastWindowState.bounds.x,
    y: lastWindowState.bounds.y,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: !shouldStartMinimized,
    icon: is.linux
      ? path.join(__dirname, '..', 'static', 'icon.png')
      : undefined,
    darkTheme: Boolean(config.get(ConfigKey.DarkMode))
  })

  if (lastWindowState.fullscreen && !mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(lastWindowState.fullscreen)
  }

  if (lastWindowState.maximized && !mainWindow.isMaximized()) {
    mainWindow.maximize()
  }

  if (is.linux || is.windows) {
    setAppMenuBarVisibility()
  }

  mainWindow.loadFile(path.resolve(__dirname, '..', 'static', 'index.html'))

  mainWindow.on('app-command', (_event, command) => {
    const selectedAccount = config.get(ConfigKey.SelectedAccount)
    const view = getView(selectedAccount)

    if (!view) {
      return
    }

    if (command === 'browser-backward' && view.webContents.canGoBack()) {
      view.webContents.goBack()
    } else if (
      command === 'browser-forward' &&
      view.webContents.canGoForward()
    ) {
      view.webContents.goForward()
    }
  })

  mainWindow.on('close', (error) => {
    if (!isQuitting) {
      error.preventDefault()
      mainWindow.blur()
      mainWindow.hide()
    }
  })

  mainWindow.on('hide', () => {
    toggleAppVisiblityTrayItem(false)
  })

  mainWindow.on('show', () => {
    toggleAppVisiblityTrayItem(true)
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()

  // @TODO: Select Account
  const replyToWindow = new BrowserWindow({
    parent: mainWindow
  })

  replyToWindow.loadURL(
    `https://mail.google.com/mail/?extsrc=mailto&url=${url}`
  )
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
  }
})

app.on('before-quit', () => {
  isQuitting = true

  if (mainWindow) {
    config.set(ConfigKey.LastWindowState, {
      bounds: mainWindow.getBounds(),
      fullscreen: mainWindow.isFullScreen(),
      maximized: mainWindow.isMaximized()
    })
  }
})
;(async () => {
  await Promise.all([ensureOnline(), app.whenReady()])

  const customUserAgent = config.get(ConfigKey.CustomUserAgent)

  if (customUserAgent) {
    app.userAgentFallback = customUserAgent
  }

  ipc.handle('dark-mode', () => {
    return nativeTheme.shouldUseDarkColors
  })

  ipc.handle('accounts', () => {
    return accounts
  })

  ipc.on('unread-count', ({ sender }, unreadCount: number) => {
    const accountId = getViewAccountId(sender.id)

    if (accountId) {
      updateUnreadCount(accountId, unreadCount)
    }
  })

  nativeTheme.on('updated', () => {
    sendChannelToAllWindows(
      'dark-mode:updated',
      nativeTheme.shouldUseDarkColors
    )
    sendToViews('dark-mode:updated', nativeTheme.shouldUseDarkColors)
  })

  createWindow()

  initAppMenu()

  initTray()

  initDock()

  const { webContents } = mainWindow!

  webContents.on('dom-ready', () => {
    if (!shouldStartMinimized) {
      mainWindow.show()
    }
  })

  ipc.handle('account-selected', (_event, accountId: string) => {
    selectView(mainWindow, accountId)
  })

  const accounts = config.get(ConfigKey.Accounts)

  for (const { id } of accounts) {
    createView(mainWindow!, id)
  }

  const selectedAccount = config.get(ConfigKey.SelectedAccount)

  selectView(mainWindow!, selectedAccount)

  if (config.get(ConfigKey.DarkMode) === undefined) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: `${app.name} (now) has dark mode! Do you want to enable it?`,
      detail:
        'It\'s recommended to set the Gmail theme to "Default" in order for dark mode to work properly.',
      buttons: ['Yes', 'No', 'Follow System Appearance', 'Ask Again Later']
    })

    if (response === 0) {
      nativeTheme.themeSource = 'dark'
      config.set(ConfigKey.DarkMode, true)

      const menuItem = getAppMenuItemById('dark-mode-enabled')
      if (menuItem) {
        menuItem.checked = true
      }
    } else if (response === 1) {
      nativeTheme.themeSource = 'light'
      config.set(ConfigKey.DarkMode, false)

      const menuItem = getAppMenuItemById('dark-mode-disabled')
      if (menuItem) {
        menuItem.checked = true
      }
    } else if (response === 2) {
      nativeTheme.themeSource = 'system'
      config.set(ConfigKey.DarkMode, 'system')

      const menuItem = getAppMenuItemById('dark-mode-system')
      if (menuItem) {
        menuItem.checked = true
      }
    }
  }
})()
