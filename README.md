# Leon

Web Exposure Scanner for Security Research



**Leon** is a Minimal Firefox extension designed to help security researchers identify potentially exposed sensitive files and endpoints on web applications.

<img width="384" height="462" alt="ss" src="https://github.com/user-attachments/assets/f49e7ced-5afd-43d0-81f1-9be539f2ecf8" />

## Features

- 🔍 Scan the current HTTP(S) website
- 🔐 Detection of common credential/configuration patterns
- 📦 Git repository exposure checks
- ⏱️ Request timeout handling
- 📊 Live scan progress and results

## What Leon Checks

The default wordlist includes resources such as:

```
.env
.env.production
.git/HEAD
.git/config
.git-credentials
.htpasswd
.bash_history
docker-compose.yml
nginx.conf
Web.config
config.inc
app.config
services.config
error.log
access.log
openapi.json
swagger.json
v3/api-docs
```

The wordlist is intentionally focused on potentially sensitive resources rather than general directory discovery.

## Installation

### Firefox

1. Clone the repository:
```
git clone git@github.com:MaMad4Ever/Leon.git
```
2. Open Firefox and navigate to:
`about:debugging`
3. Select This Firefox.
4. Click Load Temporary Add-on...
5. Select the `manifest.json` file from the Hypno directory.
6. Open any web page and launch Hypno from the Firefox toolbar.

## ⚠️ Disclaimer

Leon is intended for authorized security research only.

Only scan websites and systems that you own or have explicit permission to test. Do not use Leon to access, download, or disclose sensitive information from systems without authorization.
