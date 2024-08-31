import express from "express"
import next from "next"
import path from "node:path"
import electron from "./lib/electron.js"
import child_process from "node:child_process"
import m3u8 from "m3u8-parser"
import axios from "axios"
import {
    EventEmitter
} from "node:events"
import { createServer } from "node:http"
import { Server } from "socket.io"

const devMode = (process.argv[2] === "dev") ? true : false
const nextApp = next({
    dev: devMode,
    dir: electron.app.getAppPath()
})
const getHandler = nextApp.getRequestHandler()
const __dirname = import.meta.dirname
const ffmpegEvents = new EventEmitter()
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer)

let ffmpegPath
let activeProcesses = []
let canceled = []

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.disable('x-powered-by');
app.use(express.static(__dirname + '/public'))

ffmpegEvents.on("increase", (data) => {
    let betterData = {
        uuid: data.uuid,
        progress: ((data.progress / data.total) * 100).toFixed(2),
        segment: `${data.progress} / ${data.total}`,
       // remaining: `${((((new Date(data.currentTime) - new Date(data.prevTime)) / 1000) * (data.total - data.progress)) / 60).toFixed(1)}`, current remaining function somehow overflows the frontend, so commented out (will rewrite this on frontend)
    }
    io.emit("increase", JSON.stringify(betterData))
})

ffmpegEvents.on("details", (data) => {
    let betterData = {
        uuid: data.uuid,
        downloadedFrames: data.details.split("frame=")[1].split("fps")[0].replaceAll(" ", ""),
        bitrate: data.details.split("bitrate=")[1].split("speed")[0].replaceAll(" ", ""),
        fileSize: data.details.split("size=")[1].split("time")[0].replaceAll(" ", ""),
        downloadedTotalTime: data.details.split("time=")[1].split("bitrate")[0].replaceAll(" ", "")
    }
    io.emit("details", JSON.stringify(betterData))
})

const ffmpegCloseHandler = async (proc, savePath) => {
    proc.on("exit", () => {
        activeProcesses = activeProcesses.filter(data => data.proc.pid !== proc.pid)
        var result = (proc.spawnargs.filter((data) => {
            if (canceled.includes(data)) return true
        }))
        if (result[0] === undefined) {
            electron.createSuccessNotif(savePath)
        } else {
            canceled = canceled.filter((data) => data !== result[0])
        }
    })
}

const ffmpegProgressHandler = async (proc, playlist, uuid) => {
    var currRegex = new RegExp(`.*Opening '${playlist.replace("playlist.m3u8", "")}\\d{1,}.ts' for reading.*`, "g")
    var parser = new m3u8.Parser()
    await axios.get(playlist).then(async (data) => {
        await parser.push(data.data)
        await parser.end()
    })
    let startTime = Date.now()
    let prevTime = Date.now()
    proc.stderr.on("data", (data) => {
        if ((data.toString()).match(currRegex) !== null) {
            ffmpegEvents.emit("increase", {
                uuid: uuid,
                progress: parseInt((data.toString()).match(currRegex)[0].split("/").pop().split(".ts")[0]) + 1,
                total: parser.manifest.segments.length,
                prevTime: prevTime,
                currentTime: Date.now(),
                startTime: startTime
            })
            prevTime = Date.now()
        } else if ((data.toString()).match(/.*frame=\s{0,}\d{1,}\sfps=.*/g)) {
            ffmpegEvents.emit("details", {
                uuid: uuid,
                details: data.toString()
            })
        }
        else {
            console.log(data.toString())
        }
    })
}

nextApp.prepare().then(() => {
    httpServer.listen(3000, async () => {
        electron.app.whenReady().then(electron.createWindow).catch((err) => {
            electron.createCriticalError("An error occurred while creating the window.", err.message)
        })
    })

    app.get("/", (req, res) => {
        return nextApp.render(req, res, "/")
    })

    io.on("connection", (socket) => {
        console.log("New Connection!") // :3
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
            res.json({
                error: err.message
            })
        })
        if (ffmpegPath === undefined) {
            await electron.createFFMPEGPathDialog().then((data) => {
                if (!data.canceled) {
                    ffmpegPath = path.join(data.filePaths[0])
                } else {
                    cancel = true
                }
            })
        }
        if (!cancel) {
            await electron.createFolderSelectDialog().then((data) => {
                if (!data.canceled) {
                    savePath = path.join(data.filePath)
                } else {
                    cancel = true
                }
            })
        }
        if (!cancel) {
            let process = child_process.execFile(ffmpegPath, ["-i", `${source}`, "-c", "copy", `${savePath}`])
            ffmpegCloseHandler(process, savePath)
            ffmpegProgressHandler(process, source, parameters.uuid)
            activeProcesses.push({
                uuid: parameters.uuid,
                source: source,
                proc: process
            })
        }
        res.json({
            cancel: cancel,
            source: source
        })
    })

    app.post("/api/cancel", (req, res) => {
        let killed = false
        activeProcesses.map(async (data) => {
            if (data.uuid === req.body?.uuid) {
                canceled.push(data.source)
                data.proc.kill()
                killed = true
                res.json({
                    status: "killed"
                })
            }
        })
        if (!killed) {
            res.json({
                status: "nochange",
                message: "there is no such a process"
            })
        }
    })

    app.post("/api/resolution", async (req, res) => {
        var parser = new m3u8.Parser()
        await axios.get(req.body?.source).then((data) => {
            parser.push(data.data)
            parser.end()
        }).catch((err) => {
            res.json({
                error: err.message
            })
        })
        res.json({
            source: req.body?.source,
            resolutions: Object.keys(parser.manifest.mediaGroups.VIDEO)
        })
    })

    app.get('*', (req, res) => {
        return getHandler(req, res)
    })
}).catch(async (err) => {
    electron.createCriticalError("An error occurred while starting the NextApp.", err.message)
})