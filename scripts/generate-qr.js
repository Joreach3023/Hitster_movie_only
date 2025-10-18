#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const tracksPath = path.resolve(__dirname, '..', 'tracks.json');
const outputDir = path.resolve(__dirname, '..', 'qr-codes');

const argBase = process.argv[2];
const envBase = process.env.HITSTER_QR_BASE;
const baseUrl = (argBase || envBase || 'https://your-github-username.github.io/hitster-geek/').trim();

function ensureTracks() {
  if (!fs.existsSync(tracksPath)) {
    throw new Error(`tracks.json introuvable à l'emplacement ${tracksPath}`);
  }
  const raw = fs.readFileSync(tracksPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Impossible de parser tracks.json : ${err.message}`);
  }
}

function buildUrl(base, uri) {
  if (!base) {
    throw new Error('Base URL manquante pour générer les QR codes.');
  }
  try {
    const url = new URL(base);
    url.searchParams.set('t', uri);
    return url.toString();
  } catch (err) {
    const separator = base.includes('?') ? '' : (base.endsWith('?') ? '' : '?t=');
    return `${base}${separator}${encodeURIComponent(uri)}`;
  }
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'track';
}

async function generate() {
  const tracks = ensureTracks();
  fs.mkdirSync(outputDir, { recursive: true });

  const entries = Object.entries(tracks);
  if (!entries.length) {
    console.log('Aucun morceau dans tracks.json, rien à générer.');
    return;
  }

  let index = 0;
  for (const [uri, meta] of entries) {
    index += 1;
    const target = buildUrl(baseUrl, uri);
    const prefix = String(index).padStart(3, '0');
    const label = meta && meta.title ? slugify(meta.title) : slugify(uri);
    const filename = `${prefix}-${label}.png`;
    const filepath = path.join(outputDir, filename);
    await QRCode.toFile(filepath, target, {
      type: 'png',
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'H'
    });
    console.log(`✅ ${filename} → ${target}`);
  }

  console.log(`\nQR codes générés dans ${outputDir}`);
  console.log('Utilisez `node scripts/generate-qr.js <URL-de-base>` pour personnaliser le lien.');
}

generate().catch(err => {
  console.error('❌ Erreur lors de la génération des QR codes');
  console.error(err.message);
  process.exit(1);
});
