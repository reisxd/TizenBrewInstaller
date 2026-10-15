# TizenBrew Installer

TizenBrew Installer allows you to install TizenBrew and other Tizen apps easily, with resigning support for Tizen 7+ TVs!

[Discord Server Invite](https://discord.gg/m2P7v8Y2qR)

## Installation

To install TizenBrew Installer, you'll need a PC or a mobile device. Since Samsung has shut down the service for the USB Demo Package creation, the only way is using TizenBrew Installer Desktop.

## TizenBrew Installer Desktop

TizenBrew Installer Desktop is TizenBrew Installer on your PC or (Android only) mobile device. On PC, download the latest release from the [releases section](https://github.com/reisxd/TizenBrewInstaller/releases/latest). On Android, use the Termux package below.

### Android / Termux

Install [Termux](https://termux.com/), then install TizenBrew Installer from the [Termux User Repository (TUR)](https://github.com/termux-user-repository/tur):

```sh
pkg update
pkg install tur-repo
pkg install tizenbrew-installer
tizenbrew-installer
```

Open http://localhost:8091/ui/dist/index.html in your Android browser and keep Termux running while using the installer.

The package includes the built UI and installs its Node.js runtime dependency automatically. You don't need to clone the repository, install Node.js manually, or build from source.

### Running from source

If you prefer to run TizenBrew Installer Desktop from source, follow these steps:

1. Install [Node.js](https://nodejs.org/) (on Android, you can use [Termux](https://termux.com/) and install Node.js via `pkg install nodejs`).

2. Install [git](https://git-scm.com/) if you don't have it already (on Android/Termux, use `pkg install git`).

3. Clone the repository using `git clone https://github.com/reisxd/TizenBrewInstaller.git`.

4. Navigate to the `ui` folder using `cd TizenBrewInstaller/client/ui` and run `npm install --force && npm run build`.

5. Navigate to the `tizenbrew-installer-service` folder using `cd ../services/tizenbrew-installer-service` and run `npm install`.

6. Run the application using `node .`.

7. Open http://localhost:8091/ui/dist/index.html in your browser, leaving the service running.
