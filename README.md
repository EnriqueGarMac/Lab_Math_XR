🌐 **[Abrir Lab Math XR — aplicación web](https://enriquegarmac.github.io/Lab_Math_XR/)**

> Acceso directo desde el navegador, también desde Meta Quest 3. Sin instalar nada.

# Surface Lab — superficies matemáticas en WebGL y Meta Quest 3

Aplicación estática en español para introducir ecuaciones explícitas `z=f(x,y)`, generar superficies 3D, usar cámara/webcam en PC y probar realidad mixta WebXR desde Meta Quest 3. Incluye un intérprete matemático propio sin `eval()`.

## Ver la función en realidad aumentada con el móvil

Abre **[Surface Lab en el móvil](https://enriquegarmac.github.io/Lab_Math_XR/)** y pulsa **AR móvil**, junto a «Vista 3D» y «Quest RM». No requiere instalar una aplicación propia.

- **Android + Chrome compatible con ARCore/WebXR:** se abre la cámara en una sesión AR real. Apunta al suelo o a una mesa y pulsa **Colocar aquí** para situar la superficie. Utiliza los controles táctiles para cambiar su tamaño, volver a buscar una superficie y salir. La detección depende de WebXR hit-test y de los servicios AR del teléfono; si no están disponibles, la página lo indicará.
- **iPhone / iPad + Safari:** se genera localmente una copia USDZ de la **ecuación, geometría y paleta actuales**. Cuando aparezca **Abrir en AR Quick Look**, púlsalo para colocar la figura en tu entorno y moverla o escalarla con gestos. Esta vista es una **instantánea** y no incluye edición de ecuaciones dentro de Quick Look. Para cambiar la ecuación, vuelve a la web, modifica la función y pulsa de nuevo **AR móvil**.

**Colores y sombras en AR móvil:** la superficie se exporta con una **textura de color** que conserva la paleta matemática, en lugar de depender de colores por vértice que algunos visores USDZ ignoran. En iPhone, **AR Quick Look puede generar una sombra automática, pero no siempre resulta visible**. Por eso el panel «AR móvil» incorpora ahora la opción **«Añadir sombra suave bajo el modelo»**, activada por defecto. Esta alternativa crea una proyección semitransparente integrada en el USDZ, junto a la superficie, que se mueve con ella. Es una sombra **aproximada y estática**, no responde a la luz ambiental real. Desmarca la opción si Quick Look ya muestra su propia sombra y ves un efecto duplicado. En **Android/WebXR**, el motor proyecta una sombra virtual a partir de la malla de la función sobre la superficie detectada. Ninguna de las dos opciones cambia la iluminación real.

**Corrección iPhone (v1.9):** el exportador USDZ integra los cálculos de colores y sombras en un solo módulo JavaScript. Esto reduce los fallos de importación por versiones mezcladas de GitHub Pages y el módulo utiliza una URL versionada para evitar errores almacenados por Safari. Si aparece un error de carga, cierra la pestaña de Safari y vuelve a abrir la aplicación.

En iOS, la conversión usa Three.js y su USDZExporter (cargados al preparar el modelo). La conversión no envía las ecuaciones ni las imágenes de cámara a un servidor. La compatibilidad final de Quick Look y la detección Android deben verificarse en teléfonos físicos.

## Abrir desde PC

- Sin instalaciones: abre `offline/SurfaceLab_PC.html` en Chrome o Edge.
- Con webcam: sirve la raíz de este repositorio mediante `python -m http.server 8000`, abre http://localhost:8000 y concede el permiso de cámara.
- Escribe, por ejemplo, `sin(x)*cos(y)` o `A*sin(k*x)*cos(y)`. La aplicación admite controles para parámetros libres.

## Controles dentro de Meta Quest 3 (versión XR 1.9)

En el navegador Quest, pulsa **Quest RM**. El menú ya no depende de la barra lateral de HTML: aparece como **panel 3D cerca del centro de tu mirada** y queda fijado en el espacio durante la sesión (ya no sigue automáticamente cada movimiento de cabeza).

- **Gatillo sobre un botón del menú:** selección normal. **Gatillo mantenido sobre la cabecera del panel:** arrastra el menú a cualquier posición. También puedes pulsar **Mover menú**, apuntar a una posición nueva con el mando y confirmar con otro gatillazo. 
- **Gatillo mantenido sobre la superficie matemática:** rota la función en tres dimensiones al girar la muñeca y orientar el mando. Suelta el gatillo para fijar la nueva orientación. 
- **Botón A o X** del mando (según la mano y mapeo WebXR): recentra el menú frente a ti si lo has perdido de vista.
- **Escribir mi ecuación:** ahora aparece como botón grande al principio del menú inmersivo. Abre un editor inicialmente vacío para construir tu propia función `z=f(x,y)` con el gatillo. El teclado `123 / f(x)` contiene números, operadores, potencias, sin/cos/tan/sqrt/exp/log, x, y, pi y constantes. Pulsa `ABC` para introducir más letras o nombres de parámetros. `Cargar ecuación actual` recupera la función anterior para editarla; `Borrar todo` la limpia. Pulsa **REPRESENTAR** para aplicar sin salir de la realidad mixta.
- **Densidad de malla:** usa los botones `−` y `+` en la pantalla principal, justo debajo de los ejemplos. Permiten seleccionar desde **20 × 20 hasta 100 × 100** divisiones de resolución, en incrementos de 5. La superficie y todas las líneas visibles de la malla se regeneran al instante.
- **Aspecto y parámetros:** botón independiente que contiene los estilos (sólido, malla, ambos), paletas, ejes, plano de referencia y ajustes de parámetros como `A` y `k`.
- **Agarre lateral (grip):** mantén pulsado y desplaza el mando para **trasladar** la superficie. La rotación se hace con el gatillo, no con el agarre.
- **Joystick izquierdo:** rotar la superficie horizontal y verticalmente.
- **Joystick derecho:** ampliar/reducir la superficie.
- **Recolocar modelo:** devuelve el objeto frente a ti.
- **Salir de RM:** cierra la sesión y vuelve a la web de escritorio.

Los controles se han implementado con las APIs WebXR de controladores y un panel texturizado en WebGL, sin depender de `dom-overlay`. **Aún falta verificar ergonomía, visibilidad y eventos de los mandos en unas Quest 3 reales.** La barra lateral HTML sigue disponible en el ordenador.

## Mesa, suelo y sombras virtuales (versión XR 1.5)

Esta versión utiliza **WebXR Hit Test**, si el navegador Quest lo ofrece. No necesita acceder ni enviar imágenes de las cámaras a un servidor.

1. Abre la URL HTTPS desde **Meta Quest Browser** y pulsa **Quest RM**.
2. En el menú inmersivo, pulsa **Mesa / suelo / sombra**.
3. Selecciona **Detectar mesa o suelo** y apunta con uno de los mandos a una superficie horizontal del entorno. También puede funcionar apuntando con la mirada si el hit-test del mando no está disponible.
4. Cuando aparezca el **anillo verde**, pulsa el **gatillo fuera del menú** para colocar la función sobre esa superficie.
5. Activa/desactiva **Sombra**, gira la **dirección de luz** y ajusta la **intensidad**. Puedes seguir cambiando la ecuación, la escala y la altura como antes.
6. Pulsa **Quitar plano detectado** para empezar de nuevo o **Recolocar modelo** para volver al modo flotante.

### Ajustar automáticamente el tamaño a una mesa

Con **Quest RM → Mesa / suelo / sombra**, la opción **Ajuste automático** está activada por defecto. Al pulsar **Detectar mesa / suelo** y colocar la función sobre una mesa, la aplicación intenta obtener su polígono mediante la capacidad opcional de WebXR **plane-detection**. Si está disponible, estima la superficie y reduce o amplía uniformemente la función para dejar un margen hasta los bordes. El tamaño se aproxima al tablero detectado, no a la habitación, y conserva las proporciones de la función. No se pretende obtener una medición metrológica.

**Limitación importante:** WebXR `hit-test` por sí solo da el punto y la normal de la superficie, **no su tamaño**. Si Quest Browser no proporciona polígonos de mesa, la aplicación no inventa dimensiones: muestra que el contorno no está disponible y conserva el tamaño. Usa entonces **Medir borde corto (2 puntos)**. Marca con el gatillo dos extremos del **lado más corto** de la mesa, aproximadamente a la misma altura. La función utilizará ese ancho para ajustar su tamaño. Conviene situar el modelo cerca del centro de la mesa antes de medir, porque esta acción no lo recoloca automáticamente.

La detección de planos es opcional. La app sigue funcionando aunque el navegador no admita esta capacidad. La opción de medida manual requiere que `hit-test` esté disponible.

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
- La edición inmersiva utiliza un teclado matemático y alfabético de botones 3D seleccionables con el gatillo. Todavía no incorpora un teclado del sistema operativo Quest ni edición de texto libre con dictado.
- Solo superficies explícitas `z=f(x,y)` en esta versión.

## Pruebas

`npm test` (se necesita Node.js 22 o superior, no hay dependencias externas).
