// Run from the repository root: node --test tests/service-security.test.js
// These checks use mocks/temp directories and never contact a TV or Samsung.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const service = path.resolve(__dirname, '../client/services/tizenbrew-installer-service');

function load(file, overrides = {}) {
    const filename = path.join(service, file);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, process, Buffer, console,
        require: name => Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] :
            require(require.resolve(name, { paths: [service] }))
    }, { filename });
    return module.exports;
}

function request(url, origin = 'http://localhost:8091', host = 'localhost:8091') {
    return { url, headers: { origin, host } };
}

test('WebSocket credentials require an allowed origin, host and token; probes cannot authorize commands', () => {
    const { createSecurity, trustedUIRequest } = load('utils/security.js');
    const security = createSecurity(false);
    const url = '/ws?token=' + security.sessionToken;
    assert.equal(security.verifySocket(request(url)), true);
    for (const origin of ['null', 'file://', 'https://evil.example', undefined]) {
        const req = request(url, origin);
        if (origin === undefined) delete req.headers.origin;
        assert.equal(security.verifySocket(req), false);
        assert.equal(trustedUIRequest(req), false);
    }
    assert.equal(security.verifySocket(request(url, 'http://localhost:8091', 'evil.example:8091')), false);
    assert.equal(security.verifySocket(request('/ws')), false);
    assert.equal(security.verifySocket(request('/ws?token=wrong')), false);
    assert.equal(security.verifySocket(request('/probe')), true);
    assert.equal(security.verifySocket(request('/probe', 'null')), false);
    const tv = createSecurity(true);
    assert.equal(tv.verifySocket(request('/probe', 'null')), true);
    assert.equal(tv.verifySocket(request('/ws?token=' + tv.sessionToken, 'null')), false);
});

test('certificate pairing is expiring, connection-bound and single-use', () => {
    const { createSecurity } = load('utils/security.js');
    const security = createSecurity(true);
    const first = {}, second = {};
    const code = security.issuePairing(first);
    assert.match(code, /^[a-f0-9]{12}$/);
    assert.equal(security.consumePairing('wrong'), null);
    assert.equal(security.consumePairing(code), first);
    assert.equal(security.consumePairing(code), null);
    const old = security.issuePairing(first);
    security.issuePairing(second);
    assert.equal(security.consumePairing(old), null);
    security.clearPairing(second);
    assert.equal(security.consumePairing(security.issuePairing(first)), first);
    const source = fs.readFileSync(path.join(service, 'utils/security.js'), 'utf8');
    let now = 0;
    const module = { exports: {} };
    vm.runInNewContext(source, { module, require, Date: { now: () => now } });
    const timed = module.exports.createSecurity(true);
    const expired = timed.issuePairing(first);
    now = 10 * 60 * 1000 + 1;
    assert.equal(timed.consumePairing(expired), null);
});

test('desktop browser sessions are short-lived, single-use and invalidated with their installer connection', () => {
    let now = 0;
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(service, 'utils/security.js'), 'utf8'), {
        module, require, Date: { now: () => now }
    });
    const security = module.exports.createSecurity(false);
    const connection = {};
    const code = security.issuePairing(connection);
    assert.equal(security.beginDesktop('wrong'), null);
    const token = security.beginDesktop(code);
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(security.beginDesktop(code), token);
    assert.equal(security.consumeDesktop('wrong'), null);
    assert.equal(security.consumeDesktop(token), connection);
    assert.equal(security.consumeDesktop(token), null);
    const expired = security.beginDesktop(security.issuePairing(connection));
    now += 600001;
    assert.equal(security.consumeDesktop(expired), null);
    const disconnected = security.beginDesktop(security.issuePairing(connection));
    security.clearPairing(connection);
    assert.equal(security.consumeDesktop(disconnected), null);
    const superseded = security.beginDesktop(security.issuePairing(connection));
    security.issuePairing({});
    assert.equal(security.consumeDesktop(superseded), null);
    const tv = module.exports.createSecurity(true);
    assert.equal(tv.beginDesktop(tv.issuePairing(connection)), null);
});

