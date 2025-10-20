const SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state'
].join(' ');

export default async function handler(req, res) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  });
  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
  res.status(302).setHeader('Location', url).end();
}
