// /api/login?redirect_uri=<return_to_frontend_url>
import crypto from 'node:crypto';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ');

// Generate PKCE code verifier/challenge
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

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
  const { redirect_uri } = req.query;
  if (!CLIENT_ID || !redirect_uri) {
    return res.status(400).send('Missing CLIENT_ID or redirect_uri');
  }
  const code_verifier = base64url(crypto.randomBytes(64));
  const code_challenge = base64url(crypto.createHash('sha256').update(code_verifier).digest());

  // Store verifier in a short-lived cookie
  const cookieParts = [`cv=${code_verifier}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=600'];
  if (isSecureRequest(req)) {
    cookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieParts.join('; '));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/callback`,
    code_challenge_method: 'S256',
    code_challenge
  });

  const state = new URLSearchParams({ ret: redirect_uri }).toString();
  res.redirect(`${SPOTIFY_AUTH_URL}?${params.toString()}&state=${encodeURIComponent(state)}`);
}
