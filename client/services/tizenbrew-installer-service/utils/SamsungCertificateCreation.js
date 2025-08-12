const { Signature, SamsungCertificateCreator } = require('tizen')
const { getDuid } = require('./Buxton2.js');
const forge = require('node-forge');
const JSZip = require('jszip');

function createSamsungCertificate(authorInfo, accessInfo, adbClient) {
    return new Promise((resolve, reject) => {
        getDuid(adbClient)
            .then(duid => {
                const creator = new SamsungCertificateCreator();
                creator.createCertificate(authorInfo, accessInfo, [duid])
                    .then(cert => {
                        resolve(cert);
                    })
                    .catch(error => {
                        reject(new Error(`Samsung Certificate Creation Error: ${error.message}`));
                    });
            })
    });
}

function resignPackage(certificates, packageBuffer) {
    return new Promise(async (resolve, reject) => {
        try {
            const zip = await JSZip.loadAsync(packageBuffer);
            const files = await Promise.all(
                Object.keys(zip.files).map(async (filename) => {
                    const file = zip.files[filename];
                    if (file.dir) return null;
                    if (file.name.includes('signature') && file.name.endsWith('.xml')) return null;
                    const data = await file.async('nodebuffer');
                    return {
                        uri: encodeURIComponent(filename),
                        data
                    };
                })
            );

            const filteredFiles = files.filter(file => file !== null);

            const p12Asn1 = forge.asn1.fromDer(certificates.distributorCert);
            const distributorP12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certificates.password);
            const p12Asn1Author = forge.asn1.fromDer(certificates.authorCert);
            const authorP12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1Author, false, certificates.password);

            const AuthorSignature = new Signature('AuthorSignature', filteredFiles);
            const filesAuthor = await AuthorSignature.sign(authorP12);
            const DistributorSignature = new Signature('DistributorSignature', filesAuthor);
            const signedFiles = await DistributorSignature.sign(distributorP12);

            // Create a new zip
            const newZip = new JSZip();
            for (const file of signedFiles) {
                newZip.file(decodeURIComponent(file.uri), file.data);
            }

            resolve(await newZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
        } catch (error) {
            reject(new Error(`Resigning Package Error: ${error.message}`));
        }
    });
}

module.exports = { createSamsungCertificate, resignPackage };