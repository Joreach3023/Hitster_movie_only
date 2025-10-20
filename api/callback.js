export default async function handler(req, res) {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    });

    const basic = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const data = await tokenResp.json();
    if (!tokenResp.ok) {
      return res.status(500).send(`Token error: ${JSON.stringify(data)}`);
    }

    res.status(200).send(`
      <h1>Refresh token</h1>
      <pre>${data.refresh_token || '(no refresh token returned)'}</pre>
      <p>Ajoute ceci dans Vercel → Environment Variables → <b>SPOTIFY_REFRESH_TOKEN</b>, puis redeploie.</p>
    `);
  } catch (e) {
    res.status(500).send(e.message);
  }
}
