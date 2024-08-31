const {
    app,
    BrowserWindow,
    dialog,
    Notification
} = require('electron')

const {
    exec
} = require("node:child_process")

let win
let devmode = (process.argv[2] === "dev") ? true : false

if (process.platform === "win32") {
    app.setAppUserModelId("Kick VOD Downloader");
}

const createWindow = async () => {
    win = new BrowserWindow({
        webPreferences: {
            devTools: devmode
        },
        autoHideMenuBar: !devmode,
        minWidth: 850,
        minHeight: 550,
        height: 550,
        icon: "./public/logo.png" || null,
    })
    win.loadURL('http://localhost:3000')
}

const createCriticalError = async (message, detail) => {
    dialog.showMessageBox(null, {
        type: "error",
        buttons: ["Exit"],
        title: "Error",
        message: message,
        detail: detail,
        defaultId: 0
    }).then(() => {
        process.exit(0)
    })
}

const createFolderSelectDialog = async () => new Promise(async (resolve, reject) => {
    dialog.showSaveDialog(null, {
        filters: [{
            name: 'MPEG-4 Part 14',
            extensions: ['mp4']
        }]
    }).then((data) => {
        resolve(data)
    })
})

const createFFMPEGPathDialog = async () => new Promise(async (resolve, reject) => {
    dialog.showOpenDialog(null, {
        title: "Select FFMPEG Executable",
        properties: ['openFile'],
        filters: [{
            name: 'Windows Executables',
            extensions: ['exe']
        }]
    }).then((data) => {
        resolve(data)
    })
})

const createSuccessNotif = async (savePath) => {
    const notif = new Notification({
        title: "Finished Downloading",
        body: `Click to see ${savePath.split("\\").slice(-1)[0]}`
    })
    notif.on("click", () => {
        exec(`explorer /select,"${savePath}"`)
    })
    notif.show()
}

module.exports = {
    app,
    createWindow,
    createCriticalError,
    createFolderSelectDialog,
    createFFMPEGPathDialog,
    createSuccessNotif
}