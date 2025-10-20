## 🔊 Lecture côté serveur (mode DJ, sans login du scanneur)

Ce mode permet à **toute personne qui scanne une carte** de déclencher la lecture **sur le compte Spotify du DJ** (ton compte), **sans** que la personne ait à se connecter.  
Techniquement, on appelle des **routes API Vercel** qui utilisent un **refresh token** Spotify pour contrôler la lecture.

### 📁 Fichiers d’API à créer (dans la racine du repo)

Créer le dossier `api/` avec ces fichiers :

- `api/login.js` – lance l’auth Spotify (one-time, pour récupérer le refresh token)
- `api/callback.js` – reçoit `code` → échange contre `access_token` + `refresh_token`
- `api/devices.js` – liste les appareils disponibles (pour choisir un `device_id`)
- `api/play.js` – **endpoint appelé par le QR** (joue `spotify:track:<ID>` sur ton appareil)

> Voir le code dans ce repo (section `api/`). Si tu ne les vois pas sur ta branche, crée-les via **Add file → Create new file** sur GitHub et colle le contenu fourni.

---

### 🌱 Variables d’environnement (Vercel → Project → Settings → Environment Variables)

| Nom                       | Valeur / Exemple                                             | Obligatoire |
|--------------------------|---------------------------------------------------------------|-------------|
| `SPOTIFY_CLIENT_ID`      | depuis le **Spotify Developer Dashboard**                    | ✅          |
| `SPOTIFY_CLIENT_SECRET`  | depuis le **Spotify Developer Dashboard**                    | ✅          |
| `SPOTIFY_REDIRECT_URI`   | `https://<TON-PROJET>.vercel.app/api/callback`               | ✅          |
| `SPOTIFY_REFRESH_TOKEN`  | (à récupérer avec le flow ci-dessous)                        | ✅          |
| `SPOTIFY_DEVICE_ID`      | `xxxxxxxxxxxxxxxxxxxxxxx` (id de l’appareil DJ par défaut)   | ➕ conseillé |
| `SPOTIFY_MARKET`         | `CA` *(ou `US`, etc. — utile pour certaines régions)*        | ➖ optionnel |

Remplace `<TON-PROJET>` par le nom réel de ton projet (ex. `hitster-jordan`).  
Exemple : `https://hitster-jordan.vercel.app/api/callback`.

---

### 🔐 Obtenir le `SPOTIFY_REFRESH_TOKEN` (one-time)

> À faire **une seule fois**, connecté sur **TON compte DJ** dans le navigateur.

1. Déploie le projet sur Vercel (les fichiers `/api/*.js` doivent exister).
2. Ouvre `https://<TON-PROJET>.vercel.app/api/login`  
   → accepte les permissions Spotify (scopes lecture/contrôle).
3. Spotify redirige vers `.../api/callback` et **affiche** le `refresh_token`.
4. Copie la valeur → ajoute-la dans Vercel (`SPOTIFY_REFRESH_TOKEN`) → redeploie.

---

### 🎛️ Choisir l’appareil (device) de lecture

1. Lance Spotify sur l’appareil DJ (téléphone/PC/enceinte).
2. Ouvre `https://<TON-PROJET>.vercel.app/api/devices` → récupère l’`id` du bon device.
3. Mets cet `id` dans `SPOTIFY_DEVICE_ID` (Vercel env) → redeploie.  
   *(Sinon, tu pourras passer `&device_id=...` dans l’URL du QR.)*

> **Important** : Spotify exige qu’au moins **un appareil soit “actif”** (ou récemment actif). Ouvre l’app Spotify sur l’appareil DJ avant les tests.

---

### 🧿 Format des QR Codes (à imprimer sur les cartes)

Encode l’URL suivante dans tes QR :

