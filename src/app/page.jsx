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
} from "@/components/ui/alert-dialog"

const socket = socketIO.connect('ws://localhost:3000')

export default function Home() {
  const kickAPI = "https://kick.com/api/v1/"
  const [inputData, setInputData] = React.useState("")
  const [vods, setVODs] = React.useState([])
  const [open, dialogSetOpen] = React.useState(false)
  const [resolutions, setResolutions] = React.useState([])
  const [selectedRes, setSelectedRes] = React.useState("")
  const [selectedVOD, setSelectedVOD] = React.useState("")
  const [selectedUUID, setSelectedUUID] = React.useState("")

  React.useEffect(() => {
    socket.on("increase", (data) => {
      var JSONData = JSON.parse(data)
      const element = document.getElementById('progress-' + JSONData.uuid)
      if (element) {
        element.style.display = "block"
        element.firstElementChild.style.transform = `translateX(-${100 - (JSONData.progress || 0)}%)`
      }
    })
  })

  React.useEffect(() => {
    vods.forEach((vod) => {
      const element = document.getElementById('progress-' + vod.video.uuid)
      if (element) {
        element.style.display = "none"
      }
    })
  }, [vods])

  const fetchVODs = async () => {
    try {
      if (inputData.match(/^https:\/\/kick.com\/video\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/) !== null) {
        let res = await axios.get(`${kickAPI}video/${inputData.split("https://kick.com/video/")[1]}`)
        setVODs([{ duration: res.data.livestream.duration, thumbnail: { src: res.data.livestream.thumbnail }, session_title: res.data.livestream.session_title, start_time: res.data.livestream.created_at, video: { uuid: res.data.uuid } }])
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
        dialogSetOpen(true)
      })
    })
  }

  const downloadVOD = async () => {
    axios.post("/api/download", {
      source: selectedVOD,
      uuid: selectedUUID,
      resolution: selectedRes
    }, []).then((resp) => {
      if (!resp.data.cancel) {
        document.getElementById('button-' + selectedUUID).setAttribute("data-state", "cancel")
        document.getElementById('button-' + selectedUUID).innerText = "Cancel"
        toast("Downloading VOD", {
          description: "with resolution " + selectedRes,
          action: {
            label: "Cancel",
            onClick: () => cancelDownload({ uuid: selectedUUID }),
          },
        })
      }
    })
  }

  const cancelDownload = async (data) => {
    axios.post("/api/cancel", data, []).then((response) => {
      if (response.data.status !== "nochange") {
        document.getElementById("button-" + data.uuid).setAttribute("data-state", "download")
        document.getElementById("button-" + data.uuid).innerText = "Download"
        document.getElementById("progress-" + data.uuid).style.display = "none"
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
  const cancelDialog = async () => dialogSetOpen(false)

  const fetchVODProperties = async (vodID) => {
    try {
      let res = await axios.get(`${kickAPI}video/${vodID}`)
      return res.data
    } catch (e) {
      console.log(e)
    }
  }

  const handleInputChange = (event) => {
    setInputData(event.target.value)
  }

  return (
    <main className="bg-white">
      <div className="flex h-screen">
        <Card className="m-auto bg-white border-gray-400 w-[350px]">
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
        </Card>
      </div>
      <div className="flex flex-wrap">
        {vods.map((vod, i) => {
          return (
            <div key={i} className="m-auto w-[480px] border-gray-200 border-2 rounded">
              <span className="absolute text-white bg-zinc-950 bg-opacity-40">{new Date(vod.duration).toUTCString().match("..:..:..")[0]}</span>
              <Image className="rounded" src={vod.thumbnail.src} alt="Thumbnail" width={1280} height={720} />
              <ProgressPrimitive.Root style={{ "marginTop": "0.5rem", "width": "460px", "display": "none" }} id={"progress-" + vod.video.uuid} className={"relative h-4 w-full overflow-hidden rounded-full bg-secondary[&>*]:bg-zinc-950 m-2"}>
                <ProgressPrimitive.Indicator className="h-full w-full flex-1 bg-primary transition-all" style={{ transform: 'translateX(-100%)' }} />
              </ProgressPrimitive.Root>
              <span className="m-2">{vod.session_title}</span>
              <br />
              <span className="m-2">{vod.start_time}</span>
              <br />
              <Button className="m-2 bg-black text-white" id={"button-" + vod.video.uuid} data-state="download" data-uuid={vod.video.uuid} onClick={buttonEventSelection}>Download</Button>
            </div>
          )
        })}
      </div>
      <AlertDialog open={open} onOpenChange={dialogSetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Please Select A Resolution</AlertDialogTitle>
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
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={downloadVOD}>Select</AlertDialogAction>
            <AlertDialogCancel onClick={cancelDialog}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster />
    </main>
  )
}