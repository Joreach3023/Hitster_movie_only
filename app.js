// ------- Config -------
const API_BASE = 'https://hitster-jordan-oexi.vercel.app';
const TRACKS_JSON = './tracks.json';
const FULL_PLAYBACK_STORAGE_KEY = 'hitster_full_playback';

// ------- State -------
let accessToken = null;
let deviceId = null;
let player = null;
let playerActivated = false;
let currentUri = null;
let countdown = 30;
let timerHandle = null;
let tracksCache = null;
let tracksIndex = null;
let sdkReady = false;
let fullTrackMode = false;
let playbackQueue = Promise.resolve();

// ------- UI refs -------
const statusEl = document.getElementById('status');
const loginBtn = document.getElementById('loginBtn');
const playBtn = document.getElementById('playBtn');
const revealBtn = document.getElementById('revealBtn');
const nextBtn = document.getElementById('nextBtn');
const timerEl = document.getElementById('timer');
const revealBox = document.getElementById('reveal');
const titleEl = document.getElementById('title');
const yearEl = document.getElementById('year');
const fullTrackToggle = document.getElementById('fullTrackToggle');

const openScannerBtn = document.getElementById('openScannerBtn');
const closeScannerBtn = document.getElementById('closeScannerBtn');
const scannerPane = document.getElementById('scannerPane');
const qrVideo = document.getElementById('qrVideo');
const qrCanvas = document.getElementById('qrCanvas');
const scannerStatus = document.getElementById('scannerStatus');

let mediaStream = null;
let scanRunning = false;

// ------- Helpers -------
function setStatus(msg) {
  if (statusEl) {
    statusEl.textContent = msg;
  }
}

function enable(el, on = true) {
  if (el) {
    el.disabled = !on;
  }
}

function normalizeToUri(value) {
  if (!value) return null;
  const text = value.trim();
  if (text.startsWith('spotify:track:')) {
    return text;
  }
  const match = text.match(/^https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]+)(?:\?.*)?$/i);
  if (match) {
    return `spotify:track:${match[1]}`;
  }
  return null;
}

function getUrlConstructor() {
  if (typeof window !== 'undefined' && window.URL) {
    return window.URL;
  }
  if (typeof URL !== 'undefined') {
    return URL;
  }
  return null;
}

async function loadTracks() {
  if (tracksCache) {
    return tracksCache;
  }
  try {
    const data = await fetch(TRACKS_JSON).then(r => r.json());
    tracksCache = data || {};
    tracksIndex = Object.keys(tracksCache);
  } catch (err) {
    console.error('Unable to load tracks.json', err);
    tracksCache = {};
    tracksIndex = [];
  }
  return tracksCache;
}

async function resolveFromId(id) {
  if (!id) return null;
  const needle = id.trim();
  const tracks = await loadTracks();

  if (tracks[needle]) {
    return needle;
  }

  for (const [uri, meta] of Object.entries(tracks)) {
    if (!meta) continue;
    if (meta.id === needle || meta.code === needle || meta.shortId === needle) {
      return uri;
    }
  }

  const numeric = parseInt(needle, 10);
  if (!Number.isNaN(numeric) && numeric > 0) {
    if (!tracksIndex) {
      tracksIndex = Object.keys(tracks);
    }
    if (numeric <= tracksIndex.length) {
      return tracksIndex[numeric - 1];
    }
  }

  if (/^0+\d+$/.test(needle)) {
    const stripped = needle.replace(/^0+/, '');
    const num = parseInt(stripped, 10);
    if (!Number.isNaN(num) && num > 0 && tracksIndex && num <= tracksIndex.length) {
      return tracksIndex[num - 1];
    }
  }

  return null;
}

