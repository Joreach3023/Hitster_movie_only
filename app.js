// ------- Config -------
const API_BASE = 'https://hitster-jordan-oexi.vercel.app'; // ex: https://hitster-geek.vercel.app
const TRACKS_JSON = './tracks.json'; // mapping { "spotify:track:...": {title, year} }

// ------- State -------
const TOKEN_STORAGE_KEY = 'spotify_access_token';

const storage = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (err) {
    // localStorage unavailable (server-side / private mode)
  }
  return null;
})();

let accessToken = null;
let deviceId = null;
let player = null;
let playerActivated = false;
let currentUri = null;
let countdown = 30;
let timerHandle = null;

const qs = new URLSearchParams(location.search);
const paramUri = qs.get('t'); // spotify:track:...
if (paramUri) currentUri = decodeURIComponent(paramUri);

// ------- UI refs -------
const statusEl = document.getElementById('status');
const loginBtn = document.getElementById('loginBtn');
const playBtn = document.getElementById('playBtn');
const revealBtn = document.getElementById('revealBtn');
const timerEl = document.getElementById('timer');
const revealBox = document.getElementById('reveal');
const titleEl = document.getElementById('title');
const yearEl  = document.getElementById('year');
const scanToggleBtn = document.getElementById('scanToggleBtn');
const scanArea = document.getElementById('scanArea');
const scanVideo = document.getElementById('scanVideo');
const scanStatusEl = document.getElementById('scanStatus');

// ------- Helpers -------
function setStatus(msg){ statusEl.textContent = msg; }
function enable(el, on=true){ el.disabled = !on; }

function updateTrackQueryParam(uri) {
  const params = new URLSearchParams(window.location.search);
  if (uri) {
    params.set('t', uri);
  } else {
    params.delete('t');
  }
  const qsStr = params.toString();
  const newUrl = `${window.location.pathname}${qsStr ? `?${qsStr}` : ''}`;
  window.history.replaceState({}, document.title, newUrl);
}

function applyScannedTrack(uri) {
  currentUri = uri;
  updateTrackQueryParam(currentUri);
  if (revealBox) {
    revealBox.hidden = true;
  }
  clearInterval(timerHandle);
  timerHandle = null;
  countdown = 30;
  if (timerEl) {
    timerEl.textContent = countdown;
  }
  if (accessToken && playBtn) {
    enable(playBtn, true);
  }
  if (revealBtn && accessToken) {
    enable(revealBtn, true);
  }
  const message = accessToken ? 'QR scanné. Appuyez sur Play pour écouter.' : 'QR scanné. Connectez-vous pour écouter.';
  setStatus(message);
}

function extractTrackUri(value) {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  if (text.startsWith('spotify:track:')) {
    return text;
  }
  try {
    const maybeUrl = new URL(text);
    const viaParam = maybeUrl.searchParams.get('t');
    if (viaParam) {
      return decodeURIComponent(viaParam);
    }
  } catch (err) {
    // not an URL, ignore
  }
  const match = text.match(/spotify:track:[A-Za-z0-9]+/);
  if (match) {
    return match[0];
  }
  return null;
}

// OAuth step 1: redirect to /api/login
loginBtn.addEventListener('click', () => {
  const ret = window.location.href; // on revient ici après OAuth
  window.location.href = `${API_BASE}/api/login?redirect_uri=${encodeURIComponent(ret)}`;
});

// After OAuth callback, our backend will redirect back to this page with ?token=...
const urlParams = new URLSearchParams(window.location.search);
const tokenFromHash = urlParams.get('token');
if (tokenFromHash) {
  accessToken = tokenFromHash;
  if (storage) {
    storage.setItem(TOKEN_STORAGE_KEY, accessToken);
  }
  urlParams.delete('token');
  const newUrl = `${window.location.pathname}?${urlParams.toString()}`.replace(/[?&]$/, '');
  window.history.replaceState({}, document.title, newUrl);
}

