// Exchanges code for access_token using PKCE, then redirects back to frontend with ?token=...
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

function isSecureRequest(req) {
  const protoHeader = req.headers['x-forwarded-proto'];
  if (protoHeader) {
    return protoHeader.split(',')[0] === 'https';
  }
  if (req.protocol) {
    return req.protocol === 'https';
  }
  const host = (req.headers['host'] || '').toLowerCase();
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) {
    return false;
  }
  // Default to non-secure when protocol cannot be determined.
  return false;
}

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
    const cookieParts = ['cv=', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
    if (isSecureRequest(req)) {
      cookieParts.push('Secure');
    }
    res.setHeader('Set-Cookie', cookieParts.join('; '));

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
