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
let currentPlatform;

if (process.platform === "win32") {
    app.setAppUserModelId("Kick VOD Downloader");
    currentPlatform = "win"
} else if (process.platform === "linux") {
    currentPlatform = "linux"
} else if (process.platform === "darwin") {
    currentPlatform = "darwin"
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
            name: 'Executables',
        }]
    }).then((data) => {
        resolve(data)
    })
})

const createSuccessNotif = async (savePath) => {
    const notif = new Notification({
        title: "Finished Downloading",
        body: `Click to see ${(currentPlatform === "win") ? savePath.split("\\").slice(-1)[0] : (currentPlatform === "linux" || currentPlatform === "darwin") ? savePath.split("/").slice(-1)[0] + ((currentPlatform === "linux") ? ".mp4" : "") : savePath}`
    })
    notif.on("click", () => {
        if (currentPlatform === "win") exec(`explorer /select,"${savePath}"`)
        else if (currentPlatform === "linux") exec(`xdg-open "${savePath.split("/").slice(0, -1).join("/")}"`)
        else if (currentPlatform === "darwin") exec(`open -R "${savePath}"`)
    })
    notif.show()
}

module.exports = {
    app,
    createWindow,
    createCriticalError,
    createFolderSelectDialog,
    createFFMPEGPathDialog,
    createSuccessNotif,
    currentPlatform
}