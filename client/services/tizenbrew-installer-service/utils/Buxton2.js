const { execFileSync } = require('child_process');

function validateKey(valueName) {
    if (typeof valueName !== 'string' || !/^[a-zA-Z0-9_/-]+$/.test(valueName)) {
        throw new Error('Invalid Buxton key');
    }
}

function getValue(valueName) {
    validateKey(valueName);
    const cmd = execFileSync('buxton2ctl', ['get', 'system', valueName], { encoding: 'utf8' });
    const value = cmd.split(':')[1].trim();
    return value;
}

function setValue(valueName, type, value) {
    validateKey(valueName);
    if (['string', 'int32'].indexOf(type) === -1 || typeof value !== 'string') {
        throw new Error('Invalid Buxton value or type');
    }
    execFileSync('buxton2ctl', ['set-' + type, 'system', valueName, value], { encoding: 'utf8' });
}

function getDuid(adbClient, isTV) {
    return new Promise((resolve, reject) => {
        const stream = adbClient.createStream('shell:0 getduid')
        stream.on('data', (data) => {
            const duid = data.toString().trim();
            if (adbClient._stream && isTV) {
                adbClient._stream.removeAllListeners('connect');
                adbClient._stream.removeAllListeners('error');
                adbClient._stream.removeAllListeners('close');
                adbClient._stream.end();
                adbClient._stream.destroy();
                adbClient._stream = null;
                adbClient = null;
            }
            resolve(duid);
        });
        stream.on('error', (error) => {
            reject(error);
        });
    });
}

module.exports = {
    getValue,
    setValue,
    getDuid
};