test('USB paths reject traversal, prefix siblings, non-packages and symlink escapes', () => {
    const mappings = {
        '/media': '/media', '/media/drive': '/media/drive',
        '/media/drive/app.wgt': '/media/drive/app.wgt',
        '/media/../etc': '/etc', '/media-other': '/media-other',
        '/media/drive/link': '/etc', '/media/drive/secret.txt': '/media/drive/secret.txt'
    };
    const { usbPath } = load('utils/security.js', { fs: {
        realpathSync: p => { if (!mappings[p]) throw new Error('ENOENT'); return mappings[p]; },
        statSync: p => ({ isDirectory: () => !/\.(wgt|txt)$/.test(p), isFile: () => /\.(wgt|txt)$/.test(p) })
    } });
    assert.equal(usbPath('/media', true), '/media');
    assert.equal(usbPath('/media/drive/app.wgt', false), '/media/drive/app.wgt');
    for (const p of ['/media/../etc', '/media-other', '/media/drive/link', 'relative', null, '/media\0']) {
        assert.throws(() => usbPath(p, true));
    }
    assert.throws(() => usbPath('/media/drive/secret.txt', false));
});

test('package manifests and installation reject shell syntax; local calls use argv and SDB arguments are quoted', async () => {
    const calls = [];
    const packages = load('utils/PackageInstallation.js', { child_process: {
        execFileSync: (...args) => { calls.push(args); return 'installed'; }
    } });
    const destination = '/home/owner/share/tmp/sdk_tools/package.wgt';
    assert.equal(packages.installPackage(destination, 'xvvl3S1bTI'), 'installed');
    assert.equal(calls[0][0], 'wascmd');
    assert.equal(JSON.stringify(calls[0][1]), JSON.stringify(['-i', 'xvvl3S1bTI', '-p', destination]));
    for (const id of ['id;touch /tmp/x', '$(id)', '-option', 'bad id', undefined]) {
        assert.throws(() => packages.installPackage(destination, id));
    }
    assert.throws(() => packages.installPackage('/tmp/app.wgt', 'xvvl3S1bTI'));
    let command;
    const events = {};
    const pending = packages.installPackage(destination, 'xvvl3S1bTI', {
        createStream: value => { command = value; return { on: (name, callback) => { events[name] = callback; } }; }
    });
    events.end();
    await pending;
    assert.equal(command, "shell:0 vd_appinstall 'xvvl3S1bTI' '" + destination + "'");
    const JSZip = require(path.join(service, 'node_modules/jszip'));
    async function widget(id) {
        const zip = new JSZip();
        zip.file('config.xml', '<widget xmlns:tizen="http://tizen.org/ns/widgets"><tizen:application package="' + id + '"/></widget>');
        return zip.generateAsync({ type: 'nodebuffer' });
    }
    assert.equal((await packages.parsePackage(await widget('xvvl3S1bTI'))).packageId, 'xvvl3S1bTI');
    await assert.rejects(packages.parsePackage(await widget('id;evil')), /Invalid package ID/);
    const native = new JSZip();
    native.file('tizen-manifest.xml', '<manifest package="org.example_app"/>');
    assert.equal((await packages.parsePackage(await native.generateAsync({ type: 'nodebuffer' }))).isWgt, false);
    await assert.rejects(packages.parsePackage(await new JSZip().generateAsync({ type: 'nodebuffer' })), /manifest not found/);
});

