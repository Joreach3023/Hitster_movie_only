# Hitster Geek – Hidden Spotify Player

## Prérequis
- Compte **Spotify Premium** (DJ)
- **Spotify Developer**: créer une app et récupérer `Client ID`
- **Vercel** (gratuit) pour le backend OAuth
- **GitHub Pages** pour le frontend

## Déploiement
1. Fork/clone ce repo.
2. Sur **Vercel**: “Import Project” → sélectionne ce repo.
   - Vars: `SPOTIFY_CLIENT_ID=<ton id>`
   - Déploie → note l’URL: `https://<project>.vercel.app`
3. Dans **Spotify Dashboard**, ajoute `https://<project>.vercel.app/api/callback` comme Redirect URI.
4. Sur **GitHub**:
   - Settings → Pages → Deploy from branch → `main` → `/ (root)` → Save
   - Ton site: `https://<username>.github.io/hitster-geek/`
5. Ouvre `index.html` sur GitHub Pages, clique **Login with Spotify**.  
   Tu reviendras avec `?token=...` dans l’URL (auth OK).

## Générer des QR
- Installer les dépendances: `npm install`
- Générer les images PNG avec: `npm run generate:qr -- https://<username>.github.io/hitster-geek/`
  - Le script crée un dossier `qr-codes/` avec un fichier par morceau listé dans `tracks.json`.
  - Tu peux aussi définir la base via la variable d’environnement `HITSTER_QR_BASE`.
- Format de lien utilisé dans chaque QR:
  `https://<username>.github.io/hitster-geek/?t=spotify:track:<TRACK_ID>`
- Exemple d’URL générée:
  `https://yourname.github.io/hitster-geek/?t=spotify:track:7a9UUo3zfID7Ik2fTQjRLi`

## Remplir les métadonnées (Reveal)
- Édite `tracks.json` et ajoute tes 200 entrées:
```json
{
  "spotify:track:TRACKID": { "title": "Name", "year": 2010 }
}

