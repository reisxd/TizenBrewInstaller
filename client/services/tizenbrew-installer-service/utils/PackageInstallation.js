const { execSync } = require('child_process');
const xml2js = require('xml2js');
const JSZip = require('jszip');

// Only wascmd is implemented, as pkgcmd (or native apps) are not available in Tizen 3.

function installPackage(packagePath, id, adbClient) {
    if (adbClient) {
        // Install with vd_appinstall (wascmd wrapper for SDB)
        return new Promise((resolve, reject) => {
            const stream = adbClient.createStream(`shell:0 vd_appinstall ${id} ${packagePath}`);
            let data = '';
            stream.on('data', (chunk) => {
                data += `${chunk}\n`;
                if (data.indexOf('spend time') !== -1) resolve(data);
            });
            stream.on('error', (error) => {
                reject(new Error(`ADB Error: ${error}`));
            });
            stream.on('end', () => {
                resolve(data);
            });
            stream.on('close', () => {
                resolve(data);
            });
        });
    }
    try {
        const output = execSync(`wascmd -i ${id} -p ${packagePath}`, { encoding: 'utf8' });
        return output;
    } catch (error) {
        return error;
    }
}

function parsePackage(buffer) {
    // Only WGT packages are supported, as Tizen 3 does not support native apps.
    const parser = new xml2js.Parser();
    return JSZip.loadAsync(buffer)
        .then(zip => {
            const isWgt = Object.keys(zip.files).indexOf('config.xml') !== -1;
            const configXmlFile = isWgt ? zip.files['config.xml'] : zip.files['tizen-manifest.xml'];
            if (configXmlFile) {
                return configXmlFile.async('string')
                    .then(xmlString => parser.parseStringPromise(xmlString))
                    .then(result => {
                        let packageId;
                        if (!isWgt) {
                            packageId = result.manifest.$.package;
                        } else {
                            packageId = result.widget['tizen:application'][0].$.package;
                        }
                        return {
                            packageId,
                            isWgt
                        };
                    });
            } else {
                return null;
            }
        });
}

module.exports = {
    installPackage,
    parsePackage
};