"use strict";

const { randomBytes } = require('crypto');
const { realpathSync, statSync } = require('fs');
const { relative, isAbsolute, sep } = require('path');

const uiOrigins = ['http://localhost:8091', 'http://127.0.0.1:8091'];
const uiHosts = ['localhost:8091', '127.0.0.1:8091'];

function trustedUIRequest(request) {
    return uiHosts.indexOf(request.headers.host) !== -1 &&
        uiOrigins.indexOf(request.headers.origin) !== -1;
}

function createSecurity(isTV) {
    const token = randomBytes(32).toString('hex');
    let pairing = null;
    let desktop = null;
    function validPairing(code) {
        return pairing && typeof code === 'string' && code === pairing.code && pairing.expires > Date.now();
    }
    function validDesktop(token) {
        return desktop && typeof token === 'string' && token === desktop.token &&
            pairing === desktop.pairing && pairing.expires > Date.now();
    }
    return {
        sessionToken: token,
        verifySocket: function (request) {
            if (uiHosts.indexOf(request.headers.host) === -1) return false;
            // The packaged file UI may only probe readiness, then must navigate to the HTTP UI.
            if (request.url === '/probe') {
                return trustedUIRequest(request) || (isTV &&
                    ['null', 'file://'].indexOf(request.headers.origin) !== -1);
            }
            return request.url === '/ws?token=' + token && trustedUIRequest(request);
        },
        issuePairing: function (connection) {
            if (!pairing || pairing.connection !== connection || pairing.expires <= Date.now()) {
                desktop = null;
                pairing = { code: randomBytes(6).toString('hex'), connection: connection,
                    expires: Date.now() + 10 * 60 * 1000 };
            }
            return pairing.code;
        },
        consumePairing: function (code) {
            if (!validPairing(code)) return null;
            const connection = pairing.connection;
            pairing = null;
            desktop = null;
            return connection;
        },
        beginDesktop: function (code) {
            if (isTV || !validPairing(code)) return null;
            if (!desktop) desktop = { token: randomBytes(32).toString('hex'), pairing: pairing };
            return desktop.token;
        },
        consumeDesktop: function (token) {
            if (!validDesktop(token)) return null;
            const connection = pairing.connection;
            pairing = null;
            desktop = null;
            return connection;
        },
        clearPairing: function (connection) {
            if (!connection || (pairing && pairing.connection === connection)) {
                pairing = null;
                desktop = null;
            }
        }
    };
}

function usbPath(path, directory) {
    if (typeof path !== 'string' || !isAbsolute(path) || path.indexOf('\0') !== -1) {
        throw new Error('Invalid USB path');
    }
    const root = realpathSync('/media');
    const target = realpathSync(path);
    const child = relative(root, target);
    if (child === '..' || child.indexOf('..' + sep) === 0 || isAbsolute(child)) {
        throw new Error('Path is outside USB storage');
    }
    const stat = statSync(target);
    if (directory ? !stat.isDirectory() : !stat.isFile() || !/\.(wgt|tpk)$/i.test(target)) {
        throw new Error('Invalid USB file or directory');
    }
    return target;
}

module.exports = { createSecurity, trustedUIRequest, usbPath };