if (!accessToken) {
  if (storage) {
    const storedToken = storage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      accessToken = storedToken;
    }
  }
}

if (accessToken) {
  setStatus('Authenticated with Spotify.');
  enable(playBtn, true);
  enable(revealBtn, true);
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
    setStatus('Auth error: ' + message);
    if (storage) {
      storage.removeItem(TOKEN_STORAGE_KEY);
    }
    accessToken = null;
    enable(playBtn, false);
    enable(revealBtn, false);
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

if (scanToggleBtn && scanArea && scanVideo && scanStatusEl) {
  const scanCanvas = document.createElement('canvas');
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
  let scanStream = null;
  let scanningActive = false;

  const resetScannerMessage = () => {
    scanStatusEl.textContent = 'Cadrez le QR Hitster dans le cadre.';
  };

  const updateScanButton = () => {
    if (!scanToggleBtn) return;
    scanToggleBtn.textContent = scanningActive ? 'Arrêter le scanner' : 'Activer le scanner';
  };

  const stopScanner = (hideArea = true) => {
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop());
      scanStream = null;
    }
    scanningActive = false;
    if (scanVideo) {
      scanVideo.srcObject = null;
    }
    if (scanArea) {
      scanArea.hidden = !!hideArea;
    }
    if (scanToggleBtn) {
      scanToggleBtn.disabled = false;
    }
    updateScanButton();
  };

  const scanLoop = () => {
    if (!scanningActive) {
      return;
    }
    if (!scanCtx) {
      stopScanner(false);
      scanStatusEl.textContent = 'Scanner indisponible sur ce périphérique.';
      return;
    }
    if (!window.jsQR) {
      scanStatusEl.textContent = 'Lecteur QR indisponible sur ce navigateur.';
      stopScanner(false);
      return;
    }
    if (scanVideo.readyState === scanVideo.HAVE_ENOUGH_DATA) {
      scanCanvas.width = scanVideo.videoWidth;
      scanCanvas.height = scanVideo.videoHeight;
      scanCtx.drawImage(scanVideo, 0, 0, scanCanvas.width, scanCanvas.height);
      const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      const result = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (result && result.data) {
        const uri = extractTrackUri(result.data);
        if (uri) {
          stopScanner();
          applyScannedTrack(uri);
          return;
        }
        scanStatusEl.textContent = 'QR non reconnu. Réessayez.';
      }
    }
    requestAnimationFrame(scanLoop);
  };

  const startScanner = async () => {
    if (scanningActive) {
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      scanArea.hidden = false;
      scanStatusEl.textContent = 'Caméra non disponible sur ce navigateur.';
      return;
    }
    if (!scanCtx) {
      scanArea.hidden = false;
      scanStatusEl.textContent = 'Scanner indisponible sur ce périphérique.';
      return;
    }
    try {
      scanToggleBtn.disabled = true;
      scanArea.hidden = false;
      scanStatusEl.textContent = 'Initialisation du scanner...';
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      scanStream = stream;
      scanVideo.srcObject = stream;
      scanVideo.setAttribute('playsinline', 'true');
      scanVideo.muted = true;
      await scanVideo.play();
      scanningActive = true;
      scanToggleBtn.disabled = false;
      resetScannerMessage();
      updateScanButton();
      requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error('Failed to start scanner', err);
      scanToggleBtn.disabled = false;
      scanArea.hidden = false;
      scanStatusEl.textContent = 'Accès caméra refusé ou indisponible.';
      stopScanner(false);
      setStatus('Autorisez la caméra pour scanner des QR.');
    }
  };

  scanToggleBtn.addEventListener('click', () => {
    if (scanningActive) {
      stopScanner();
    } else {
      startScanner();
    }
  });

  window.addEventListener('pagehide', () => {
    if (scanningActive) {
      stopScanner();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && scanningActive) {
      stopScanner();
    }
  });

  updateScanButton();
}

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