function beginCountdown() {
  clearInterval(timerHandle);
  timerHandle = null;
  if (fullTrackMode) {
    syncTimerDisplay();
    return;
  }
  countdown = 30;
  syncTimerDisplay();
  timerHandle = setInterval(async () => {
    countdown -= 1;
    syncTimerDisplay();
    if (countdown <= 0) {
      clearInterval(timerHandle);
      timerHandle = null;
      try {
        if (deviceId && accessToken) {
          await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
            method: 'PUT',
            headers: { Authorization: 'Bearer ' + accessToken }
          });
        }
      } catch (err) {
        console.error('Failed to pause after countdown', err);
      }
      setStatus('Stopped.');
    }
  }, 1000);
}

function syncTimerDisplay() {
  if (!timerEl) {
    return;
  }
  timerEl.textContent = fullTrackMode ? '∞' : countdown;
}

function setFullTrackMode(enabled, { persist = false } = {}) {
  const desired = Boolean(enabled);
  fullTrackMode = desired;
  if (fullTrackToggle) {
    fullTrackToggle.checked = desired;
  }
  if (desired) {
    clearInterval(timerHandle);
    timerHandle = null;
  } else if (!Number.isFinite(countdown) || countdown <= 0) {
    countdown = 30;
  }
  syncTimerDisplay();
  if (persist) {
    try {
      localStorage.setItem(FULL_PLAYBACK_STORAGE_KEY, desired ? '1' : '0');
    } catch (err) {
      console.warn('Unable to persist playback mode', err);
    }
  }
}

function restoreFullTrackMode() {
  let preferred = fullTrackToggle ? fullTrackToggle.checked : false;
  try {
    const stored = localStorage.getItem(FULL_PLAYBACK_STORAGE_KEY);
    if (stored === '1') {
      preferred = true;
    } else if (stored === '0') {
      preferred = false;
    }
  } catch (err) {
    console.warn('Unable to read playback mode preference', err);
  }
  setFullTrackMode(preferred);
}

async function transferPlaybackToSdk() {
  if (!accessToken || !deviceId) {
    throw new Error('Login and wait for player ready.');
  }
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false })
  });
  if (res && res.ok === false) {
    throw new Error('Transfert Spotify impossible (' + res.status + ')');
  }
}

async function startTrack(uri) {
  if (!uri) {
    throw new Error('No track URI provided.');
  }
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: [uri] })
  });
  if (res && res.ok === false) {
    let detail = '';
    try {
      const payload = await res.json();
      if (payload && payload.error && payload.error.message) {
        detail = `: ${payload.error.message}`;
      }
    } catch (_) {
      // ignore JSON parse errors
    }
    throw new Error('Lecture Spotify impossible' + detail);
  }
}

async function startAfterEnsureDevice() {
  if (!accessToken || !deviceId) {
    const err = new Error('Login and wait for player ready.');
    setStatus(err.message);
    throw err;
  }
  if (!currentUri) {
    const err = new Error('No track URI selected.');
    setStatus(err.message);
    throw err;
  }

  try {
    if (player && typeof player.activateElement === 'function' && !playerActivated) {
      await player.activateElement();
      if (typeof player.setVolume === 'function') {
        await player.setVolume(0.9);
      }
      playerActivated = true;
    } else if (player && typeof player.setVolume === 'function') {
      await player.setVolume(0.9);
    }

    await transferPlaybackToSdk();
    await startTrack(currentUri);
    setStatus('Playing...');
  } catch (error) {
    console.error('Playback failed', error);
    if (error && error.message === 'Activation blocked') {
      setStatus('Tap allow audio to enable playback on this device.');
    } else {
      setStatus('Erreur de lecture: ' + (error?.message || error));
    }
    throw error;
  }
}

async function runPlaybackSequence() {
  try {
    await startAfterEnsureDevice();
    beginCountdown();
  } catch (err) {
    console.error('Play button failed', err);
    throw err;
  }
}

