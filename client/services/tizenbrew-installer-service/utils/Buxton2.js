const { execSync } = require('child_process');

function getValue(valueName) {
    const cmd = execSync(`buxton2ctl get system ${valueName}`, { encoding: 'utf8' });
    const value = cmd.split(':')[1].trim();
    return value;
}

function setValue(valueName, type, value) {
    execSync(`buxton2ctl set-${type} system ${valueName} ${value}`, { encoding: 'utf8' });
}

function getDuid(adbClient) {
    return new Promise((resolve, reject) => {
        const stream = adbClient.createStream('shell:0 getduid')
        stream.on('data', (data) => {
            const duid = data.toString().trim();
            if (!adbClient._stream) {
                adbClient._stream.removeAllListeners('connect');
                adbClient._stream.removeAllListeners('error');
                adbClient._stream.removeAllListeners('close');
            }
            adbClient._stream.end();
            adbClient._stream = null;
            adbClient = null;
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