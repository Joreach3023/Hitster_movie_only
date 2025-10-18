// Exchanges code for access_token using PKCE, then redirects back to frontend with ?token=...
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')));
    const code_verifier = cookies['cv'];
    if (!code || !code_verifier) return res.status(400).send('Missing code or verifier.');

    // Endpoint URL
    const redirect_uri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/callback`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      code_verifier,
      redirect_uri
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).send(`Token error: ${JSON.stringify(tokenJson)}`);
    }

    // Clear cookie
    res.setHeader('Set-Cookie', `cv=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);

    // Read state to know where to go back
    const stateParams = new URLSearchParams(state);
    const ret = stateParams.get('ret') || '/';

    // Pass access_token in URL (short session); in prod, set your own session
    const url = new URL(ret);
    url.searchParams.set('token', tokenJson.access_token);
    res.redirect(url.toString());
  } catch (e) {
    res.status(500).send('Callback error: ' + e.message);
  }
}
