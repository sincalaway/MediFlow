import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'node:path'
import { startServer } from './serverHost'

let win: BrowserWindow | null = null
let server: Awaited<ReturnType<typeof startServer>> | null = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(boot)
}

async function boot() {
  try {
    server = await startServer(app.getPath('userData'), join(__dirname, 'web'))
  } catch (e) {
    dialog.showErrorBox('MediFlow 启动失败', String((e as Error)?.stack ?? e))
    app.quit()
    return
  }
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'MediFlow 诊所管理系统',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(server!.url)) shell.openExternal(url)
    return { action: url.startsWith(server!.url) ? 'allow' : 'deny' }
  })
  win.loadURL(server!.url)
  win.on('closed', () => (win = null))
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '打开数据目录', click: () => shell.openPath(server!.dataDir) },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', role: 'reload' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
        { label: '开发者工具', role: 'toggleDevTools' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '项目主页', click: () => shell.openExternal('https://github.com/sincalaway/MediFlow') },
        {
          label: '关于',
          click: () =>
            dialog.showMessageBox({
              title: '关于 MediFlow',
              message: `MediFlow 诊所管理系统 v${app.getVersion()}`,
              detail: `离线单机版，数据保存在：\n${server?.dataDir}\n\n请定期在「系统管理 → 备份与恢复」中备份数据。`,
            }),
        },
      ],
    },
  ]
  if (process.platform === 'darwin') template.unshift({ role: 'appMenu' })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await server?.app.close().catch(() => undefined)
})
