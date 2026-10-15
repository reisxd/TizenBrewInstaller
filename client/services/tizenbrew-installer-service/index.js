"use strict";

const isTV = typeof tizen !== 'undefined';
// Keep TLS verification enabled, including Samsung certificate requests.
// Broken endpoint certificates must be fixed at the trust/endpoint level, not process-wide.

module.exports.onStart = function () {
    console.log('Service started');
    const express = require('express');
    const fetch = require('node-fetch');
    const adbhost = require('adbhost');
    const { readConfig, writeConfig } = require('./utils/configuration.js');
    const { createSecurity, trustedUIRequest, usbPath } = require('./utils/security.js');
    const { randomBytes } = require('crypto');
    const security = createSecurity(isTV);
    // Migrate legacy credentials and tighten existing POSIX permissions before serving requests.
    readConfig();
    const { fetchLatestRelease } = require('./utils/GitHubAPI.js')
    const { createSamsungCertificate, resignPackage } = require('./utils/SamsungCertificateCreation.js');
    const { writeFileSync, readFileSync, readdirSync, statSync, mkdirSync, existsSync } = require('fs');
    const { setValue } = require('./utils/Buxton2.js');
    const { join, dirname } = require('path');
    const { parsePackage, installPackage } = require('./utils/PackageInstallation.js');
    const { Connection, Events } = require('./utils/wsCommunication.js');
    const { networkInterfaces } = require('os');
    const certificateAccess = require('./utils/certificateAccess.js');
    const PushFile = require('./utils/FilePusher.js');

    let WebSocket;
    let adbClient;
    let canConnectToDevice = null;
    let isConnected = false;
    if (process.version === 'v4.4.3') {
        WebSocket = require('ws-old');
    } else {
        WebSocket = require('ws-new');
    }

    const app = express();
    // Serve only built UI assets, never the service/configuration tree. This also gives
    // the packaged TV UI a same-origin HTTP bootstrap instead of trusting null origins.
    const snapshot = `${process.platform === 'win32' ? 'C:\\' : '/'}snapshot/client/ui/dist`;
    const uiDirectory = [snapshot, join(__dirname, '../../ui/dist'), join(__dirname, '../../../ui/dist')]
        .filter(path => existsSync(join(path, 'index.html')))[0];
    app.use((req, res, next) => {
        if (['localhost:8091', '127.0.0.1:8091'].indexOf(req.headers.host) === -1) return res.sendStatus(403);
        res.set('Referrer-Policy', 'no-referrer');
        res.set('X-Frame-Options', 'DENY');
        next();
    });
    app.post('/session', (req, res) => {
        if (!trustedUIRequest(req)) return res.sendStatus(403);
        let tvAddress = '127.0.0.1';
        if (isTV) {
            const interfaces = networkInterfaces();
            Object.keys(interfaces).forEach(name => interfaces[name].forEach(address => {
                if (address.family === 'IPv4' && !address.internal) tvAddress = address.address;
            }));
        }
        res.set('Cache-Control', 'no-store').json({ token: security.sessionToken, isTV, tvAddress });
    });
    if (uiDirectory) {
        app.use('/ui/dist', express.static(uiDirectory));
        app.get('/ui/dist/index.html/*', (_, res) => res.sendFile(join(uiDirectory, 'index.html')));
    }
    if (!isTV) console.log('Open up http://localhost:8091/ui/dist/index.html to access the TizenBrew Installer.');

    let isTizen7OrHigher = isTV && Number(tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').split('.')[0]) >= 7;
    const isTizen3 = isTV && tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').startsWith('3.0');
    const wsServer = new WebSocket.Server({
        server: app.listen(8091, '127.0.0.1'),
        maxPayload: 128 * 1024 * 1024,
        verifyClient: info => security.verifySocket(info.req)
    });

    function checkCanConnectToDevice() {
        fetch('http://127.0.0.1:8001/api/v2/').then(res => res.json())
            .then(json => {
                canConnectToDevice = (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') && json.device.developerMode === '1';
            }).catch(err => {
                setTimeout(checkCanConnectToDevice, 1000);
            });
    }

    isTV && checkCanConnectToDevice();

    function createAdbConnection(ip) {
        return new Promise((resolve, reject) => {
            try {
                if (adbClient) {
                    if (adbClient._stream) {
                        adbClient._stream.removeAllListeners('connect');
                        adbClient._stream.removeAllListeners('error');
                        adbClient._stream.removeAllListeners('close');
                    }
                }

                adbClient = adbhost.createConnection({ host: ip || '127.0.0.1', port: 26101 });
                let hasConnected = false;
                const waitTimeout = setTimeout(() => {
                    if (hasConnected) resolve(adbClient)
                }, 1000);

                adbClient._stream.on('connect', () => {
                    hasConnected = true;
                    isConnected = true;
                    if (isTV) {
                        clearTimeout(waitTimeout);
                        resolve(adbClient);
                    }
                });

                adbClient._stream.on('error', (e) => {
                    adbClient = null;
                    hasConnected = false;
                    clearTimeout(waitTimeout);
                    if (e.code === 'ECONNREFUSED') {
                        reject(new Error('installerDesktop.sdbConnectionRefused'));
                    } else if (e.code === 'ECONNRESET') {
                        reject(new Error('installerDesktop.sdbConnectionReset'));
                    } else {
                        reject(new Error('ADB connection error: ' + e));
                    }
                });

                adbClient._stream.on('close', () => {
                    adbClient = null;
                    isConnected = false;
                    clearTimeout(waitTimeout);
                    reject(new Error('ADB connection closed.'));
                });
            } catch (e) {
                reject(new Error('ADB connection error: ' + e));
            }
        });
    }


    function mkdirRecursive(targetDir) {
        if (existsSync(targetDir)) return;
        const parent = dirname(targetDir);
        if (!existsSync(parent)) {
            mkdirRecursive(parent);
        }
        mkdirSync(targetDir);
    }

    wsServer.on('connection', (ws, request) => {
        // ws 4 and ws 8 both pass the upgrade request as the second argument.
        if (request.url.split('?')[0] === '/probe') {
            ws.close();
            return;
        }
        const wsConn = new Connection(ws);
        ws.on('close', () => security.clearPairing(wsConn));
        ws.on('message', (message) => {
            let msg;
            try {
                msg = JSON.parse(message)
            } catch (e) {
                return wsConn.send(wsConn.Event(Events.Error, 'Invalid JSON'));
            }
            if (!msg || typeof msg !== 'object' || typeof msg.type !== 'number') {
                return wsConn.send(wsConn.Event(Events.Error, 'Invalid event'));
            }

            function parseAndInstall(buffer) {
                parsePackage(buffer)
                    .then(pkg => {
                        wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.installing'));
                        if (isTV) {
                            if (!existsSync('/home/owner/share/tmp/sdk_tools')) mkdirRecursive(`/home/owner/share/tmp/sdk_tools`);
                            writeFileSync(`/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, buffer);
                        } else {
                            PushFile(adbClient, `/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, buffer, () => {
                                installPackage(`/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, pkg.packageId, adbClient)
                                    .then(result => {
                                        wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.installed'));
                                        wsConn.send(wsConn.Event(Events.InstallPackage, { response: 0, result }));
                                    }).catch(err => wsConn.send(wsConn.Event(Events.Error, err.message)));
                            });
                            return;
                        }

                        if (isTizen3 && isTV) {
                            const result = installPackage(`/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, pkg.packageId);
                            setValue('db/sdk/develop/ip', 'string', '127.0.0.1');
                            setValue('db/sdk/develop/mode', 'int32', '1');
                            wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.installed'));
                            wsConn.send(wsConn.Event(Events.InstallPackage, { response: 0, result }));
                        } else if (isTV) {
                            createAdbConnection()
                                .then(adbClient => {
                                    installPackage(`/home/owner/share/tmp/sdk_tools/package.${pkg.isWgt ? 'wgt' : 'tpk'}`, pkg.packageId, adbClient)
                                        .then(result => {
                                            wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.installed'));
                                            wsConn.send(wsConn.Event(Events.InstallPackage, { response: 0, result }));
                                            setTimeout(() => {
                                                adbClient._stream.end();
                                                adbClient._stream.destroy();
                                            }, 5000);
                                        }).catch(err => wsConn.send(wsConn.Event(Events.Error, err.message)));
                                })
                                .catch(err => {
                                    wsConn.send(wsConn.Event(Events.Error, err.message.includes('.') ? err.message : `Error creating ADB connection: ${err.message}`));
                                });
                        }
                    })
                    .catch(err => {
                        wsConn.send(wsConn.Event(Events.Error, `Error parsing package: ${err.message}`));
                        console.error(err);
                    });
            }

            function resignOrInstall(buffer) {
                if (isTizen7OrHigher) {
                    const config = readConfig();
                    const certificates = {
                        authorCert: Buffer.from(config.authorCert, 'base64').toString('binary'),
                        distributorCert: Buffer.from(config.distributorCert, 'base64').toString('binary'),
                        password: config.password
                    };

                    wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.resigning'));
                    resignPackage(certificates, buffer)
                        .then(resignedBuffer => {
                            wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.parsing'));
                            parseAndInstall(resignedBuffer);
                        })
                        .catch(err => {
                            wsConn.send(wsConn.Event(Events.Error, `Error resigning package: ${err.message}`));
                        });
                } else {
                    wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.parsing'));
                    parseAndInstall(buffer);
                }
            }

            function checkPrecondition() {
                if (!isTizen3 && isTV) {
                    if (canConnectToDevice !== null && !canConnectToDevice) {
                        wsConn.send(wsConn.Event(Events.Error, 'errors.debuggingNotEnabled'));
                        return false;
                    } else if (canConnectToDevice === null) return false;
                }
                if (isTizen7OrHigher) {
                    // Check if we have author and distributor certificates
                    const config = readConfig();
                    if (!config.authorCert || !config.distributorCert || !config.password) {
                        wsConn.send(wsConn.Event(Events.InstallPackage, {
                            response: 2, pairingCode: security.issuePairing(wsConn)
                        }));
                        return false;
                    }
                }

                if (!isTV && (!adbClient || !isConnected)) {
                    // Somethings wrong.
                    wsConn.send(wsConn.Event(Events.ConnectToTV, { success: false }))
                    return false;
                }

                return true;
            }

            const { type, payload } = msg;

            try {
            switch (type) {
                case Events.InstallPackage: {
                    if (!checkPrecondition()) return;

                    if (!payload || typeof payload.url !== 'string') throw new Error('Invalid package source');
                    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(payload.url)) {
                        // GitHub repository
                        wsConn.send(wsConn.Event(Events.InstallationStatus, 'installStatus.fetching'));
                        fetchLatestRelease(payload.url)
                            .then(release => {
                                const asset = release.assets.find(a => a.name.endsWith('.wgt') || a.name.endsWith('.tpk'));
                                fetch(asset.browser_download_url)
                                    .then(res => res.buffer())
                                    .then(buffer => {
                                        resignOrInstall(buffer)
                                    })
                                    .catch(err => {
                                        wsConn.send(wsConn.Event(Events.Error, `Error fetching release asset: ${err.message}`));
                                    });
                            }).catch(err => {
                                wsConn.send(wsConn.Event(Events.Error, `Error fetching GitHub release: ${err.message}`));
                            });
                    } else {
                        // USB installation
                        if (!isTV) throw new Error('Use file upload for desktop installation');
                        const fileBuffer = readFileSync(usbPath(payload.url, false));
                        resignOrInstall(fileBuffer);
                    }

                    break;
                }

                case Events.NavigateDirectory: {
                    if (!isTV) throw new Error('USB browsing is only available on the TV');
                    const currentPath = usbPath(payload, true);
                    const directory = readdirSync(currentPath);
                    let parentPath;
                    try { parentPath = usbPath(join(currentPath, '..'), true); }
                    catch (e) { parentPath = '/media'; }
                    const metadata = [{
                        name: 'Go up one directory',
                        path: parentPath,
                        isDirectory: true
                    }];
                    for (const file of directory) {
                        try {
                            const candidate = join(currentPath, file);
                            const stats = statSync(candidate);
                            const filePath = usbPath(candidate, stats.isDirectory());
                            metadata.push({
                                name: file,
                                path: filePath,
                                isDirectory: stats.isDirectory()
                            });
                        } catch (e) { }
                    }
                    wsConn.send(wsConn.Event(Events.NavigateDirectory, metadata));
                    break;
                }
                case Events.InstallFile: {
                    if (!checkPrecondition()) return;
                    if (typeof payload !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
                        throw new Error('Invalid package upload');
                    }
                    const fileBuffer = Buffer.from(payload, 'base64');
                    resignOrInstall(fileBuffer);
                    break;
                }
                case Events.DeleteConfiguration: {
                    security.clearPairing();
                    const config = readConfig();
                    config.authorCert = null;
                    config.distributorCert = null;
                    config.password = null;
                    writeConfig(config);
                    wsConn.send(wsConn.Event(Events.DeleteConfiguration, null));
                    break;
                }
                case Events.ConnectToTV: {
                    if (isTV || typeof payload !== 'string' || !require('net').isIP(payload)) {
                        throw new Error('Invalid TV IP address');
                    }
                    security.clearPairing();
                    try {
                        createAdbConnection(payload)
                            .then(client => {
                                adbClient = client;
                                wsConn.send(wsConn.Event(Events.ConnectToTV, { success: true }));
                                const sysinfoCommand = adbClient.createStream('sysinfo:');
                                sysinfoCommand.on('data', (data) => {
                                    const INFOBUF_MAXLEN = 64;
                                    const platform_version = data.slice(INFOBUF_MAXLEN * 3, INFOBUF_MAXLEN * 4).toString().replace(/\0/g, '');
                                    isTizen7OrHigher = Number(platform_version.split('.')[0]) >= 7;
                                });
                            })
                            .catch(err => {
                                wsConn.send(wsConn.Event(Events.ConnectToTV, { success: false, error: err.message }));
                            });
                    } catch (e) {
                        wsConn.send(wsConn.Event(Events.ConnectToTV, { success: false, error: e.message }));
                    }
                    break;
                }
                default: {
                    wsConn.send(wsConn.Event(Events.Error, 'Invalid event type.'));
                    break;
                }
            }
            } catch (err) {
                wsConn.send(wsConn.Event(Events.Error, err.message));
            }
        });
    });

    const appAccess = express();

    appAccess.use(certificateAccess(security, isTV));
    appAccess.post('/', (request, response) => {
        const { body, connection: wsClient } = response.locals.certificate;
        const accessInfo = { accessToken: body.access_token, userId: body.userId };
        const password = randomBytes(24).toString('hex');
        const authorInfo = {
            name: 'TizenBrew', email: body.inputEmailID, password: password, privilegeLevel: 'Partner'
        };

        function certificateFailed(err) {
            // A failed attempt consumed the authorization. Refresh the installer prompt
            // so desktop users can retry sign-in without reloading or typing a code.
            if (wsClient.connection.readyState === 1) {
                wsClient.send(wsClient.Event(Events.InstallPackage, {
                    response: 2, pairingCode: security.issuePairing(wsClient)
                }));
            }
            response.status(500).json({ error: err.message + ' Restart sign-in from the installer to retry.' });
        }

        function createCert() {
            createSamsungCertificate(authorInfo, accessInfo, adbClient, isTV)
                .then(certificate => {
                    const currentConfig = readConfig();
                    currentConfig.authorCert = Buffer.from(certificate.authorCert, 'binary').toString('base64');
                    currentConfig.distributorCert = Buffer.from(certificate.distributorCert, 'binary').toString('base64');
                    currentConfig.password = password;
                    if (isTV) {
                        if (!existsSync('/home/owner/share/tmp/sdk_tools')) mkdirRecursive('/home/owner/share/tmp/sdk_tools');
                        writeFileSync('/home/owner/share/tmp/sdk_tools/device-profile.xml', certificate.distributorXML);
                    } else {
                        PushFile(adbClient, '/home/owner/share/tmp/sdk_tools/device-profile.xml', Buffer.from(certificate.distributorXML, 'utf8'), () => {
                            console.log('Device profile pushed to TV');
                        });
                    }
                    writeConfig(currentConfig);
                    if (wsClient.connection.readyState === 1) {
                        wsClient.send(wsClient.Event(Events.InstallPackage, { response: 1 }));
                    }
                    response.status(200).send('Certificate creation was successful. You can now close this window.');
                })
                .catch(certificateFailed);
        }

        if (isTV) {
            if (!adbClient || !isConnected) {
                createAdbConnection().then(() => createCert()).catch(certificateFailed);
            } else createCert();
        } else if (!adbClient || !isConnected) {
            response.status(409).json({ error: 'TV connection lost. Reconnect in the installer before retrying sign-in.' });
            if (wsClient.connection.readyState === 1) wsClient.send(wsClient.Event(Events.ConnectToTV, { success: false }));
        } else createCert();
    });

    // Only TV mode intentionally exposes the mobile certificate-entry page on the LAN.
    // Submissions still require a single-use code issued to the authorized local UI.
    appAccess.listen(4794, isTV ? '0.0.0.0' : '127.0.0.1');
}

!isTV && module.exports.onStart();