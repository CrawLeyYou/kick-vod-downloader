<p align="center">
  <img src="https://github.com/CrawLeyYou/kick-vod-downloader/blob/main/public/logo.png?raw=true", width="256" height="256" />
</p>
<h1 align="center"> Kick VOD Downloader </h1>

[Support Server](https://discord.gg/5trvjuqgm8)

# Requirements 
- Windows 10+ / Linux / MacOS (preferably Apple Silicon)
- [FFmpeg](https://www.ffmpeg.org/download.html)
- bread 👍

# Usage & Installation
## Windows
- Download [FFmpeg](https://www.ffmpeg.org/download.html#build-windows) & [latest build](https://github.com/CrawLeyYou/kick-vod-downloader/releases/latest)

*You can alternatively use package managers like `winget` to install FFmpeg too, program will automatically detect the FFmpeg.*

https://github.com/user-attachments/assets/3865606d-7ce4-4cd9-8794-bc16bab5eaee

## Linux
 - Install FFmpeg via your favorite package manager e.g. `sudo apt install ffmpeg -y` & download [latest build](https://github.com/CrawLeyYou/kick-vod-downloader/releases/latest)
  ### Snap
  Since I don't sign the packages you need to pass `--dangerous` argument to install with snap.

  Use `sudo snap install --dangerous --classic "latest-build.snap"`.
  ### AppImage
  AppImage requires FUSE to work you can check out [this](https://github.com/AppImage/AppImageKit/wiki/FUSE) wiki to how to install FUSE.
  ### tar.gz
  Just extract from archive and start kick-vod-downloader file.

## MacOS
- Download [FFmpeg](https://www.ffmpeg.org/download.html#build-mac) & [latest build](https://github.com/CrawLeyYou/kick-vod-downloader/releases/latest)

 To install and use program in MacOS you need to remove ``com.apple.quarantine`` attribute from the file. (This attribute added by Apple if the file downloaded from internet is not signed. (Which costs $100/year))
 
 Example: ``xatrr -c Kick.VOD.Downloader-1.1.1-arm64.dmg`` or ``xattr -d com.apple.quarantine Kick.VOD.Downloader-1.1.1-arm64.dmg``.

 ### Note
  FFmpeg only recognized only if its in `/Applications/`.
# License
This project is licensed under [MIT](https://opensource.org/licenses/MIT) license.
