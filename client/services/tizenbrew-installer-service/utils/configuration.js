"use strict";

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { homedir } = require('os');

function readConfig() {
    if (!existsSync(`${homedir()}/share/tizenbrewInstallerConfig.json`)) {
        return {
            authorCert: null,
            distributorCert: null,
            password: null
        };
    }
    return JSON.parse(readFileSync(`${homedir()}/share/tizenbrewInstallerConfig.json`, 'utf8'));
}

function writeConfig(config) {
    if (!existsSync(`${homedir()}/share`)) {
        mkdirSync(`${homedir()}/share`);
    }

    writeFileSync(`${homedir()}/share/tizenbrewInstallerConfig.json`, JSON.stringify(config, null, 4));
}

module.exports = {
    readConfig,
    writeConfig
};