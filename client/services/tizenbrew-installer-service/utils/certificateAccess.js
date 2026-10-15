"use strict";

const express = require('express');
const { networkInterfaces } = require('os');
const accessInfoPage = require('./HTMLPage.js');

const samsungLogin = 'https://account.samsung.com/mobile/account/check.do?serviceID=v285zxnl3h' +
    '&actionID=StartOAuth2&accessToken=Y&redirect_uri=http://localhost:4794/signin/callback';
const cookieName = 'tbiCertificate';

function parseAccessInfo(code) {
    if (typeof code !== 'string' || code.length > 32768) throw new Error('Invalid access information');
    const body = JSON.parse(code);
    if (!body || ['access_token', 'userId', 'inputEmailID'].some(key =>
        typeof body[key] !== 'string' || !body[key] || body[key].length > 8192)) {
        throw new Error('Invalid access information');
    }
    return { access_token: body.access_token, userId: body.userId, inputEmailID: body.inputEmailID };
}

function desktopCookie(request) {
    const match = /(?:^|;\s*)tbiCertificate=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '');
    return match ? match[1] : null;
}

function certificateAccess(security, isTV) {
    const router = express.Router();
    const hosts = ['localhost:4794', '127.0.0.1:4794'];
    if (isTV) {
        const interfaces = networkInterfaces();
        Object.keys(interfaces).forEach(name => interfaces[name].forEach(address => {
            if (address.family === 'IPv4') hosts.push(address.address + ':4794');
        }));
    }
    router.use((request, response, next) => {
        response.set('Cache-Control', 'no-store');
        response.set('X-Frame-Options', 'DENY');
        response.set('Referrer-Policy', 'no-referrer');
        response.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; " +
            "style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        if (hosts.indexOf(request.headers.host) === -1) return response.sendStatus(403);
        if (['/', '/start', '/signin/callback'].indexOf(request.path) === -1) return response.sendStatus(404);
        if (request.method !== 'GET' && request.method !== 'POST') return response.sendStatus(405);
        next();
    });
    router.use(express.urlencoded({ extended: false, limit: '32kb' }));
    router.get('/start', (request, response) => {
        if (isTV) return response.sendStatus(404);
        // Samsung's fixed callback uses localhost, so the session cookie must use that host too.
        if (request.headers.host !== 'localhost:4794') {
            return response.redirect(303, 'http://localhost:4794' + request.originalUrl);
        }
        const token = security.beginDesktop(request.query.pairingCode);
        if (!token) return response.status(403).send('Sign-in expired. Retry installation in the installer.');
        // Strict cookies are deliberately absent on cross-site callbacks. They are sent
        // on the subsequent same-origin confirmation POST, which is the only mutating route.
        response.cookie(cookieName, token, { httpOnly: true, sameSite: 'strict', maxAge: 600000, path: '/' });
        response.redirect(303, samsungLogin);
    });
    router.all('/signin/callback', (request, response) => {
        if (isTV) return response.sendStatus(404);
        if (request.method === 'POST' && request.headers.origin &&
            request.headers.origin !== 'https://account.samsung.com') return response.sendStatus(403);
        const code = request.method === 'POST' ? request.body.code : request.query.code;
        if (!code) return response.send(accessInfoPage(null, true));
        try {
            // Accept both Samsung callback methods without changing any state or setting cookies.
            // The user must confirm locally; callback-supplied pairing codes are never trusted.
            response.send(accessInfoPage(parseAccessInfo(code), true));
        } catch (err) {
            response.status(400).send('Invalid Samsung callback. Restart sign-in from the installer.');
        }
    });
    router.get('/', (_, response) => response.send(accessInfoPage(null, !isTV)));
    router.post('/', (request, response, next) => {
        if (request.headers.origin !== 'http://' + request.headers.host) return response.sendStatus(403);
        let body;
        try { body = parseAccessInfo(request.body.code); }
        catch (err) { return response.status(400).json({ error: 'Invalid access information' }); }
        const connection = isTV ? security.consumePairing(request.body.pairingCode) :
            security.consumeDesktop(desktopCookie(request));
        if (!connection) return response.status(403).json({
            error: 'Authorization expired. Retry installation and sign-in from the installer.'
        });
        if (!isTV) response.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'strict' });
        response.locals.certificate = { body: body, connection: connection };
        next();
    });
    return router;
}

module.exports = certificateAccess;
