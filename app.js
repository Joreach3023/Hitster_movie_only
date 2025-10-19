// ------- Config -------
const API_BASE = 'https://hitster-jordan-oexi.vercel.app'; // ex: https://hitster-geek.vercel.app
const TRACKS_JSON = './tracks.json'; // mapping { "spotify:track:...": {title, year} }

// ------- State -------
let accessToken = null;
let deviceId = null;
let player = null;
let playerActivated = false;
let currentUri = null;
let countdown = 30;
let timerHandle = null;

const STORAGE_TOKEN_KEY = 'hitster:spotify_access_token';
const STORAGE_URI_KEY = 'hitster:last_track_uri';
const CHANNEL_NAME = 'hitster:track_channel';

const storage = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch (err) {
    console.warn('localStorage unavailable', err);
  }
  return null;
})();

const qs = new URLSearchParams(location.search);
const paramUri = qs.get('t'); // spotify:track:...
if (paramUri) currentUri = decodeURIComponent(paramUri);

let trackChannel = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    trackChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch (err) {
  console.warn('BroadcastChannel not available', err);
}

// ------- UI refs -------
const statusEl = document.getElementById('status');
const loginBtn = document.getElementById('loginBtn');
const playBtn = document.getElementById('playBtn');
const revealBtn = document.getElementById('revealBtn');
const nextBtn = document.getElementById('nextBtn');
const timerEl = document.getElementById('timer');
const revealBox = document.getElementById('reveal');
const titleEl = document.getElementById('title');
const yearEl  = document.getElementById('year');

// ------- Helpers -------
function setStatus(msg){ statusEl.textContent = msg; }
function enable(el, on=true){ el.disabled = !on; }

// OAuth step 1: redirect to /api/login
loginBtn.addEventListener('click', () => {
  const ret = window.location.href; // on revient ici après OAuth
  window.location.replace(`${API_BASE}/api/login?redirect_uri=${encodeURIComponent(ret)}`);
});

// After OAuth callback, our backend will redirect back to this page with ?token=...
const tokenFromHash = new URLSearchParams(window.location.search).get('token');
if (tokenFromHash) {
  accessToken = tokenFromHash;
  if (storage) {
    storage.setItem(STORAGE_TOKEN_KEY, accessToken);
  }
  const currentUrl = (typeof window !== 'undefined' && typeof window.URL !== 'undefined')
    ? new window.URL(window.location.href)
    : null;
  if (currentUrl) {
    currentUrl.searchParams.delete('token');
    window.history.replaceState({}, document.title, currentUrl.toString());
  }
  setStatus('Authenticated with Spotify.');
  enable(playBtn, true);
  enable(revealBtn, true);
  enable(nextBtn, true);
} else {
  const storedToken = storage ? storage.getItem(STORAGE_TOKEN_KEY) : null;
  if (storedToken) {
    accessToken = storedToken;
    setStatus('Session Spotify restaurée.');
    enable(playBtn, true);
    enable(revealBtn, true);
    enable(nextBtn, true);
  }
}

function broadcastUri(uri) {
  if (!uri) return;
  if (trackChannel) {
    try {
      trackChannel.postMessage({ type: 'uri', uri });
    } catch (err) {
      console.warn('Unable to broadcast track via channel', err);
    }
  }
}

function setCurrentUri(uri, { source = 'direct', announce = true } = {}) {
  if (!uri) return;
  if (source !== 'direct' && uri === currentUri) {
    return;
  }
  currentUri = uri;
  if (source !== 'storage') {
    if (storage) {
      storage.setItem(STORAGE_URI_KEY, currentUri);
    }
  }
  if (source !== 'broadcast') {
    broadcastUri(currentUri);
  }
  revealBox.hidden = true;
  titleEl.textContent = '';
  yearEl.textContent = '';
  if (announce) {
    setStatus('Titre prêt. Appuyez sur Play quand vous êtes prêts.');
  }
}

if (currentUri) {
  setCurrentUri(currentUri, { source: 'direct' });
} else {
  const storedUri = storage ? storage.getItem(STORAGE_URI_KEY) : null;
  if (storedUri) {
    setCurrentUri(storedUri, { source: 'storage', announce: false });
  }
}

if (trackChannel) {
  trackChannel.onmessage = (event) => {
    if (event?.data?.type === 'uri' && event.data.uri) {
      setCurrentUri(event.data.uri, { source: 'broadcast' });
    }
  };
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_URI_KEY && event.newValue) {
      setCurrentUri(event.newValue, { source: 'storage' });
    }
  });
}

// Initialize Spotify Web Playback SDK
window.onSpotifyWebPlaybackSDKReady = () => {
  setStatus('Spotify SDK loaded.');
  if (!accessToken) {
    setStatus('Spotify SDK loaded. Please login.');
    return;
  }
  player = new Spotify.Player({
    name: 'Hitster Geek Player',
    getOAuthToken: cb => cb(accessToken),
    volume: 0.8
  });

  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    setStatus('Player ready. Device: ' + device_id);
  });

  player.addListener('initialization_error', ({ message }) => setStatus('Init error: ' + message));
  player.addListener('authentication_error', ({ message }) => {
    setStatus('Auth error: ' + message + '. Merci de vous reconnecter.');
    if (storage) {
      storage.removeItem(STORAGE_TOKEN_KEY);
    }
    accessToken = null;
    enable(playBtn, false);
    enable(revealBtn, false);
    enable(nextBtn, false);
  });
  player.addListener('account_error', ({ message }) => setStatus('Account error: ' + message));

  player.connect();
};

// Play the currentUri for 30s with hidden UI
playBtn.addEventListener('click', async () => {
  if (!accessToken || !deviceId) {
    setStatus('Login and wait for player ready.');
    return;
  }
  if (!currentUri) {
    setStatus('No track URI (?t=spotify:track:...)');
    return;
  }
  if (player && typeof player.activateElement === 'function' && !playerActivated) {
    try {
      await player.activateElement();
      if (typeof player.setVolume === 'function') {
        await player.setVolume(0.9);
      }
      playerActivated = true;
    } catch (err) {
      console.error('Failed to activate Spotify player element', err);
      setStatus('Tap allow audio to enable playback on this device.');
      return;
    }
  } else if (player && typeof player.setVolume === 'function') {
    await player.setVolume(0.9);
  }
  setStatus('Playing...');
  // Transfer playback to this device and start URI
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type':'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false })
  });

  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type':'application/json' },
    body: JSON.stringify({ uris: [currentUri] })
  });

  // Start countdown (30s)
  countdown = 30;
  timerEl.textContent = countdown;
  clearInterval(timerHandle);
  timerHandle = setInterval(async () => {
    countdown -= 1;
    timerEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(timerHandle);
      // Pause after 30s
      await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + accessToken }
      });
      setStatus('Stopped.');
    }
  }, 1000);
});

// Reveal from local mapping (no Spotify metadata shown before)
revealBtn.addEventListener('click', async () => {
  revealBox.hidden = false;
  const map = await fetch(TRACKS_JSON).then(r => r.json()).catch(() => ({}));
  const meta = map[currentUri] || null;
  if (meta) {
    titleEl.textContent = meta.title;
    yearEl.textContent = meta.year;
  } else {
    titleEl.textContent = 'Unknown track';
    yearEl.textContent = '';
  }
});

// Optional: Next track via URL param substitution (for your QR list)
nextBtn.addEventListener('click', () => {
  // Implement your own rotation logic or just show a message
  setStatus('Scan the next QR code!');
});
