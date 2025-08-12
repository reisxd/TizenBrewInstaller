const fetch = require('node-fetch');

function fetchLatestRelease(repo) {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => data);
}

module.exports = {
    fetchLatestRelease
};