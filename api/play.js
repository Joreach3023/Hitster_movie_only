async function refreshAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
  });
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!r.ok) throw new Error(`Refresh failed: ${await r.text()}`);
  const data = await r.json();
  return data.access_token;
}

async function getDevices(accessToken) {
  const r = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`devices: ${JSON.stringify(data)}`);
  return data.devices || [];
}

async function transferPlayback(accessToken, deviceId) {
  const r = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: true }),
  });
  if (r.status !== 204 && !r.ok) {
    throw new Error(`transfer: ${await r.text()}`);
  }
}

export default async function handler(req, res) {
  try {
    const { t, device_id } = req.query;
    if (!t || !t.startsWith('spotify:track:')) {
      return res.status(400).send('Missing or invalid t (expected spotify:track:<ID>)');
    }

    const accessToken = await refreshAccessToken();
    const devices = await getDevices(accessToken);
    const active = devices.find(d => d.is_active);

    let targetDeviceId = active?.id;
    if (!targetDeviceId) {
      const fallback = device_id || process.env.SPOTIFY_DEVICE_ID;
      if (!fallback) {
        return res.status(409).send('No active device. Provide ?device_id=... or set SPOTIFY_DEVICE_ID.');
      }
      const exists = devices.find(d => d.id === fallback);
      if (!exists) {
        return res.status(404).send(`Device ${fallback} not found. GET /api/devices for the list.`);
      }
      await transferPlayback(accessToken, fallback);
      targetDeviceId = fallback;
    }

    const playResp = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [t] }),
    });

    if (playResp.status === 204 || playResp.ok) {
      return res.status(200).send('Playing ✅');
    } else {
      const txt = await playResp.text();
      return res.status(playResp.status).send(txt);
    }
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
}
