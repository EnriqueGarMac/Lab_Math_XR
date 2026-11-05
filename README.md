# Surface Lab — superficies matemáticas en WebGL y Meta Quest 3

Aplicación estática en español para introducir ecuaciones explícitas `z=f(x,y)`, generar superficies 3D, usar cámara/webcam en PC y probar realidad mixta WebXR desde Meta Quest 3. Incluye un intérprete matemático propio sin `eval()`.

## Abrir desde PC

- Sin instalaciones: abre `offline/SurfaceLab_PC.html` en Chrome o Edge.
- Con webcam: sirve la raíz de este repositorio mediante `python -m http.server 8000`, abre http://localhost:8000 y concede el permiso de cámara.
- Escribe, por ejemplo, `sin(x)*cos(y)` o `A*sin(k*x)*cos(y)`. La aplicación admite controles para parámetros libres.

## Controles dentro de Meta Quest 3 (versión XR 1.3)

En el navegador Quest, pulsa **Quest RM**. El menú ya no depende de la barra lateral de HTML: aparece como **panel 3D cerca del centro de tu mirada** y queda fijado en el espacio durante la sesión (ya no sigue automáticamente cada movimiento de cabeza).

- **Gatillo sobre un botón del menú:** selección normal. **Gatillo mantenido sobre la cabecera del panel:** arrastra el menú a cualquier posición. También puedes pulsar **Mover menú**, apuntar a una posición nueva con el mando y confirmar con otro gatillazo. 
- **Gatillo mantenido sobre la superficie matemática:** rota la función en tres dimensiones al girar la muñeca y orientar el mando. Suelta el gatillo para fijar la nueva orientación. 
- **Botón A o X** del mando (según la mano y mapeo WebXR): recentra el menú frente a ti si lo has perdido de vista.
- **Editar ecuación:** abre un teclado matemático inmersivo para escribir expresiones z=f(x,y), incluye sin, cos, sqrt, exp, operadores, x, y, A, k y una tecla para borrar. Pulsa **Representar** para aplicar.
- **Agarre lateral (grip):** mantén pulsado y desplaza el mando para **trasladar** la superficie. La rotación se hace con el gatillo, no con el agarre.
- **Joystick izquierdo:** rotar la superficie horizontal y verticalmente.
- **Joystick derecho:** ampliar/reducir la superficie.
- **Recolocar modelo:** devuelve el objeto frente a ti.
- **Salir de RM:** cierra la sesión y vuelve a la web de escritorio.

Los controles se han implementado con las APIs WebXR de controladores y un panel texturizado en WebGL, sin depender de `dom-overlay`. **Aún falta verificar ergonomía, visibilidad y eventos de los mandos en unas Quest 3 reales.** La barra lateral HTML sigue disponible en el ordenador.

## Mesa, suelo y sombras virtuales (versión XR 1.3)

Esta versión utiliza **WebXR Hit Test**, si el navegador Quest lo ofrece. No necesita acceder ni enviar imágenes de las cámaras a un servidor.

1. Abre la URL HTTPS desde **Meta Quest Browser** y pulsa **Quest RM**.
2. En el menú inmersivo, pulsa **Mesa / suelo / sombra**.
3. Selecciona **Detectar mesa o suelo** y apunta con uno de los mandos a una superficie horizontal del entorno. También puede funcionar apuntando con la mirada si el hit-test del mando no está disponible.
4. Cuando aparezca el **anillo verde**, pulsa el **gatillo fuera del menú** para colocar la función sobre esa superficie.
5. Activa/desactiva **Sombra**, gira la **dirección de luz** y ajusta la **intensidad**. Puedes seguir cambiando la ecuación, la escala y la altura como antes.
6. Pulsa **Quitar plano detectado** para empezar de nuevo o **Recolocar modelo** para volver al modo flotante.

La sombra se genera **proyectando la triangulación de la función**, según una luz direccional virtual, sobre el plano horizontal seleccionado. No modifica la iluminación de la mesa real, no reconstruye la malla completa de la habitación y no oculta objetos reales que se interpongan. El plano seleccionado permanece asociado a la referencia espacial local durante la sesión; **no es un anclaje persistente entre sesiones**.

Si el menú indica que **hit-test no está disponible**, la realidad mixta y los mandos seguirán funcionando, pero no podrás detectar la mesa ni colocar allí una sombra mediante esta versión. Revisa la versión de Quest Browser, la configuración espacial del visor y los permisos solicitados al iniciar realidad mixta.

La colocación y el sombreado se han validado mediante pruebas de geometría y el proceso de GitHub Actions, **no con acceso directo a unas Quest 3 físicas**. Las superficies se reconocen a través de la información espacial que proporciona el sistema, no por análisis propio de píxeles de cámara.

## Publicar desde un repositorio privado

El workflow `.github/workflows/pages.yml` permite publicación manual y automática al subir cambios a `main`, si GitHub Pages ya está habilitado. Para el primer despliegue:

1. Comprueba que tu plan de GitHub permite GitHub Pages desde repositorios privados (GitHub Pro, Team o Enterprise).
2. En el repositorio, entra en **Settings → Pages → Source: GitHub Actions**.
3. Ejecuta desde **Actions** el workflow **Publicar Surface Lab en GitHub Pages (manual)**.
4. Accede a la URL HTTPS que aparezca en **Settings → Pages** desde Meta Quest Browser.

**Advertencia:** un repositorio privado no implica una web privada. GitHub Pages normalmente genera un **sitio público**. La publicación de Pages con acceso restringido requiere una organización en GitHub Enterprise Cloud. Nunca incluyas documentos confidenciales en el contenido que publiques.

## Limitaciones

- El modo webcam en PC no realiza seguimiento espacial: superpone el modelo 3D a la cámara.
- La función Quest usa WebXR `immersive-ar`, sujeta a la compatibilidad del dispositivo y del navegador. Todavía no se ha verificado sobre unas Quest 3 físicas.
- Hay un teclado matemático inmersivo en el panel WebXR. Es un editor básico y no sustituye a un teclado físico para expresiones largas.
- Solo superficies explícitas `z=f(x,y)` en esta versión.

## Pruebas

`npm test` (se necesita Node.js 22 o superior, no hay dependencias externas).
