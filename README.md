# Surface Lab — superficies matemáticas en WebGL y Meta Quest 3

Aplicación estática en español para introducir ecuaciones explícitas `z=f(x,y)`, generar superficies 3D, usar cámara/webcam en PC y probar realidad mixta WebXR desde Meta Quest 3. Incluye un intérprete matemático propio sin `eval()`.

## Abrir desde PC

- Sin instalaciones: abre `offline/SurfaceLab_PC.html` en Chrome o Edge.
- Con webcam: sirve la raíz de este repositorio mediante `python -m http.server 8000`, abre http://localhost:8000 y concede el permiso de cámara.
- Escribe, por ejemplo, `sin(x)*cos(y)` o `A*sin(k*x)*cos(y)`. La aplicación admite controles para parámetros libres.

## Publicar desde un repositorio privado

El workflow `.github/workflows/pages.yml` está configurado **solo para ejecución manual**. Si decides publicar:

1. Comprueba que tu plan de GitHub permite GitHub Pages desde repositorios privados (GitHub Pro, Team o Enterprise).
2. En el repositorio, entra en **Settings → Pages → Source: GitHub Actions**.
3. Ejecuta desde **Actions** el workflow **Publicar Surface Lab en GitHub Pages (manual)**.
4. Accede a la URL HTTPS que aparezca en **Settings → Pages** desde Meta Quest Browser.

**Advertencia:** un repositorio privado no implica una web privada. GitHub Pages normalmente genera un **sitio público**. La publicación de Pages con acceso restringido requiere una organización en GitHub Enterprise Cloud. Nunca incluyas documentos confidenciales en el contenido que publiques.

## Limitaciones

- El modo webcam en PC no realiza seguimiento espacial: superpone el modelo 3D a la cámara.
- La función Quest usa WebXR `immersive-ar`, sujeta a la compatibilidad del dispositivo y del navegador. Todavía no se ha verificado sobre unas Quest 3 físicas.
- El editor de ecuaciones está en la página 2D, no es un teclado espacial dentro de WebXR.
- Solo superficies explícitas `z=f(x,y)` en esta versión.

## Pruebas

`npm test` (se necesita Node.js 22 o superior, no hay dependencias externas).
