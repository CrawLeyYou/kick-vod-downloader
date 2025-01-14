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
import fs from "node:fs"

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

const checkFFmpeg = async (path) => new Promise((resolve, reject) => {
    child_process.execFile(path, ["-version"], (err, stdout, stderr) => {
        (stdout.split("\n")[0] === "") ? resolve({ status: false, code: err.code }) : resolve({ status: true, response: stdout.split("\n")[0] })
    })
})

if (electron.currentPlatform === "win") {
    var ffmpegList = process.env.PATH.split(";").filter((data) => data.includes("ffmpeg"))
    if (ffmpegList.length == 1) {
        await checkFFmpeg(path.join(ffmpegList[0], "/ffmpeg.exe")).then((data) => {
            if (data.status) {
                ffmpegPath = path.join(ffmpegList[0], "/ffmpeg.exe")
            }
        })
    } else if (ffmpegList.length > 1) {
        for (var i = 0; ffmpegList.length > i; i++) {
            var data = await checkFFmpeg(path.join(ffmpegList[i], "/ffmpeg.exe"))
            if (data.status) {
                ffmpegPath = path.join(ffmpegList[i], "/ffmpeg.exe")
                break
            }
        }
    }
} else if (electron.currentPlatform === "linux") {
    await checkFFmpeg("/bin/ffmpeg").then((data) => {
        if (data.status) {
            ffmpegPath = "/bin/ffmpeg"
        }
    })
}

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

const createM3U8Playlist = async (source, savePath, parameters) => {
    var parser = new m3u8.Parser()
    let startTimeAsSeconds = 0, endTimeAsSeconds = 0, currentTotal = 0, parsedEnd = 0, parsedStart = 0, totalSegments = 0
    let startURI = "", endURI = "", sourceWOPlaylist = source.split("/").slice(0, -1).join("/") + "/"
    let tempPath = path.resolve(electron.app.getPath("temp") + `/${parameters.uuid}.m3u8`)
    const writeStream = fs.createWriteStream(tempPath)

    parameters.startTime.split(":").map((data, index) => {
        startTimeAsSeconds += parseInt(data) * Math.pow(60, (2 - index))
    })

    parameters.endTime.split(":").map((data, index) => {
        endTimeAsSeconds += parseInt(data) * Math.pow(60, (2 - index))
    })

    await axios.get(source).then(async (data) => {
        await parser.push(data.data)
        await parser.end()
    })

    writeStream.write([
        '#EXTM3U',
        `#EXT-X-VERSION:${parser.manifest.version}`,
        `#EXT-X-TARGETDURATION:${parser.manifest.targetDuration}`,
        `#EXT-X-PLAYLIST-TYPE:${parser.manifest.playlistType}`,
        `#EXT-X-MEDIA-SEQUENCE:${parser.manifest.mediaSequence}\n`
    ].join("\n"))

    const addSegment = (uri, duration) => {
        writeStream.write([
            `#EXTINF:${duration},`,
            `${sourceWOPlaylist}${uri}\n`
        ].join("\n"))
        totalSegments++
    }

    for (let segment of parser.manifest.segments) {
        if (currentTotal + segment.duration >= startTimeAsSeconds && startURI === "" && currentTotal < endTimeAsSeconds) {
            addSegment(segment.uri, segment.duration)
            parsedStart = currentTotal
            startURI = segment.uri
        } else if (currentTotal - segment.duration >= endTimeAsSeconds && startURI !== "" && endURI === "") {
            addSegment(segment.uri, segment.duration)
            parsedEnd = currentTotal
            endURI = segment.uri
            break
        } else if (startURI !== "" && endURI === "") {
            addSegment(segment.uri, segment.duration)
        }
        currentTotal += segment.duration
    }

    writeStream.write("#EXT-X-ENDLIST")
    writeStream.end()
    parameters.segments = totalSegments
    parameters.startSegment = parseInt(startURI.split(".ts")[0])
    parameters.startTime = startTimeAsSeconds - parsedStart
    parameters.endTime = parsedEnd - startTimeAsSeconds - (parsedEnd - endTimeAsSeconds) + parameters.startTime
    spawnFFmpeg(tempPath, savePath, parameters)
}

const ffmpegProgressHandler = async (proc, playlist, parameters) => {
    var parser = new m3u8.Parser()
    if (parameters.entireVOD) {
        await axios.get(playlist).then(async (data) => {
            await parser.push(data.data)
            await parser.end()
        })
        parameters.segments = parser.manifest.segments.length
    }
    let startTime = Date.now()
    let prevTime = Date.now()
    proc.stderr.on("data", (data) => {
        if ((data.toString()).match(/Opening\s'https?:\/\/[^\s]+' for reading/g) !== null) {
            ffmpegEvents.emit("increase", {
                uuid: parameters.uuid,
                progress: (parseInt((data.toString()).match(/Opening\s'https?:\/\/[^\s]+' for reading/g)[0].split("/").pop().split(".ts")[0]) + 1) - ((!parameters.entireVOD) ? parameters.startSegment : 0),
                total: parameters.segments,
                prevTime: prevTime,
                currentTime: Date.now(),
                startTime: startTime
            })
            prevTime = Date.now()
        } else if ((data.toString()).match(/.*frame=\s{0,}\d{1,}\sfps=.*/g)) {
            ffmpegEvents.emit("details", {
                uuid: parameters.uuid,
                details: data.toString()
            })
        }
        else {
            console.log(data.toString())
        }
    })
}

const spawnFFmpeg = (source, savePath, parameters) => {
    let ffmpegOptions = ["-protocol_whitelist", "file,http,https,tcp,tls", "-i", source]
    if (!parameters.entireVOD) { ffmpegOptions.push("-ss", parameters.startTime, "-to", parameters.endTime) }
    ffmpegOptions.push("-c", "copy", `${(electron.currentPlatform === "win") ? savePath : savePath + ".mp4"}`)
    let process = child_process.execFile(ffmpegPath, ffmpegOptions)
    ffmpegCloseHandler(process, savePath)
    ffmpegProgressHandler(process, source, parameters)
    activeProcesses.push({
        uuid: parameters.uuid,
        source: source,
        proc: process
    })
    return process
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
        if (ffmpegPath === undefined && electron.currentPlatform === "win") {
            await electron.createFFMPEGPathDialog().then((data) => {
                if (!data.canceled) {
                    ffmpegPath = path.join(data.filePaths[0])
                } else {
                    cancel = true
                }
            })
        } else if (ffmpegPath === undefined && electron.currentPlatform === "linux") {
            electron.createCriticalError("FFmpeg not found", "FFmpeg is not installed / corrupted on your system. Please install FFmpeg and restart the application.")
            cancel = true
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
            if (parameters.entireVOD) {
                spawnFFmpeg(source, savePath, parameters)
            } else {
                createM3U8Playlist(source, savePath, parameters)
            }
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