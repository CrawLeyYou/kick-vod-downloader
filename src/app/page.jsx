'use client'

import React from "react"
import axios from "axios"
import Image from "next/image"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import socketIO from 'socket.io-client'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"


const socket = socketIO.connect('ws://localhost:3000')

export default function Home() {
  const kickAPI = "https://kick.com/api/v1/"
  const [inputData, setInputData] = React.useState("")
  const [vods, setVODs] = React.useState([])
  const [resOpenState, setResOpenState] = React.useState(false)
  const [resolutions, setResolutions] = React.useState([])
  const [selectedRes, setSelectedRes] = React.useState("")
  const [selectedVOD, setSelectedVOD] = React.useState("")
  const [selectedUUID, setSelectedUUID] = React.useState("")
  const [detailsOpenState, setDetailsOpenState] = React.useState(false)
  const selectedDetails = React.useRef("")
  const [remainingData, setRemainingData] = React.useState("")
  const [prevTime, setPrevTime] = React.useState(Date.now())
  const [remaining, setRemaining] = React.useState("")
  const [details, setDetails] = React.useState({})
  const [segments, setSegments] = React.useState("")
  const [entireVOD, setEntireVOD] = React.useState(true)
  const [VODEndTime, setVODEndTime] = React.useState("")

  socket.on("details", (data) => {
    var JSONData = JSON.parse(data)
    if (JSONData.uuid === selectedDetails.current) {
      setDetails(JSONData)
    }
  })

  React.useEffect(() => {
    setRemaining(((((new Date(Date.now()) - new Date(prevTime)) / 1000) * remainingData) / 60).toFixed(1) + " minutes.")
    setPrevTime(Date.now())
  }, [remainingData])

  React.useEffect(() => {
    socket.on("increase", (data) => {
      var JSONData = JSON.parse(data)
      const element = document.getElementById('progress-' + JSONData.uuid)
      if (element) {
        element.style.display = "block"
        element.firstElementChild.style.transform = `translateX(-${100 - (JSONData.progress || 0)}%)`
      }
      if (document.getElementById('button-' + JSONData.uuid)?.innerText === "Download") {
        cancelButton(JSONData.uuid)
      }
      if (JSONData.progress == 100 && element) {
        document.getElementById("downloaded-" + JSONData.uuid).style.display = "block"
        downloadButton(JSONData.uuid)
      }
      if (JSONData.uuid === selectedDetails.current) {
        setSegments(JSONData.segment)
        setRemainingData(JSONData.remainingData)
      }
    })
  })

  React.useEffect(() => {
    vods.forEach((vod) => {
      const element = document.getElementById('progress-' + vod.video.uuid)
      if (element) {
        element.style.display = "none"
      }
      if (document.getElementById('button-' + vod.video.uuid)?.innerText === "Cancel") {
        downloadButton(vod.video.uuid)
      }
      if (document.getElementById("downloaded-" + vod.video.uuid).style.display = "block") {
        document.getElementById("downloaded-" + vod.video.uuid).style.display = "none"
      }

    })
  }, [vods])

  const downloadButton = (uuid) => {
    document.getElementById("button-" + uuid).setAttribute("data-state", "download")
    document.getElementById("button-" + uuid).innerText = "Download"
    document.getElementById("progress-" + uuid).style.display = "none"
    document.getElementById("details-button-" + uuid).style.display = "none"
  }

  const cancelButton = (uuid) => {
    document.getElementById('button-' + uuid).setAttribute("data-state", "cancel")
    document.getElementById('button-' + uuid).innerText = "Cancel"
    document.getElementById("details-button-" + uuid).style.display = "inline"
    if (document.getElementById("downloaded-" + uuid).style.display = "block") document.getElementById("downloaded-" + uuid).style.display = "none"
  }

  const fetchVODs = async () => {
    try {
      if (inputData.match(/^https:\/\/kick.com\/[a-zA-z0-9]{4,25}\/videos\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/) !== null) {
        let res = await axios.get(`${kickAPI}video/${inputData.split("videos/")[1]}`)
        setVODs([{ duration: res.data.livestream.duration, thumbnail: { src: (res.data.livestream.thumbnail !== null) ? res.data.livestream.thumbnail : "/thumbnail-err.png" }, session_title: res.data.livestream.session_title, start_time: res.data.livestream.created_at, video: { uuid: res.data.uuid } }])
      }
      else if (inputData.match(/^[a-zA-Z0-9]{4,25}$/) !== null) {
        let res = await axios.get(`${kickAPI}channels/${inputData}`)
        setVODs(res.data.previous_livestreams)
      }
      else {
        toast("Invalid input", {
          description: "Please enter a valid username or VOD link.",
          action: {
            label: "Close"
          },
        })
      }
    } catch (e) {
      console.log(e)
    }
  }

  const buttonEventSelection = async (event) => {
    if (event.target.getAttribute("data-state") === "download") {
      fetchResolution(event)
      setVODEndTime(document.getElementById("timestamp-" + event.target.getAttribute("data-uuid")).innerText)
    }
    else if (event.target.getAttribute("data-state") === "cancel") {
      cancelDownload({ uuid: event.target.getAttribute("data-uuid") })
    }
  }

  const fetchResolution = async (event) => {
    fetchVODProperties(event.target.getAttribute("data-uuid")).then((res) => {
      axios.post("/api/resolution", {
        source: res.source
      }, []).then((fetch) => {
        setSelectedUUID(event.target.getAttribute("data-uuid"))
        setResolutions(fetch.data.resolutions)
        setSelectedVOD(res.source)
        setResOpenState(true)
      })
    })
  }

  const isEndGreater = async (startTime, endTime) => {
    var startTimeAsSeconds = 0
    var endTimeAsSeconds = 0

    startTime.split(":").map((data, index) => {
      startTimeAsSeconds += parseInt(data) * Math.pow(60, (2 - index))
    })
    endTime.split(":").map((data, index) => {
      endTimeAsSeconds += parseInt(data) * Math.pow(60, (2 - index))
    })

    if (startTimeAsSeconds > endTimeAsSeconds) {
      return false
    }
    else {
      return true
    }
  }

  const downloadVOD = async () => {
    var validateTime = await isEndGreater(document.getElementById("startTime").value, document.getElementById("endTime").value)
    var isStartTimeValid = document.getElementById("startTime").value.match(/^(\d{2,}):([0-5][0-9]):([0-5][0-9])$/) !== null ?? entireVOD
    var isEndTimeValid = document.getElementById("endTime").value.match(/^(\d{2,}):([0-5][0-9]):([0-5][0-9])$/) !== null ?? entireVOD

      (!validateTime) ? () => {
        isStartTimeValid = false
        isEndTimeValid = false
      } : ""

    if (entireVOD && selectedRes !== "" && validateTime || selectedRes !== "" && isStartTimeValid && isEndTimeValid && validateTime) {
      axios.post("/api/download", {
        source: selectedVOD,
        uuid: selectedUUID,
        resolution: selectedRes,
        entireVOD: entireVOD,
        startTime: document.getElementById("startTime").value,
        endTime: document.getElementById("endTime").value
      }, []).then((resp) => {
        if (!resp.data.cancel) {
          cancelButton(selectedUUID)
          toast("Downloading VOD", {
            description: "with resolution " + selectedRes,
            action: {
              label: "Cancel",
              onClick: () => cancelDownload({ uuid: selectedUUID }),
            },
          })
        }
      })
    } else {
      cancelResDialog()
      toast(`${((!isEndTimeValid || !isStartTimeValid) && selectedRes === "") ? "Invalid time/pattern & Resolution" : ((isEndTimeValid || isStartTimeValid) && selectedRes === "") ? "No Resolution" : "Invalid time/pattern"}`, {
        description: `${((!isEndTimeValid || !isStartTimeValid) && selectedRes === "") ? "Please select a resolution and make sure enter a valid time/pattern. i.e: 00:00:00" : (selectedRes === "" && (isEndTimeValid || isStartTimeValid)) ? "Please select a resolution" : "Please enter a valid time/pattern. i.e: 00:00:00"}`,
        action: {
          label: "Close",
          onClick: () => { },
        },
      })
    }
  }


  const cancelDownload = async (data) => {
    axios.post("/api/cancel", data, []).then((response) => {
      if (response.data.status !== "nochange") {
        downloadButton(data.uuid)
        toast("Download Cancelled", {
          description: "The download has been cancelled.",
          action: {
            label: "Close",
            onClick: () => { },
          },
        })
      }
    })
  }

  const cancelResDialog = async () => {
    setSelectedRes("")
    setResOpenState(false)
    setEntireVOD(true)
  }

  const settingsDialog = async (event) => {
    setResOpenState(event)
    setEntireVOD(!event)
  }

  const cancelDetailsDialog = async () => setDetailsOpenState(false)

  const fetchVODProperties = async (vodID) => {
    try {
      let res = await axios.get(`${kickAPI}video/${vodID}`)
      return res.data
    } catch (e) {
      console.log(e)
    }
  }

  const detailsDialog = async (event) => {
    selectedDetails.current = (event.target.getAttribute("data-uuid"))
    setDetailsOpenState(true)
    setDetails({})
    setPrevTime(Date.now())
    setRemainingData("")
    setRemaining("")
    setSegments("")
  }

  const handleInputChange = (event) => {
    setInputData(event.target.value)
  }

  return (
    <main className="bg-white">
      <div className="flex h-screen">
        <Card className="m-auto bg-white border-gray-400 w-[350px]">
          <form onSubmit={e => {
            e.preventDefault();
          }}>
            <CardHeader>
              <CardTitle className="flex text-black justify-center">Kick VOD Downloader</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid w-full items-center gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label>Enter a username / VOD link </Label>
                </div>
                <Input type="username" value={inputData} placeholder="Username / VOD" onChange={handleInputChange} />
              </div>
            </CardContent>
            <CardFooter>
              <Button className="bg-black text-white" onClick={fetchVODs}>Fetch</Button>
            </CardFooter>
          </form>
        </Card>
      </div>
      <div className="flex flex-wrap">
        {vods.map((vod, i) => {
          return (
            <div key={i} className="m-auto w-[480px] border-gray-200 border-2 rounded">
              <span id={"timestamp-" + vod.video.uuid} className="absolute text-white bg-zinc-950 bg-opacity-40">{new Date(vod.duration).toUTCString().match("..:..:..")[0]}</span>
              <Image className="rounded" src={vod.thumbnail.src} alt="Thumbnail" width={1280} height={720} />
              <ProgressPrimitive.Root style={{ "marginTop": "0.5rem", "width": "460px", "display": "none" }} id={"progress-" + vod.video.uuid} className={"relative h-4 w-full overflow-hidden rounded-full bg-secondary[&>*]:bg-zinc-950 m-2"}>
                <ProgressPrimitive.Indicator className="h-full w-full flex-1 bg-primary transition-all" style={{ transform: 'translateX(-100%)' }} />
              </ProgressPrimitive.Root>
              <span className="m-2" id={"downloaded-" + vod.video.uuid} style={{ "color": "green", "display": "none" }}>Downloaded</span>
              <span className="m-2">{vod.session_title}</span>
              <br />
              <span className="m-2">{vod.start_time}</span>
              <br />
              <Button className="m-2 bg-black text-white" id={"button-" + vod.video.uuid} data-state="download" data-uuid={vod.video.uuid} onClick={buttonEventSelection}>Download</Button>
              <Button className="m-2 bg-black text-white" id={"details-button-" + vod.video.uuid} style={{ "display": "none" }} data-uuid={vod.video.uuid} onClick={detailsDialog}>Details</Button>
            </div>
          )
        })}
      </div>
      <AlertDialog open={resOpenState} onOpenChange={settingsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select settings you want for the video</AlertDialogTitle>
            <Select onValueChange={setSelectedRes}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Resolution" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {resolutions.map((res, i) => {
                    return <SelectItem key={i} value={res}>{res.replace("p", "p ")}fps</SelectItem>
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex items-center space-x-2">
              <Checkbox defaultChecked={true} onCheckedChange={setEntireVOD} />
              <Label>Download Entire VOD</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Label htmlFor="startTime">Start</Label>
              <Input className="" type="text" disabled={entireVOD} id="startTime" defaultValue={"00:00:00"}></Input>
              <Label htmlFor="endTime">End</Label>
              <Input type="text" disabled={entireVOD} defaultValue={VODEndTime} id="endTime"></Input>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={downloadVOD}>Download</AlertDialogAction>
            <AlertDialogCancel onClick={cancelResDialog}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={detailsOpenState} onOpenChange={setDetailsOpenState}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Details</AlertDialogTitle>
            <AlertDialogDescription>Downloaded Frames: {details.downloadedFrames}</AlertDialogDescription>
            <AlertDialogDescription>File Size: {details.fileSize}</AlertDialogDescription>
            <AlertDialogDescription>Video Bitrate: {details.bitrate}</AlertDialogDescription>
            <AlertDialogDescription>Downloaded Total Time: {details.downloadedTotalTime}</AlertDialogDescription>
            <AlertDialogDescription>Segments: {segments}</AlertDialogDescription>
            <AlertDialogDescription>Remaining: {remaining}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDetailsDialog}>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster />
    </main>
  )
}