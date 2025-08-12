"use strict";

const fs = require('fs');

function readConfig() {
    if (!fs.existsSync('/home/owner/share/tizenbrewInstallerConfig.json')) {
        return {
            authorCert: null,
            distributorCert: null,
            password: null
        };
    }
    return JSON.parse(fs.readFileSync('/home/owner/share/tizenbrewInstallerConfig.json', 'utf8'));
}

function writeConfig(config) {
    fs.writeFileSync('/home/owner/share/tizenbrewInstallerConfig.json', JSON.stringify(config, null, 4));
}

module.exports = {
    readConfig,
    writeConfig
};