function accessInfoPage(accessInfo, desktop) {
    // Callback data is untrusted. Escape HTML/script delimiters before embedding JSON,
    // and render the account name with textContent, never innerHTML.
    const data = JSON.stringify(accessInfo || null).replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return `<!doctype html>
<html>
<head>
    <title>Certificate setup</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="background-color: #1e68c9; font-family: Arial, sans-serif; color: white; padding: 20px;">
    <h1>Certificate setup</h1>
    ${desktop ? `
    <p id="account"></p>
    <p>Confirm that this is your Samsung account, then create certificates for the TV connected in the installer.</p>
    <p>No pairing code needs to be entered on this device.</p>
    ` : `
    <label for="pairing-code">Pairing code shown in the installer (valid for 10 minutes)</label>
    <input id="pairing-code" type="text" autocomplete="off" maxlength="12" placeholder="Pairing code">
    <p><label for="access-info">Samsung response JSON</label></p>
    <textarea id="access-info" rows="6" style="width: 100%;" autocomplete="off"></textarea>
    `}
    <button id="submit" style="padding: 12px;">${desktop ? 'Create certificates' : 'Submit'}</button>
    <p id="status" role="status">This may take 30–60 seconds.</p>
    <script>
        (function () {
            var accessInfo = ${data};
            var desktop = ${desktop ? 'true' : 'false'};
            var button = document.getElementById('submit');
            var status = document.getElementById('status');
            // Remove callback query parameters (which can contain credentials) from the address bar.
            if (desktop) {
                history.replaceState(null, '', '/');
                document.getElementById('account').textContent = accessInfo ?
                    'Samsung account: ' + accessInfo.inputEmailID : 'Return to the installer and select Sign in to Samsung Account.';
                button.disabled = !accessInfo;
            }
            button.addEventListener('click', function () {
                var json = accessInfo;
                var pairingCode = '';
                if (!desktop) {
                    pairingCode = document.getElementById('pairing-code').value.trim();
                    if (!/^[a-f0-9]{12}$/.test(pairingCode)) {
                        status.textContent = 'Enter the pairing code shown in the installer.';
                        return;
                    }
                    try { json = JSON.parse(document.getElementById('access-info').value); }
                    catch (e) { status.textContent = 'Invalid JSON format.'; return; }
                }
                if (!json) return;
                button.disabled = true;
                status.textContent = 'Creating certificates. Please wait…';
                var request = new XMLHttpRequest();
                request.open('POST', '/');
                request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                request.timeout = 120000;
                request.onload = function () {
                    if (request.status >= 200 && request.status < 300) {
                        status.textContent = 'Certificates created. You can close this page and retry installation.';
                    } else {
                        var message = 'Certificate creation failed. Restart sign-in from the installer to retry.';
                        try { message = JSON.parse(request.responseText).error || message; } catch (e) { }
                        status.textContent = message;
                        if (!desktop) button.disabled = false;
                    }
                };
                request.onerror = request.ontimeout = function () {
                    status.textContent = 'Connection failed or timed out. Restart sign-in from the installer to retry.';
                    if (!desktop) button.disabled = false;
                };
                request.send('code=' + encodeURIComponent(JSON.stringify(json)) + '&pairingCode=' + encodeURIComponent(pairingCode));
            });
        }());
    </script>
</body>
</html>`;
}

module.exports = accessInfoPage;