test('HTTP and WebSocket entry points reject unauthorized requests without contacting a TV', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tbi-service-'));
    const child = spawn(process.execPath, ['.'], {
        cwd: service, env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    function call(port, route, method = 'GET', headers = {}, body = '') {
        return new Promise((resolve, reject) => {
            const req = http.request({ host: '127.0.0.1', port, path: route, method, headers }, res => {
                let text = '';
                res.on('data', data => { text += data; });
                res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
            });
            req.on('error', reject);
            req.end(body);
        });
    }
    const origin = 'http://127.0.0.1:8091';
    try {
        let ready = false;
        for (let i = 0; i < 100; i++) {
            if (child.exitCode !== null) throw new Error(output);
            try { await call(8091, '/session'); ready = true; break; }
            catch (_) { await new Promise(resolve => setTimeout(resolve, 50)); }
        }
        assert.equal(ready, true, output);
        const external = Object.values(os.networkInterfaces()).flat().find(address =>
            address.family === 'IPv4' && !address.internal);
        if (external) {
            for (const port of [8091, 4794]) {
                await assert.rejects(new Promise((resolve, reject) => {
                    const socket = net.createConnection({ host: external.address, port });
                    socket.setTimeout(1000);
                    socket.on('connect', () => { socket.destroy(); resolve(); });
                    socket.on('error', reject);
                    socket.on('timeout', () => { socket.destroy(); reject(new Error('Connection timeout')); });
                }));
            }
        }
        assert.equal((await call(8091, '/session', 'POST')).status, 403);
        assert.equal((await call(8091, '/session', 'POST', { Origin: 'https://evil.example' })).status, 403);
        assert.equal((await call(8091, '/session', 'POST', { Origin: origin, Host: 'evil.example:8091' })).status, 403);
        const session = await call(8091, '/session', 'POST', { Origin: origin });
        assert.equal(session.status, 200);
        assert.equal(session.headers['cache-control'], 'no-store');
        const token = JSON.parse(session.text).token;
        assert.match(token, /^[a-f0-9]{64}$/);
        assert.equal((await call(8091, '/services/tizenbrew-installer-service/index.js')).status, 404);
        assert.equal((await call(8091, '/ui/dist/index.html')).status, 200);
        assert.equal((await call(8091, '/ui/dist/index.html/desktop')).status, 200);
        assert.equal((await call(8091, '/ui/dist/index.html/install-from-gh')).status, 200);
        assert.equal((await call(4794, '/')).status, 200);
        assert.equal((await call(4794, '/signin/callback')).status, 200);
        assert.equal((await call(4794, '/other')).status, 404);
        assert.equal((await call(4794, '/', 'PUT')).status, 405);
        assert.equal((await call(4794, '/', 'POST', {
            Origin: 'http://127.0.0.1:4794', 'Content-Type': 'application/x-www-form-urlencoded'
        }, 'code=bad')).status, 400);
        const body = 'code=' + encodeURIComponent(JSON.stringify({ access_token: 'token', userId: 'user', inputEmailID: 'user@example.com' }));
        assert.equal((await call(4794, '/', 'POST', { 'Content-Type': 'application/x-www-form-urlencoded' }, body)).status, 403);
        const WS = require(path.join(service, 'node_modules/ws-new'));
        for (const options of [
            { route: '/ws', origin },
            { route: '/ws?token=' + token, origin: 'https://evil.example' },
            { route: '/ws?token=' + token, origin: 'null' }
        ]) {
            await new Promise((resolve, reject) => {
                const ws = new WS('ws://127.0.0.1:8091' + options.route, { origin: options.origin });
                ws.on('open', () => { ws.close(); reject(new Error('Unauthorized socket accepted')); });
                ws.on('error', () => resolve());
            });
        }
        // Verify both supported WebSocket library versions can authenticate successfully.
        for (const library of ['ws-old', 'ws-new']) {
            const Client = require(path.join(service, 'node_modules', library));
            const ws = new Client('ws://127.0.0.1:8091/ws?token=' + token, { origin });
            try {
                await once(ws, 'open');
                const message = once(ws, 'message');
                ws.send('null');
                assert.equal(JSON.parse((await message)[0].toString()).type, 3);
                const response = once(ws, 'message');
                ws.send(JSON.stringify({ type: 2, payload: '/etc' }));
                assert.equal(JSON.parse((await response)[0].toString()).type, 3);
            } finally { ws.close(); }
        }
    } finally {
        if (child.exitCode === null) {
            const exit = once(child, 'exit');
            child.kill();
            await exit;
        }
        fs.rmSync(home, { recursive: true, force: true });
    }
});

test('Samsung GET/POST callbacks require local confirmation, not a manually entered desktop code', async () => {
    const express = require(path.join(service, 'node_modules/express'));
    const certificateAccess = require(path.join(service, 'utils/certificateAccess.js'));
    const { createSecurity } = load('utils/security.js');
    const info = { access_token: 'sample-token', userId: 'sample-user', inputEmailID: 'account@example.test' };
    const body = 'code=' + encodeURIComponent(JSON.stringify(info));
    for (const isTV of [false, true]) {
        const security = createSecurity(isTV);
        const connection = {};
        const code = security.issuePairing(connection);
        let creations = 0;
        const app = express();
        app.use(certificateAccess(security, isTV));
        app.post('/', (req, res) => {
            assert.equal(res.locals.certificate.connection, connection);
            assert.equal(JSON.stringify(res.locals.certificate.body), JSON.stringify(info));
            creations++;
            res.send('created');
        });
        const server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        function call(route, method = 'GET', headers = {}, data = '') {
            return new Promise((resolve, reject) => {
                const req = http.request({ host: '127.0.0.1', port: server.address().port, path: route, method,
                    headers: { Host: 'localhost:4794', ...headers } }, res => {
                    let text = '';
                    res.on('data', chunk => { text += chunk; });
                    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
                });
                req.on('error', reject);
                req.end(data);
            });
        }
        const localHeaders = { Origin: 'http://localhost:4794', 'Content-Type': 'application/x-www-form-urlencoded' };
        try {
            if (isTV) {
                assert.equal((await call('/start?pairingCode=' + code)).status, 404);
                assert.equal((await call('/signin/callback?' + body)).status, 404);
                assert.match((await call('/')).text, /id="pairing-code"/);
                assert.equal((await call('/', 'POST', localHeaders, body)).status, 403);
                assert.equal((await call('/', 'POST', localHeaders, body + '&pairingCode=' + code)).status, 200);
                assert.equal(creations, 1);
                continue;
            }
            assert.equal((await call('/start?pairingCode=wrong')).status, 403);
            const start = await call('/start?pairingCode=' + code);
            assert.equal(start.status, 303);
            assert.match(start.headers.location, /^https:\/\/account\.samsung\.com\//);
            assert.match(start.headers['set-cookie'][0], /HttpOnly/);
            assert.match(start.headers['set-cookie'][0], /SameSite=Strict/);
            const cookie = start.headers['set-cookie'][0].split(';')[0];
            // Browsers may omit the Strict cookie on the cross-site callback. No cookie is needed to render it.
            for (const method of ['GET', 'POST']) {
                const callback = await call('/signin/callback' + (method === 'GET' ? '?' + body : ''), method,
                    method === 'POST' ? { Origin: 'https://account.samsung.com', 'Content-Type': localHeaders['Content-Type'] } : {},
                    method === 'POST' ? body : '');
                assert.equal(callback.status, 200);
                assert.match(callback.text, /Create certificates/);
                assert.doesNotMatch(callback.text, /id="pairing-code"/);
                assert.equal(callback.headers['set-cookie'], undefined);
                assert.equal(creations, 0);
            }
            assert.equal((await call('/signin/callback', 'POST', {
                Origin: 'https://evil.example', 'Content-Type': localHeaders['Content-Type']
            }, body)).status, 403);
            assert.equal((await call('/signin/callback?code=bad')).status, 400);
            assert.equal((await call('/', 'POST', localHeaders, body + '&pairingCode=' + code)).status, 403);
            assert.equal((await call('/', 'POST', { ...localHeaders, Origin: 'https://account.samsung.com', Cookie: cookie }, body)).status, 403);
            assert.equal((await call('/', 'POST', { Cookie: cookie, 'Content-Type': localHeaders['Content-Type'] }, body)).status, 403);
            assert.equal((await call('/', 'POST', { ...localHeaders, Cookie: cookie }, body)).status, 200);
            assert.equal(creations, 1);
            assert.equal((await call('/', 'POST', { ...localHeaders, Cookie: cookie }, body)).status, 403);
        } finally { await new Promise(resolve => server.close(resolve)); }
    }
});

test('callback account data is escaped and no browser request happens until confirmation', () => {
    const page = require(path.join(service, 'utils/HTMLPage.js'));
    const info = { access_token: 'token', userId: 'user', inputEmailID: '</script><script>throw new Error("injected")</script>' };
    const html = page(info, true);
    assert.doesNotMatch(html, /<script>throw new Error/);
    assert.equal((html.match(/<script>/g) || []).length, 1);
    const elements = { submit: { addEventListener: (name, handler) => { elements.submit.click = handler; } }, status: {}, account: {} };
    let requests = 0;
    let submitted;
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
        document: { getElementById: id => elements[id] },
        history: { replaceState: (state, title, url) => assert.equal(url, '/') },
        XMLHttpRequest: function () {
            requests++;
            this.open = (method, url) => { assert.equal(method, 'POST'); assert.equal(url, '/'); };
            this.setRequestHeader = () => {};
            this.send = data => { submitted = data; };
        }
    });
    assert.equal(requests, 0);
    assert.equal(elements.account.textContent, 'Samsung account: ' + info.inputEmailID);
    elements.submit.click();
    assert.equal(requests, 1);
    assert.equal(new URLSearchParams(submitted).get('code'), JSON.stringify(info));
    assert.equal(new URLSearchParams(submitted).get('pairingCode'), '');
});

