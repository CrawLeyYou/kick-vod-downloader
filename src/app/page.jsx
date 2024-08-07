'use client';
import React from "react";
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
import axios from "axios"

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

export default function Home() {
  const kickAPI = "https://kick.com/api/v1/"
  const [username, setUsername] = React.useState("")
  const [vods, setVODs] = React.useState([])
  const [open, dialogSetOpen] = React.useState(false);
  const [resolutions, setResolutions] = React.useState([])
  const [selectedRes, setSelectedRes] = React.useState("")
  const [selectedVOD, setSelectedVOD] = React.useState("")

  const fetchVODs = async () => {
    try {
      let res = await axios.get(`${kickAPI}channels/${username}`)
      setVODs(res.data.previous_livestreams)
    } catch (e) {
      console.log(e)
    }
  }

  const fetchResolution = async (event) => {
    fetchVODProperties(event.target.getAttribute("uuid")).then((res) => {
      axios.post("/api/resolution", {
        source: res.source
      }, []).then((fetch) => {
        setResolutions(fetch.data.resolutions)
        setSelectedVOD(res.source)
        dialogSetOpen(true)
      })
    })
  }

  const downloadVOD = async (event) => {
    axios.post("/api/download", {
      source: selectedVOD,
      resolution: selectedRes
    }, []).then(() => {
      toast("Downloading VOD", {
        description: "with resolution " + selectedRes,
        action: {
          label: "Cancel",
          onClick: () => cancelDownload(selectedVOD),
        },
      })
    })
  }

  const cancelDownload = async (source) => {
    axios.post("/api/cancel", {
      source: source
    }, []).then(() => {
      toast("Download Cancelled", {
        description: "The download has been cancelled.",
        action: {
          label: "Close",
          onClick: () => { },
        },
      })
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
    setUsername(event.target.value);
  };

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
                <Label>Enter a streamer name</Label>
              </div>
              <Input type="username" value={username} placeholder="Username" onChange={handleInputChange} />
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
              <img className="rounded" src={vod.thumbnail.src} />
              <span className="m-2">{vod.session_title}</span>
              <br />
              <span className="m-2">{vod.start_time}</span>
              <br />
              <Button className="m-2 bg-black text-white" uuid={vod.video.uuid} onClick={fetchResolution}>Download</Button>
            </div>
          );
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
  );
}
