"use strict";

const fs = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { randomBytes } = require('crypto');

function configDirectory() {
    return join(homedir(), '.tizenbrew-installer');
}

function getConfigPath() {
    return join(configDirectory(), 'config.json');
}

function protect(path, directory) {
    const stat = fs.lstatSync(path);
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
        throw new Error('Unsafe configuration path');
    }
    // Windows uses the account's inherited ACLs; POSIX mode bits are not an ACL substitute.
    if (process.platform !== 'win32') fs.chmodSync(path, directory ? 0o700 : 0o600);
}

function writeConfig(config) {
    const directory = configDirectory();
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, 0o700);
    protect(directory, true);
    const destination = getConfigPath();
    if (fs.existsSync(destination)) protect(destination, false);
    const temporary = join(directory, '.config-' + randomBytes(16).toString('hex'));
    try {
        fs.writeFileSync(temporary, JSON.stringify(config, null, 4), { mode: 0o600, flag: 'wx' });
        fs.renameSync(temporary, destination);
        protect(destination, false);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

function readConfig() {
    const destination = getConfigPath();
    const legacy = join(homedir(), 'share', 'tizenbrewInstallerConfig.json');
    // Even when the new file takes precedence, do not leave an old credential copy world-readable.
    if (fs.existsSync(legacy)) protect(legacy, false);
    if (fs.existsSync(destination)) {
        protect(configDirectory(), true);
        protect(destination, false);
        return JSON.parse(fs.readFileSync(destination, 'utf8'));
    }
    if (fs.existsSync(legacy)) {
        const config = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        writeConfig(config);
        // Remove the old credential copy only after the private replacement is safely written.
        fs.unlinkSync(legacy);
        return config;
    }
    return { authorCert: null, distributorCert: null, password: null };
}

module.exports = { readConfig, writeConfig, getConfigPath };
