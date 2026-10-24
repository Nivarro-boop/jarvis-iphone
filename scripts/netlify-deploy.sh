#!/usr/bin/env sh
# Netlify-Site bauen, als Entwurf hochladen und veröffentlichen (siehe netlify-site.mjs).
set -e
SITE=d4f3f987-4134-4363-b877-5a978fc7838b
node scripts/netlify-site.mjs
ID=$(netlify deploy --dir netlify-site --site "$SITE" --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).deploy_id))")
netlify api restoreSiteDeploy --data "{\"site_id\":\"$SITE\",\"deploy_id\":\"$ID\"}" > /dev/null
echo "Veröffentlicht: https://james-marktplatz.netlify.app ($ID)"
