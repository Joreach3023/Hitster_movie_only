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
let scannerStream = null;
let scanLoopHandle = null;
let barcodeDetector = null;

const qs = new URLSearchParams(location.search);
const paramUri = qs.get('t'); // spotify:track:...
if (paramUri) currentUri = decodeURIComponent(paramUri);

// ------- UI refs -------
const statusEl = document.getElementById('status');
const loginBtn = document.getElementById('loginBtn');
const playBtn = document.getElementById('playBtn');
const revealBtn = document.getElementById('revealBtn');
const nextBtn = document.getElementById('nextBtn');
const scanBtn = document.getElementById('scanBtn');
const timerEl = document.getElementById('timer');
const revealBox = document.getElementById('reveal');
const titleEl = document.getElementById('title');
const yearEl  = document.getElementById('year');
const scannerOverlay = document.getElementById('scannerOverlay');
const scannerVideo = document.getElementById('scannerVideo');
const closeScannerBtn = document.getElementById('closeScannerBtn');

// ------- Helpers -------
function setStatus(msg){ statusEl.textContent = msg; }
function enable(el, on=true){ el.disabled = !on; }

// OAuth step 1: redirect to /api/login
loginBtn.addEventListener('click', () => {
  const ret = window.location.href; // on revient ici après OAuth
  window.location.href = `${API_BASE}/api/login?redirect_uri=${encodeURIComponent(ret)}`;
});

// After OAuth callback, our backend will redirect back to this page with ?token=...
const tokenFromHash = new URLSearchParams(window.location.search).get('token');
if (tokenFromHash) {
  accessToken = tokenFromHash;
  setStatus('Authenticated with Spotify.');
  enable(playBtn, true);
  enable(revealBtn, true);
  enable(nextBtn, true);
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
  player.addListener('authentication_error', ({ message }) => setStatus('Auth error: ' + message));
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

if (scanBtn) {
  scanBtn.addEventListener('click', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Votre navigateur ne supporte pas l\'accès caméra pour le scan.');
      return;
    }
    await openScanner();
  });
}

if (closeScannerBtn) {
  closeScannerBtn.addEventListener('click', () => {
    stopScanner();
    setStatus('Scanner fermé.');
  });
}

async function openScanner(){
  if (!scannerOverlay || !scannerVideo) {
    setStatus('Scanner indisponible sur cet appareil.');
    return;
  }
  try {
    if (!scannerStream) {
      scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    }
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play().catch(() => {});
    scannerOverlay.hidden = false;
    if (document && document.body) {
      document.body.style.overflow = 'hidden';
    }
    setStatus('Scanner actif. Cadrez votre QR Hitster Geek.');

    if ('BarcodeDetector' in window) {
      barcodeDetector = barcodeDetector || new window.BarcodeDetector({ formats: ['qr_code'] });
      startScanLoop();
    } else {
      setStatus('Scanner actif. Scannez et le lien s\'ouvrira automatiquement (nécessite support navigateur).');
    }
  } catch (err) {
    console.error('Unable to start scanner', err);
    setStatus('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
    stopScanner();
  }
}

function startScanLoop(){
  if (!barcodeDetector) return;
  const detect = async () => {
    if (scannerVideo.readyState >= 2) {
      try {
        const barcodes = await barcodeDetector.detect(scannerVideo);
        if (barcodes && barcodes.length) {
          const value = barcodes[0].rawValue || barcodes[0].rawData || '';
          if (value) {
            stopScanner();
            setStatus('QR détecté. Chargement...');
            window.location.href = value;
            return;
          }
        }
      } catch (err) {
        console.warn('Barcode detection failed', err);
      }
    }
    scanLoopHandle = requestAnimationFrame(detect);
  };
  cancelAnimationFrame(scanLoopHandle);
  scanLoopHandle = requestAnimationFrame(detect);
}

function stopScanner(){
  if (scannerOverlay) {
    scannerOverlay.hidden = true;
  }
  if (document && document.body) {
    document.body.style.overflow = '';
  }
  if (scanLoopHandle) {
    cancelAnimationFrame(scanLoopHandle);
    scanLoopHandle = null;
  }
  if (scannerVideo) {
    scannerVideo.pause();
    scannerVideo.srcObject = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
}
