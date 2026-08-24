# ⚠️ NO TRABAJAR EN ESTE REPO

Este repo es **solo el espejo de publicación** del sitio de Boltana Group
(GitHub Pages necesita un repo público): https://cbitasama.github.io/boltana-preview/

**El proyecto REAL es `cbitaSama/boltana-web` (privado)** — código fuente, docs,
CLAUDE.md, historial. Todo cambio se hace ALLÁ y se copia acá con:
```
cp index.html scene.js builder3d.js ../boltana-preview/ && cp vendor/three.module.min.js ../boltana-preview/vendor/
cd ../boltana-preview && git add -A && git commit -m "sync" && git push
```
Cuando el dominio esté conectado en Vercel, este repo se puede archivar.
