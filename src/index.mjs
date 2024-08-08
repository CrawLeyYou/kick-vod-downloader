import express from "express"
import next from "next"
import path from "node:path"
import electron from "./lib/electron.js"
import child_process from "node:child_process"
import m3u8 from "m3u8-parser"
import axios from "axios"

const devMode = (process.argv[2] === "dev") ? true : false
const nextApp = next({ dev: devMode })
const getHandler = nextApp.getRequestHandler()

let ffmpegPath
let activeProcesses = []

const app = express()
var defaultPath = path.join(process.cwd());

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.disable('x-powered-by');
app.use(express.static(defaultPath + '/public'))

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
            console.log(`${ffmpegPath} -i "${source}" -c copy ${savePath}`)
        }
        res.json({ cancel: cancel })
    })

    app.post("/api/cancel", (req, res) => {
        console.log(req.body)
        res.send("ok")
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
})