function normalizeToUriOrId(text) {
  try {
    if (!text) {
      return { type: 'raw', value: text };
    }
    // URLs first
    if (/^https?:\/\//i.test(text)) {
      const UrlCtor = getUrlConstructor();
      if (!UrlCtor) {
        return { type: 'raw', value: text };
      }
      const u = new UrlCtor(text);
      const t = u.searchParams.get('t');
      const id = u.searchParams.get('id');
      if (t) {
        const uri = normalizeToUri(t);
        if (uri) return { type: 'uri', value: uri };
      }
      if (id) {
        return { type: 'id', value: id };
      }
      const m = text.match(/^https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]+)(?:\?.*)?$/);
      if (m) return { type: 'uri', value: `spotify:track:${m[1]}` };
      return { type: 'raw', value: text };
    }

    if (text.startsWith('spotify:track:')) {
      return { type: 'uri', value: text };
    }

    if (/^\d{1,4}$/.test(text)) {
      return { type: 'id', value: text };
    }

    return { type: 'raw', value: text };
  } catch (_) {
    return { type: 'raw', value: text };
  }
}

async function playFromScan(parsed) {
  if (parsed.type === 'uri') {
    currentUri = parsed.value;
    const UrlCtor = getUrlConstructor();
    if (UrlCtor) {
      const url = new UrlCtor(window.location.href);
      url.searchParams.delete('id');
      url.searchParams.set('t', parsed.value);
      if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', url.toString());
      }
    }
    try {
      await startAfterEnsureDevice();
      beginCountdown();
    } catch (_) {
      // status already handled
    }
    return;
  }
  if (parsed.type === 'id') {
    const uri = await resolveFromId(parsed.value);
    if (uri) {
      currentUri = uri;
      const UrlCtor = getUrlConstructor();
      if (UrlCtor) {
        const url = new UrlCtor(window.location.href);
        url.searchParams.delete('t');
        url.searchParams.set('id', parsed.value);
        if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState(null, '', url.toString());
        }
      }
      try {
        await startAfterEnsureDevice();
        beginCountdown();
      } catch (_) {
        // status already handled
      }
    } else {
      setStatus(`ID ${parsed.value} introuvable dans tracks.json`);
      if (scannerStatus) {
        scannerStatus.textContent = `ID ${parsed.value} introuvable.`;
      }
    }
    return;
  }
  setStatus('QR non reconnu.');
  if (scannerStatus) {
    scannerStatus.textContent = 'QR non reconnu.';
  }
}

function stopScanner() {
  scanRunning = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (qrVideo) {
    qrVideo.pause();
    qrVideo.srcObject = null;
  }
}

