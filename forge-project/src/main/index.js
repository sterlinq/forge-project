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
// protocol handler (registered below, still unverified for Riot — see the
// TODO near it), we spin up a short-lived localhost HTTP server just to
// catch this one redirect. Battle.net's OAuth below uses the same pattern,
// just with a fixed port instead of an ephemeral one.

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

// ===== Battle.net OAuth (WoW) =====
// Authorization-code flow. Unlike Steam, this needs a client secret for the
// token exchange, so that step (and every other Blizzard API call, for the
// same CORS-safety reason documented above steam:fetchLibrary) happens here
// in main, never in the renderer.
//
// Duplicated (not required) from src/services/battlenet.ts's
// getOAuthLoginUrl: same reason as getSteamOpenIdLoginUrl above — main has
// no TS build step. battlenet.ts's copies of this logic (and of the
// exchange/profile calls below) exist for type-checked reference and are
// what a future build step would let main import directly; keep both in
// sync if the OAuth params or endpoints change.
const BATTLENET_PORT = 53682;
const BATTLENET_REDIRECT_URI = `http://localhost:${BATTLENET_PORT}/callback`;
const BATTLENET_REGION = 'us'; // no region-selector UI yet

function getBattlenetOAuthUrl(clientId, redirectUri, region) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'wow.profile',
  });
  return `https://${region}.battle.net/oauth/authorize?${params}`;
}

async function battlenetTokenRequest(body) {
  const clientId = process.env.BATTLENET_CLIENT_ID;
  const clientSecret = process.env.BATTLENET_CLIENT_SECRET;
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Buffer, not btoa — this runs in Node (main), not a browser context.
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams(body),
  });
  return res.json();
}

// Fixed port, not ephemeral like Steam's `server.listen(0, ...)` — Battle.net
// validates redirect_uri exactly against what's registered in the developer
// portal (http://localhost:53682/callback), so the port can't float per-launch.
ipcMain.handle('battlenet:startAuth', () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${BATTLENET_PORT}`);
    const code = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      code
        ? '<html><body>Battle.net login complete — you can close this tab.</body></html>'
        : '<html><body>Battle.net login failed — no authorization code returned.</body></html>'
    );

    if (mainWindow) {
      if (code) mainWindow.webContents.send('battlenet:callback', code);
      else mainWindow.webContents.send('battlenet:error', oauthError || 'no_code');
      mainWindow.focus();
    }
    server.close();
  });

  server.listen(BATTLENET_PORT, 'localhost', () => {
    shell.openExternal(
      getBattlenetOAuthUrl(process.env.BATTLENET_CLIENT_ID, BATTLENET_REDIRECT_URI, BATTLENET_REGION)
    );
  });

  server.on('error', (err) => {
    console.error(`Battle.net callback server couldn't bind port ${BATTLENET_PORT}:`, err.message);
    if (mainWindow) mainWindow.webContents.send('battlenet:error', 'server_error');
  });

  // Don't leave the server open forever if the user abandons the login.
  setTimeout(() => server.close(), 5 * 60 * 1000);
});

// Exchanges the authorization code for tokens, then fetches the BattleTag
// (there's no other stable per-account identifier in the token response) —
// this is what LibraryView upserts into linked_accounts as platform_user_id.
ipcMain.handle('battlenet:completeAuth', async (_event, code) => {
  const token = await battlenetTokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: BATTLENET_REDIRECT_URI,
  });
  if (!token.access_token) {
    throw new Error(token.error_description || token.error || 'Battle.net token exchange failed');
  }

  const userinfoRes = await fetch(`https://${BATTLENET_REGION}.battle.net/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const userinfo = await userinfoRes.json();

  return {
    battletag: userinfo.battletag,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    region: BATTLENET_REGION,
  };
});

// Mirrors steam:fetchLibrary: a token alone doesn't say which characters
// exist, so first list the account's characters across all realms, then
// loop each one for full profile + completed-achievement data.
ipcMain.handle('battlenet:fetchProfile', async (_event, { accessToken, region }) => {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const accountRes = await fetch(
    `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-${region}`,
    { headers: authHeader }
  );
  const accountData = await accountRes.json();
  const characters = (accountData?.wow_accounts ?? []).flatMap((acct) => acct.characters ?? []);

  const achievementsByCharacter = {};
  for (const character of characters) {
    const slug = character.realm.slug;
    const name = character.name.toLowerCase(); // Blizzard's character API requires lowercase slugs
    const achievementsRes = await fetch(
      `https://${region}.api.blizzard.com/profile/wow/character/${slug}/${name}/achievements?namespace=profile-${region}`,
      { headers: authHeader }
    );
    const achievementsData = await achievementsRes.json();
    achievementsByCharacter[`${slug}-${name}`] = (achievementsData?.achievements ?? []).filter(
      (a) => a.completed_timestamp
    );
  }

  return { characters, achievementsByCharacter };
});

// TODO: Riot OAuth's redirect mechanism hasn't been verified yet — do not
// assume custom-scheme support without checking first. (Battle.net, once
// assumed to support it too, turned out not to: it validates redirect_uri
// exactly against what's registered in the developer portal, so it uses the
// same fixed-port local-HTTP-server pattern as Steam's OpenID above — see
// the battlenet:startAuth handler below.)
app.setAsDefaultProtocolClient('forge');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
