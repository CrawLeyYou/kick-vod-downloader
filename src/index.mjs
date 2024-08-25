import express from "express"
import next from "next"
import path from "node:path"
import electron from "./lib/electron.js"
import child_process from "node:child_process"
import m3u8 from "m3u8-parser"
import axios from "axios"
import { EventEmitter } from "node:events"

const devMode = (process.argv[2] === "dev") ? true : false
const nextApp = next({ dev: devMode, dir: electron.app.getAppPath() })
const getHandler = nextApp.getRequestHandler()
const __dirname = import.meta.dirname
const ffmpegUpdateEvent = new EventEmitter()

let ffmpegPath
let activeProcesses = []
let canceled = []

const app = express()

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.disable('x-powered-by');
app.use(express.static(__dirname + '/public'))

ffmpegUpdateEvent.on("increase", (data) => {
    console.log(((data.progress / data.total) * 100).toFixed(2) + "%", `Segment: ${data.progress} / ${data.total} Remaining: ${((((new Date(data.currentTime) - new Date(data.prevTime)) / 1000) * (data.total - data.progress)) / 60).toFixed(1)} minutes`)
})

const ffmpegCloseHandle = async (proc) => {
    proc.on("exit", () => {
        activeProcesses = activeProcesses.filter(data => data.proc.pid !== proc.pid)
        var result = (proc.spawnargs.filter((data) => { if (canceled.includes(data)) return true }))
        if (result[0] === undefined) {
            electron.createSuccessNotif()
        }
        else {
            canceled = canceled.filter((data) => data !== result[0])
        }
    })
}

const ffmpegProgressHandler = async (proc, playlist) => {
    var currRegex = new RegExp(`.*Opening '${playlist.replace("playlist.m3u8", "")}\\d{1,}.ts' for reading.*`, "g")
    let i = 1
    var parser = new m3u8.Parser()
    await axios.get(playlist).then(async (data) => {
        await parser.push(data.data)
        await parser.end()
    })
    let startTime = Date.now()
    let prevTime = Date.now()
    proc.stderr.on("data", (data) => {
        if ((data.toString()).match(currRegex) !== null) {
           ffmpegUpdateEvent.emit("increase", { source: playlist, progress: i, total: parser.manifest.segments.length, prevTime: prevTime, currentTime: Date.now(), startTime: startTime })
           prevTime = Date.now()
           i++
        }
    })
}

nextApp.prepare().then(() => {
    app.listen(3000, async () => {
        electron.app.whenReady().then(electron.createWindow).catch((err) => {
            electron.createCriticalError("An error occurred while creating the window.", err.message)
        })
    })

    app.get("/", (req, res) => {
        return nextApp.render(req, res, "/")
    })

    app.post("/api/download", async (req, res) => {
        var parameters = req.body
        let source
        let savePath
        let cancel = false
        var parser = new m3u8.Parser()
        await axios.get(parameters.source).then(async (data) => {
            await parser.push(data.data)
            await parser.end()
            parser.manifest.playlists.forEach((ress) => {
                if (ress.attributes.VIDEO === parameters.resolution) {
                    source = parameters.source.replace("master.m3u8", ress.uri)
                }
            })
        }).catch((err) => {
            res.json({ error: err.message })
        })
        if (ffmpegPath === undefined) {
            await electron.createFFMPEGPathDialog().then((data) => {
                if (!data.canceled) {
                    ffmpegPath = path.join(data.filePaths[0])
                }
                else {
                    cancel = true
                }
            })
        }
        await electron.createFolderSelectDialog().then((data) => {
            if (!data.canceled) {
                savePath = path.join(data.filePath)
            }
            else {
                cancel = true
            }
        })
        if (!cancel) {
            let process = child_process.execFile(ffmpegPath, ["-i", `${source}`, "-c", "copy", `${savePath}`])
            ffmpegCloseHandle(process)
            ffmpegProgressHandler(process, source)
            activeProcesses.push({ source: source, proc: process })
        }
        res.json({ cancel: cancel, source: source })
    })

    app.post("/api/cancel", (req, res) => {
        let killed = false
        activeProcesses.map(async (data) => {
            if (data.source === req.body.source) {
                canceled.push(data.source)
                data.proc.kill()
                killed = true
                res.json({ status: "killed" })
            }
        })
        if (!killed) {
            res.json({ status: "nochange", message: "there is no such a process" })
        }
    })

    app.post("/api/resolution", async (req, res) => {
        var parser = new m3u8.Parser()
        await axios.get(req.body?.source).then((data) => {
            parser.push(data.data)
            parser.end()
        }).catch((err) => {
            res.json({ error: err.message })
        })
        res.json({ source: req.body?.source, resolutions: Object.keys(parser.manifest.mediaGroups.VIDEO) })
    })

    app.get('*', (req, res) => {
        return getHandler(req, res)
    })
}).catch(async (err) => {
    electron.createCriticalError("An error occurred while starting the NextApp.", err.message)
})