const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'The Forge',
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev: load Vite dev server. Prod: load built renderer/index.html.
  mainWindow.loadURL('http://localhost:5173');
}

// Steam OpenID has no client secret / token exchange — the redirect itself
// (with openid.* query params, including openid.claimed_id containing the
// SteamID64) is the full auth result. We open it in the system browser (Steam
// requires this, not an embedded webview).
//
// Steam's OpenID provider validates that openid.return_to/openid.realm are
// http(s):// URLs — a custom scheme like forge://auth-callback gets rejected
// with "invalid protocol" on Steam's login page. So instead of the OS
// protocol handler (used below for future Riot/Battle.net OAuth, which do
// support custom-scheme redirect URIs for native apps), we spin up a
// short-lived localhost HTTP server just to catch this one redirect.

// Duplicated (not required) from src/services/steam.ts's getOpenIdLoginUrl:
// the main process runs plain CommonJS/Node with no TS build step, so it
// can't import the renderer-side TS module directly. Keep both in sync if
// the OpenID params change.
function getSteamOpenIdLoginUrl(returnUrl) {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': returnUrl,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `https://steamcommunity.com/openid/login?${params}`;
}

ipcMain.handle('steam:login', () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const claimedId = url.searchParams.get('openid.claimed_id') || '';
    // claimed_id looks like https://steamcommunity.com/openid/id/<steamid64>
    const steamId64 = claimedId.split('/').pop();

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      steamId64
        ? '<html><body>Steam login complete — you can close this tab.</body></html>'
        : '<html><body>Steam login failed — no SteamID returned.</body></html>'
    );

    if (steamId64 && mainWindow) {
      mainWindow.webContents.send('steam:callback', steamId64);
      mainWindow.focus();
    }
    server.close();
  });

  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const returnUrl = `http://127.0.0.1:${port}/auth-callback`;
    shell.openExternal(getSteamOpenIdLoginUrl(returnUrl));
  });

  // Don't leave the server open forever if the user abandons the login.
  setTimeout(() => server.close(), 5 * 60 * 1000);
});

// Steam's Web API doesn't send CORS headers, so calling it with fetch()
// straight from the renderer (a browser context) fails with "Failed to
// fetch" — the response is blocked before renderer code ever sees it. The
// main process is plain Node, not subject to CORS, so the actual network
// call happens here instead. This also keeps STEAM_API_KEY out of the
// renderer's JS bundle entirely, rather than just out of its own fetch call.
ipcMain.handle('steam:fetchLibrary', async (_event, steamId64) => {
  const apiKey = process.env.STEAM_API_KEY;
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId64}&include_appinfo=true&include_played_free_games=true`;
  const res = await fetch(url);
  const { response } = await res.json();
  return response?.games ?? [];
});

// TODO: Riot/Battle.net OAuth (both support custom-scheme redirect URIs for
// native apps, unlike Steam's OpenID above) will need 'open-url' (macOS) and
// second-instance argv parsing (Windows/Linux) handlers here to catch this.
app.setAsDefaultProtocolClient('forge');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
