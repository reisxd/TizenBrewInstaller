"use strict";


module.exports.onStart = function () {
    console.log('Service started');
    const express = require('express');
    const fetch = require('node-fetch');
    const adbhost = require('adbhost');
    const { readConfig, writeConfig } = require('./utils/configuration.js');
    const { fetchLatestRelease } = require('./utils/GitHubAPI.js')
    const { createSamsungCertificate, resignPackage } = require('./utils/SamsungCertificateCreation.js');
    const { writeFileSync, readFileSync, readdirSync, statSync, mkdirSync } = require('fs');
    const { setValue } = require('./utils/Buxton2.js');
    const { join } = require('path');
    const { parsePackage, installPackage } = require('./utils/PackageInstallation.js');
    const { Connection, Events } = require('./utils/wsCommunication.js');
    const AccessInfoHTMLPage = require('./utils/HTMLPage.js');

    let WebSocket;
    let adbClient;
    let wsClient = null;
    let canConnectToDevice = null;
    if (process.version === 'v4.4.3') {
        WebSocket = require('ws-old');
    } else {
        WebSocket = require('ws-new');
    }

    const app = express();
    const isTizen7OrHigher = Number(tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').split('.')[0]) >= 7;
    const isTizen3 = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').startsWith('3.0');
    const wsServer = new WebSocket.Server({ server: app.listen(8091) });


    function checkCanConnectToDevice() {
        fetch('http://127.0.0.1:8001/api/v2/').then(res => res.json())
            .then(json => {
                canConnectToDevice = (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') && json.device.developerMode === '1';
            }).catch(err => {
                setTimeout(checkCanConnectToDevice, 1000);
            });
    }

    checkCanConnectToDevice();

    function createAdbConnection() {
        return new Promise((resolve, reject) => {
            if (adbClient) {
                if (!adbClient._stream) {
                    adbClient._stream.removeAllListeners('connect');
                    adbClient._stream.removeAllListeners('error');
                    adbClient._stream.removeAllListeners('close');
                }
            }

            adbClient = adbhost.createConnection({ host: '127.0.0.1', port: 26101 });

            adbClient._stream.on('connect', () => {
                adbClient._stream.removeAllListeners('error');
                adbClient._stream.removeAllListeners('close');
                resolve(adbClient);
            });

            adbClient._stream.on('error', (e) => {
                adbClient = null;
                reject(new Error('ADB connection error: ' + e));
            });

            adbClient._stream.on('close', () => {
                adbClient = null;
                reject(new Error('ADB connection closed.'));
            });
        });
    }


    wsServer.on('connection', (ws) => {
        const wsConn = new Connection(ws);
        wsClient = wsConn;
        ws.on('message', (message) => {
            let msg;
            try {
                msg = JSON.parse(message)
            } catch (e) {
                return wsConn.send(wsConn.Event(Events.Error, `Invalid JSON: ${message}`));
            }

            const { type, payload } = msg;

            switch (type) {
                case Events.InstallPackage: {
                    if (!isTizen3) {
                        if (canConnectToDevice !== null && !canConnectToDevice) return wsConn.send(wsConn.Event(Events.Error, 'errors.debuggingNotEnabled'));
                    }
                    if (isTizen7OrHigher) {
                        // Check if we have author and distributor certificates
                        const config = readConfig();
                        if (!config.authorCert || !config.distributorCert || !config.password) {
                            return wsConn.send(wsConn.Event(Events.InstallPackage, { response: 2 }));
                        }
                    }

                    function parseAndInstall(buffer) {
                        parsePackage(buffer)
                            .then(pkg => {
                                wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.installing'));
                                writeFileSync(`/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, buffer);
                                if (isTizen3) {
                                    const result = installPackage(`/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, pkg.packageId);
                                    setValue('db/sdk/develop/ip', 'string', '127.0.0.1');
                                    setValue('db/sdk/develop/mode', 'int32', '1');
                                    wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.installed'));
                                    wsConn.send(wsConn.Event(Events.InstallPackage, { response: 0, result }));
                                } else {
                                    createAdbConnection()
                                        .then(adbClient => {
                                            installPackage(`/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, pkg.packageId, adbClient)
                                                .then(result => {
                                                    wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.installed'));
                                                    wsConn.send(wsConn.Event(Events.InstallPackage, { response: 0, result }));
                                                    setTimeout(() => {
                                                        adbClient._stream.end();
                                                    }, 5000);
                                                });
                                        })
                                        .catch(err => {
                                            wsConn.send(wsConn.Event(Events.Error, `Error creating ADB connection: ${err.message}`));
                                        });
                                }
                            })
                            .catch(err => {
                                wsConn.send(wsConn.Event(Events.Error, `Error parsing package: ${err.message}`));
                            });
                    }

                    if (payload.url.split('/').length === 2) {
                        // GitHub repository
                        wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.fetching'));
                        fetchLatestRelease(payload.url)
                            .then(release => {
                                const asset = release.assets.find(a => a.name.endsWith('.wgt') || a.name.endsWith('.tpk'));
                                fetch(asset.browser_download_url)
                                    .then(res => res.buffer())
                                    .then(buffer => {
                                        if (isTizen7OrHigher) {
                                            wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.resigning'));
                                            const config = readConfig();
                                            const certificates = {
                                                authorCert: Buffer.from(config.authorCert, 'base64').toString('binary'),
                                                distributorCert: Buffer.from(config.distributorCert, 'base64').toString('binary'),
                                                password: config.password
                                            };

                                            resignPackage(certificates, buffer)
                                                .then(resignedBuffer => {
                                                    wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.parsing'));
                                                    parseAndInstall(resignedBuffer);
                                                })
                                                .catch(err => {
                                                    wsConn.send(wsConn.Event(Events.Error, `Error resigning package: ${err.message}`));
                                                });
                                        } else parseAndInstall(buffer);
                                    })
                                    .catch(err => {
                                        wsConn.send(wsConn.Event(Events.Error, `Error fetching release asset: ${err.message}`));
                                    });
                            }).catch(err => {
                                wsConn.send(wsConn.Event(Events.Error, `Error fetching GitHub release: ${err.message}`));
                            });
                    } else {
                        // USB installation
                        const fileBuffer = readFileSync(payload.url);
                        if (isTizen7OrHigher) {
                            const config = readConfig();
                            const certificates = {
                                authorCert: Buffer.from(config.authorCert, 'base64').toString('binary'),
                                distributorCert: Buffer.from(config.distributorCert, 'base64').toString('binary'),
                                password: config.password
                            };

                            wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.resigning'));
                            resignPackage(certificates, fileBuffer)
                                .then(resignedBuffer => {
                                    wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.parsing'));
                                    parseAndInstall(resignedBuffer);
                                })
                                .catch(err => {
                                    wsConn.send(wsConn.Event(Events.Error, `Error resigning package: ${err.message}`));
                                });
                        } else {
                            wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.parsing'));
                            parseAndInstall(fileBuffer);
                        }
                    }

                    break;
                }

                case Events.NavigateDirectory: {
                    const directory = readdirSync(payload, { withFileTypes: true });
                    const metadata = [{
                        name: 'Go up one directory',
                        path: directory !== '/media' ? join(payload, '..') : '/media',
                        isDirectory: true
                    }];
                    for (const file of directory) {
                        const filePath = join(payload, file.name);
                        try {
                            const stats = statSync(filePath);
                            metadata.push({
                                name: file.name,
                                path: filePath,
                                isDirectory: stats.isDirectory()
                            });
                        } catch (_) { }
                    }
                    wsConn.send(wsConn.Event(Events.NavigateDirectory, metadata));
                    break;
                }
                default: {
                    wsConn.send(wsConn.Event(Events.Error, 'Invalid event type.'));
                    break;
                }
            }
        });
    });

    const appAccess = express();

    appAccess.use(express.urlencoded({ extended: false }));

    appAccess.use((request, response) => {
        if (request.method !== 'GET') {
            const body = JSON.parse(request.body.code);
            const accessInfo = {
                accessToken: body.access_token,
                userId: body.userId
            };

            // Randomly generate a password
            const password = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4);

            const authorInfo = {
                name: 'TizenBrew',
                email: body.inputEmailID,
                password: password,
                privilegeLevel: 'Partner'
            };

            createAdbConnection().then(adbClient => {
                createSamsungCertificate(authorInfo, accessInfo, adbClient)
                    .then(certificate => {
                        const currentConfig = readConfig();
                        currentConfig.authorCert = Buffer.from(certificate.authorCert, 'binary').toString('base64');
                        currentConfig.distributorCert = Buffer.from(certificate.distributorCert, 'binary').toString('base64');
                        currentConfig.password = password;
                        mkdirSync('/home/owner/share/tmp/sdk_tools', { recursive: true });
                        writeFileSync('/home/owner/share/tmp/sdk_tools/device-profile.xml', certificate.distributorXML);
                        writeConfig(currentConfig);
                        if (wsClient) {
                            wsClient.send(wsClient.Event(Events.InstallPackage, { response: 1 }));
                        }
                        response.status(204).send();
                    })
                    .catch(err => {
                        response.status(500).json({ error: err.message });
                    });
            });
        } else {
            response.send(AccessInfoHTMLPage);
        }
    });

    appAccess.listen(4794);
}