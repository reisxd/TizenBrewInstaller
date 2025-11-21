# TizenBrew Installer

TizenBrew Installer allows you to install TizenBrew and other Tizen apps easily, with resigning support for Tizen 7+ TVs!

[Discord Server Invite](https://discord.gg/m2P7v8Y2qR)

## Installation

To install TizenBrew Installer, you'll need a PC or a mobile device and a USB Stick. If you do not have a USB Stick or if you're having trouble installing via USB Stick, you can use TizenBrew Installer Desktop, which can be found in the releases section. More information about TizenBrew Installer Desktop can be found below.

First, download the [latest userwidget.zip file](https://github.com/reisxd/TizenBrewInstaller/releases/latest) from releases. After downloading it, extract the zip file directly to your USB Stick and plug it in to your TV.

After plugging the USB Stick in, the TV should show a notification saying the app is being installed. 

After it's installed, you'll need to set Developer Mode Host PC IP to `127.0.0.1`.

You can follow [this](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html#Connecting-the-TV-and-SDK) guide for more information.

Note: If your TVs language is RTL (right to left), the IP must be `1.0.0.127`.

After setting the Developer Mode settings, you should be able to use TizenBrew Installer.

## TizenBrew Installer Desktop

TizenBrew Installer Desktop is TizenBrew Installer on your PC or (Android only) mobile device. Download the latest release from the [releases section](https://github.com/reisxd/TizenBrewInstaller/releases/latest).

### Using TizenBrew Installer Desktop manually

If you're using Termux or would like to use TizenBrew Installer Desktop manually, you can follow these steps:

1. Install [Node.js](https://nodejs.org/) (on Android, you can use [Termux](https://termux.com/) and install Node.js via `pkg install nodejs`).

2. Install [git](https://git-scm.com/) if you don't have it already (on Android/Termux, use `pkg install git`).

3. Clone the repository using `git clone https://github.com/reisxd/TizenBrewInstaller.git`.

4. Navigate to the `ui` folder using `cd TizenBrewInstaller/client/ui` and run `npm install --force && npm run build`.

5. Navigate to the `tizenbrew-installer-service` folder using `cd ../services/tizenbrew-installer-service` and run `npm install`.

6. Run the application using `node .`.
