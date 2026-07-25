// Riot requires an APPROVED PRODUCTION KEY before RSO (user login) works —
// apply at developer.riotgames.com early, review takes ~2 weeks.
// Dev keys (auto-issued) expire every 24h and cannot do user login at all —
// fine only for testing static/personal endpoints.
// Valorant specifically has no "personal key" tier — production is required
// even to prototype against it.
// Auth header: X-Riot-Token. No OAuth scopes — a key has full read access.

const regionBase = (region) => `https://${region}.api.riotgames.com`;

export function getRsoLoginUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid cpid',
  });
  return `https://auth.riotgames.com/authorize?${params}`;
}

export async function fetchMatchHistory(apiKey, region, puuid) {
  const url = `${regionBase(region)}/lol/match/v5/matches/by-puuid/${puuid}/ids`;
  const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  // TODO: map match results into `games` / `milestones` schema
  return res.json();
}