function scanLoop() {
  if (!scanRunning) return;
  const w = qrVideo.videoWidth;
  const h = qrVideo.videoHeight;
  if (!w || !h) {
    requestAnimationFrame(scanLoop);
    return;
  }
  qrCanvas.width = w;
  qrCanvas.height = h;
  const ctx = qrCanvas.getContext('2d');
  ctx.drawImage(qrVideo, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  if (typeof jsQR !== 'function') {
    scannerStatus.textContent = 'Bibliothèque jsQR indisponible.';
    stopScanner();
    return;
  }
  const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
  if (code && code.data) {
    scanRunning = false;
    scannerStatus.textContent = 'QR détecté !';
    stopScanner();
    const parsed = normalizeToUriOrId(code.data.trim());
    playFromScan(parsed);
    scannerPane.hidden = true;
  } else {
    requestAnimationFrame(scanLoop);
  }
}

function attemptSetupPlayer() {
  if (!sdkReady || !accessToken || player) {
    if (sdkReady && !accessToken) {
      setStatus('Spotify SDK loaded. Please login.');
    }
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

  player.addListener('not_ready', ({ device_id }) => {
    if (deviceId === device_id) {
      deviceId = null;
      playerActivated = false;
    }
    setStatus('Player not ready.');
  });

  player.addListener('initialization_error', ({ message }) => setStatus('Init error: ' + message));
  player.addListener('authentication_error', ({ message }) => setStatus('Auth error: ' + message));
  player.addListener('account_error', ({ message }) => setStatus('Account error: ' + message));

  player.connect();
}

function applyAccessToken(token) {
  accessToken = token;
  try {
    localStorage.setItem('spotify_token', token);
  } catch (err) {
    console.warn('Unable to persist Spotify token', err);
  }
  enable(playBtn, true);
  enable(revealBtn, true);
  enable(nextBtn, true);
  setStatus('Authenticated with Spotify.');
  attemptSetupPlayer();
}

function restoreStoredToken() {
  try {
    const stored = localStorage.getItem('spotify_token');
    if (stored) {
      applyAccessToken(stored);
    }
  } catch (err) {
    console.warn('Unable to read stored Spotify token', err);
  }
}

// ------- Query params -------
const qs = new URLSearchParams(window.location.search);
const paramUri = qs.get('t');
const paramId = qs.get('id');
if (paramUri) {
  const normalized = normalizeToUri(paramUri) || paramUri;
  currentUri = normalized;
}

if (paramId) {
  resolveFromId(paramId).then(uri => {
    if (uri) {
      currentUri = uri;
    } else {
      setStatus(`ID ${paramId} introuvable dans tracks.json`);
    }
  });
}

// ------- Token bootstrap -------
restoreStoredToken();
restoreFullTrackMode();
const tokenFromHash = new URLSearchParams(window.location.search).get('token');
if (tokenFromHash) {
  applyAccessToken(tokenFromHash);
  const UrlCtor = getUrlConstructor();
  if (UrlCtor) {
    const url = new UrlCtor(window.location.href);
    url.searchParams.delete('token');
    if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', url.toString());
    }
  }
}

// ------- OAuth step 1: redirect to /api/login -------
loginBtn.addEventListener('click', () => {
  const ret = window.location.href;
  window.location.href = `${API_BASE}/api/login?redirect_uri=${encodeURIComponent(ret)}`;
});

// ------- Spotify SDK Ready -------
window.onSpotifyWebPlaybackSDKReady = () => {
  sdkReady = true;
  setStatus('Spotify SDK loaded.');
  attemptSetupPlayer();
};

// ------- Play button -------
playBtn.addEventListener('click', () => {
  playbackQueue = playbackQueue
    .catch(() => {})
    .then(() => runPlaybackSequence());
  playbackQueue.catch(() => {});
});

fullTrackToggle?.addEventListener('change', () => {
  setFullTrackMode(fullTrackToggle.checked, { persist: true });
});

// ------- Reveal button -------
revealBtn.addEventListener('click', async () => {
  revealBox.hidden = false;
  if (!currentUri) {
    titleEl.textContent = 'No track selected';
    yearEl.textContent = '';
    return;
  }
  const map = await loadTracks();
  const meta = map[currentUri] || null;
  if (meta) {
    titleEl.textContent = meta.title || 'Unknown track';
    yearEl.textContent = meta.year || '';
  } else {
    titleEl.textContent = 'Unknown track';
    yearEl.textContent = '';
  }
});

// ------- Next button -------
nextBtn.addEventListener('click', () => {
  setStatus('Scan the next QR code!');
});

// ------- Scanner controls -------
openScannerBtn?.addEventListener('click', async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    scannerStatus.textContent = 'Caméra indisponible sur cet appareil.';
    return;
  }
  if (typeof jsQR !== 'function') {
    scannerStatus.textContent = 'Bibliothèque jsQR indisponible.';
    return;
  }
  try {
    scannerPane.hidden = false;
    scannerStatus.textContent = 'Ouverture de la caméra…';
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    qrVideo.srcObject = mediaStream;
    await qrVideo.play();
    scanRunning = true;
    scannerStatus.textContent = 'Scanne un QR…';
    scanLoop();
  } catch (err) {
    console.error('Unable to open camera', err);
    scannerStatus.textContent = 'Permission caméra refusée ou indisponible.';
    stopScanner();
  }
});

closeScannerBtn?.addEventListener('click', () => {
  stopScanner();
  scannerPane.hidden = true;
  scannerStatus.textContent = 'Caméra fermée';
});