test('Buxton calls never use a shell and reject unsupported keys/types', () => {
    const calls = [];
    const buxton = load('utils/Buxton2.js', { child_process: {
        execFileSync: (...args) => { calls.push(args); return 'value: result'; }
    } });
    buxton.setValue('db/sdk/develop/ip', 'string', '127.0.0.1');
    buxton.setValue('db/sdk/develop/mode', 'int32', '1');
    assert.equal(buxton.getValue('db/sdk/develop/ip'), 'result');
    assert.equal(calls[0][0], 'buxton2ctl');
    assert.equal(JSON.stringify(calls[0][1]), JSON.stringify(['set-string', 'system', 'db/sdk/develop/ip', '127.0.0.1']));
    assert.throws(() => buxton.setValue('db/key;id', 'string', 'value'));
    assert.throws(() => buxton.setValue('db/key', 'string;id', 'value'));
});

test('configuration migrates legacy credentials and repairs existing POSIX permissions without chmodding share', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tbi-config-'));
    try {
        const share = path.join(home, 'share');
        fs.mkdirSync(share, 0o755);
        if (process.platform !== 'win32') fs.chmodSync(share, 0o755);
        const legacy = path.join(share, 'tizenbrewInstallerConfig.json');
        const secret = { authorCert: 'author', distributorCert: 'distributor', password: 'secret' };
        fs.writeFileSync(legacy, JSON.stringify(secret), { mode: 0o644 });
        const config = load('utils/configuration.js', { os: { homedir: () => home } });
        assert.equal(JSON.stringify(config.readConfig()), JSON.stringify(secret));
        assert.equal(fs.existsSync(legacy), false);
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(share).mode & 0o777, 0o755);
            assert.equal(fs.statSync(path.dirname(config.getConfigPath())).mode & 0o777, 0o700);
            assert.equal(fs.statSync(config.getConfigPath()).mode & 0o777, 0o600);
            fs.chmodSync(config.getConfigPath(), 0o644);
            config.readConfig();
            assert.equal(fs.statSync(config.getConfigPath()).mode & 0o777, 0o600);
        }
        config.writeConfig({ password: 'updated' });
        fs.writeFileSync(legacy, JSON.stringify(secret), { mode: 0o644 });
        assert.equal(config.readConfig().password, 'updated');
        if (process.platform !== 'win32') assert.equal(fs.statSync(legacy).mode & 0o777, 0o600);
        fs.unlinkSync(config.getConfigPath());
        if (process.platform !== 'win32') {
            fs.symlinkSync(share, config.getConfigPath());
            assert.throws(() => config.readConfig(), /Unsafe configuration path/);
        }
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
