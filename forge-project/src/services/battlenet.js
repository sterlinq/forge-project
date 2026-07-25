// Battle.net covers WoW, Diablo III, Hearthstone, StarCraft II only —
// no general presence, no Overwatch. Two auth flows:
//   - Authorization-code flow (user consent) for profile data (characters,
//     achievements) — this is what we need.
//   - Client-credentials flow for static game data (items, zones etc.) —
//     not user-specific, lower priority.
// Recent Blizzard change: access tokens must go in the Authorization header,
// NOT the URL query string — older examples online are wrong on this.

export function getOAuthLoginUrl(clientId, redirectUri, region = 'us') {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'wow.profile',
  });
  return `https://${region}.battle.net/oauth/authorize?${params}`;
}

export async function exchangeToken(clientId, clientSecret, code, redirectUri) {
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  return res.json();
}

export async function fetchCharacterProfile(accessToken, region, realmSlug, characterName) {
  const url = `https://${region}.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName}?namespace=profile-${region}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }, // header, not query param
  });
  // TODO: map into `games` / `milestones` schema
  return res.json();
}
