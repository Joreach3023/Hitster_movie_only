# 🎵 Hitster_jordan

Projet de cartes Hitster personnalisées (films, jeux vidéo, musiques).  
Chaque carte contient un **QR code Spotify** qui permet de lancer la chanson associée.

---

## ⚙️ Fonctionnement de base

Le projet génère des fichiers PDF contenant des cartes (recto-verso) avec :
- un QR code unique pour chaque chanson ou soundtrack,
- un design thématique (Geek / Film / Jeu vidéo),
- et des informations associées (titre, année, catégorie, etc.).

Les QR redirigent vers une URL qui déclenche la lecture sur Spotify.  
Tu peux générer automatiquement les cartes via le script Python fourni ou à partir d’un CSV contenant les titres et URIs Spotify.

---

## 🧩 Structure du projet

```
Hitster_jordan/
├── api/                     # (voir plus bas pour les endpoints serveur)
├── generate_hitster.py      # script principal pour créer les cartes
├── tracks.json              # mapping des chansons (titre, année, uri)
├── outputs_blocks/          # PDFs générés
└── README.md
```

---

## 💾 Exemple d’utilisation du script

```bash
python generate_hitster.py   --csv "Hitster_Geek_Maison_MASTER_180_WITH_URIS.csv"   --base-url "https://hitster-jordan.vercel.app/"   --out "outputs_blocks"   --blocks50
```

Cela crée des pages de 9 cartes (recto et verso) prêtes à imprimer.

---

## 🖨️ Impression

- Format A4 standard, marges d’impression normales.  
- Police : Helvetica Bold, accents cyan ou magenta selon le thème.  
- Design sobre et “collection”.  
- Mode **recto-verso** recommandé (page 1 = recto, page 2 = verso).

---

## 🔊 Lecture côté serveur (mode DJ, sans login du scanneur)

Ce mode permet à **toute personne qui scanne une carte** de déclencher la lecture **sur le compte Spotify du DJ** (ton compte), **sans** que la personne ait à se connecter.  
Techniquement, on appelle des **routes API Vercel** qui utilisent un **refresh token** Spotify pour contrôler la lecture.

---

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

```
https://<TON-PROJET>.vercel.app/api/play?t=spotify:track:<TRACK_ID>
```

Si tu ne configures pas `SPOTIFY_DEVICE_ID` en variable d’env., passe le paramètre à la volée :

```
https://<TON-PROJET>.vercel.app/api/play?t=spotify:track:<TRACK_ID>&device_id=<DEVICE_ID>
```

Exemples avec un projet nommé **hitster-jordan** :

```
https://hitster-jordan.vercel.app/api/play?t=spotify:track:0eGsygTp906u18L0Oimnem
https://hitster-jordan.vercel.app/api/play?t=spotify:track:0eGsygTp906u18L0Oimnem&device_id=XXXXXXXXXXXXXXXXXXXX
```

> **Le scanneur n’a rien à faire** (pas de login) : la lecture est déclenchée sur **ton** appareil DJ.

---

### 🧪 Test rapide

1. Ouvre Spotify sur l’appareil DJ (assure qu’il est sélectionné dans “Disponibles”).
2. Ouvre dans le navigateur :  
   `https://<TON-PROJET>.vercel.app/api/play?t=spotify:track:<TRACK_ID>`
3. La piste doit démarrer sur ton appareil.  
   Si une autre piste joue déjà, elle sera remplacée (voir variante “Queue” ci-dessous).

---

### ➕ Variante “Queue” (facultatif)

Si tu préfères **mettre en file d’attente** sans couper la musique en cours, crée un endpoint `api/queue.js` qui appelle :

- `POST /v1/me/player/queue?uri=spotify:track:<TRACK_ID>`
- puis éventuellement `POST /v1/me/player/next` pour enchaîner

*(Non inclus par défaut pour garder simple, mais facile à ajouter.)*

---

### 🆘 Dépannage

- **`409 No active device`**  
  Lance l’app Spotify sur l’appareil DJ, joue une piste une fois, ou précise `&device_id=...` (et/ou configure `SPOTIFY_DEVICE_ID`).

- **`403 PLAYER_COMMAND_FAILED: No active device found`**  
  Même cause : aucun appareil actif. Vérifie l’étape ci-dessus.

- **Joue sur le mauvais appareil**  
  Récupère l’id du bon device via `/api/devices` et mets-le dans `SPOTIFY_DEVICE_ID`.

- **Piste indisponible (région)**  
  Choisis une autre version de la piste. Optionnel : `SPOTIFY_MARKET=CA`.

- **Rien ne se passe**  
  Vérifie que `SPOTIFY_REFRESH_TOKEN` est bien présent et valide.  
  Regarde les logs Vercel (tab “Functions”) pour le détail d’erreur.

---

### 🔒 Sécurité & limites

- Les URLs `/api/play` peuvent être publiques. Si tu veux **limiter** l’usage :
  - Mets une **whitelist** d’URIs côté serveur (hash/ids autorisés)
  - Ajoute un **token signé** dans l’URL du QR et valide-le côté serveur
- Ne commit **jamais** ton `CLIENT_SECRET`/`REFRESH_TOKEN` dans le code : utilise **exclusivement** les variables d’environnement Vercel.

---

### 🧰 Intégration avec le générateur de cartes

Dans ton script qui génère les QR, construis la cible avec le pattern :

```
https://<TON-PROJET>.vercel.app/api/play?t=spotify:track:${TRACK_ID}
```

ou, si tu utilises un mapping JSON style :
```json
{
  "spotify:track:TRACKID": { "title": "Name", "year": 2010 }
}
```
alors l’URI complète est déjà connue (`spotify:track:TRACKID`) — il suffit de la passer au paramètre `t`.

---

## 🎯 Exemple de QR Code (test)

Le QR ci-dessous appelle ton API `/api/play` avec une piste de démonstration :  
**“Blinding Lights” – The Weeknd**

![QR Code Spotify Test](https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https%3A%2F%2Fhitster-jordan.vercel.app%2Fapi%2Fplay%3Ft%3Dspotify%3Atrack%3A0VjIjW4GlUZAMYd2vXMi3b)

👉 Clique ou scanne :  
[https://hitster-jordan.vercel.app/api/play?t=spotify:track:0VjIjW4GlUZAMYd2vXMi3b](https://hitster-jordan.vercel.app/api/play?t=spotify:track:0VjIjW4GlUZAMYd2vXMi3b)

> Si ton setup Vercel + Spotify est bien configuré, cette URL lancera automatiquement la chanson sur ton appareil DJ actif.

---

## 🧾 Licence

Projet personnel pour usage privé et éducatif.  
Spotify est une marque déposée de Spotify AB.
