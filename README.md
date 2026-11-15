# Africa DevRelais

Plateforme d’entraide et de collaboration pour les développeurs africains. L’application utilise Next.js et React, avec Supabase pour l’authentification, PostgreSQL et le stockage.

## Lancement local

Installe Node.js 24 et exécute les commandes suivantes à la racine du dépôt.

```sh
npm ci
npm run dev
```

Crée un fichier `.env.local` à la racine avec ces deux variables, en utilisant les valeurs du projet Supabase.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Pour un nouveau projet Supabase, exécute `supabase/schema.sql`, puis les scripts numérotés dans l’ordre. Sur un projet déjà configuré, applique uniquement les migrations manquantes.

## Déploiement

Configure les deux variables Supabase dans l’environnement de compilation.

- Build : `npm ci && npm run build`
- Démarrage : `npm run start -- --hostname 0.0.0.0`
- Vérification HTTP : `/`

Une fois l’URL HTTPS obtenue, configure la Site URL et autorise les retours `/compte?confirmation=1` et `/parametres` dans Supabase Auth.
