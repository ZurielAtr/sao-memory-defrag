[English](README.md) | **Español**

# SAO Memory Defrag · Port para navegador

**Este proyecto se está desarrollando en su totalidad con inteligencia artificial generativa, utilizando modelos como Claude Opus 5.5 y GPT 6.1 Sol.**

Port no oficial hecho por fans. Está en desarrollo y todavía tiene diferencias respecto al juego original.

**[Abrir el juego](https://zurielatr.github.io/sao-memory-defrag/)**

## Cómo jugar

1. Abre la página en un navegador de escritorio. Se ha probado en navegadores Chromium; la compatibilidad completa con Firefox está pendiente.
2. Selecciona tu propia copia de la APK o del archivo `.apks` compatible (probado con SAO MD Revival).
3. Pulsa **Importar** y espera a que termine. El proceso puede tardar varios minutos y necesita unos 4 GB libres.
4. Pulsa **Jugar**. Activa el sonido desde el control **Sonido** si el navegador lo solicita.

La APK se procesa en tu equipo y **no se envía al servidor**. Los recursos importados y tu partida quedan en el almacenamiento de ese navegador. No borres los datos del sitio si quieres conservarlos; puedes exportar una copia de tu partida desde la portada. Cambiar de navegador o de dispositivo requiere importar de nuevo.

Se recomienda ordenador con teclado. Los controles táctiles están pendientes y no se ha validado el funcionamiento en Safari/iPhone/iPad.

En escritorio, menús, diálogos y combate se muestran centrados con el formato vertical original, a la máxima altura disponible y con márgenes oscuros a los lados. Si el ancho es insuficiente, se ajustan sin recortarse. El regreso conserva su tamaño y orientación; se han corregido solapamientos en Taberna, Herrería, Multi, Mapa y Habilidades. La actualización del catálogo conserva los recursos importados y la partida. La fidelidad completa de algunas pantallas sigue pendiente.

En la pantalla **Equipo**, pulsa **Equipo** junto al personaje y elige **Arma**, **Armadura** o
**Accesorio**. Puedes equipar o retirar piezas compatibles de tu inventario. La elección se guarda
en la partida y sus estadísticas y pasivas se aplican en combate. Si la lista está vacía, primero
necesitas obtener equipo en las misiones. Desde **Upgrade** puedes fortalecer, evolucionar, vender e intercambiar: selecciona las piezas, revisa los requisitos y confirma. Las operaciones se guardan; cancelar no consume recursos.

En **Equipo**, pulsa **Árbol** para desbloquear nodos con sus materiales y requisitos.
Puedes arrastrar el árbol en ambos ejes. Las pasivas propias requieren comprar su nodo;
subir de nivel por sí solo no las activa. **Ranuras** permite adquirir y mejorar las habilidades
disponibles para ese personaje. Si hay materiales alternativos, elige uno antes de comprar.
Las mejoras adquiridas se guardan y se aplican en combate.

En la lista de misiones, los candados muestran qué misión y dificultad necesitas
completar. Puedes tocar una misión bloqueada para consultar su detalle. Las
misiones de diálogo aparecen como **Historia** y se abren con **Leer**; completarlas
guarda el progreso y desbloquea la siguiente misión cuando corresponde.

La asignación de habilidades a los nodos y la dirección de crecimiento de las ramas de límite
usan reglas provisionales del servidor local. Quedan pendientes asistencia de ranuras,
cambio de dirección de límite y compras con diamantes. Las pasivas de las piezas equipadas
se aplican con sus condiciones de combate.

## Controles de combate

- Flechas o WASD: moverse.
- Z: atacar; con rifle, sostener para apuntar y soltar para disparar. Espacio: saltar.
- La carga del rifle alterna ventanas de disparo normal, menor precisión y crítico. Una parada puede devolver los proyectiles que admiten reflexión.
- C: guardia; C + Espacio: parada. X: paso atrás.
- 1–4: skills. Q/E/R: cambiar al personaje 1/2/3.

## Controles de diálogo

En los diálogos, Espacio/Intro/Z completan el texto o avanzan; Log/L abre el
registro con desplazamiento y repetición de las voces disponibles. Volver/Escape
cierra el registro. Cuando la historia permite saltar, Skip/Escape muestra su
resumen o una confirmación: Seguir leyendo regresa y Saltar/Intro termina.
Si no permite saltar, Escape muestra un aviso. Se incluyen sacudidas, gamma del
fondo y apertura/cierre animados de estos menús; respetan la preferencia de
movimiento reducido del sistema. La fidelidad de otros efectos y transiciones sigue pendiente.

## Qué contiene este repositorio

HTML y JavaScript del port, del importador y del servidor local simulado que se ejecuta en el navegador. No contiene APK, recursos del juego, tablas generadas ni descompilaciones, y no ofrece enlaces para descargar el juego original.

La página se publica con GitHub Pages desde `main`. Para probar el código en tu equipo, sirve esta carpeta con un servidor HTTP local (por ejemplo, `python -m http.server 8000`) y abre `http://localhost:8000/`. Abrir el HTML directamente con `file://` no permite la importación.

## Estado

Desde Home, **Town** abre los accesos de la ciudad, **Scout** la Taberna, **Upgrade**
la Herrería y **Multi** el menú de cooperación. Tab/las flechas recorren sus botones;
Intro/Espacio seleccionan y Escape vuelve. En Taberna puedes consultar tu colección
y gestionar el equipo. Upgrade enlaza inventario, Equipo, Árbol y Ranuras.

Taberna ofrece Start Dash, Alfheim Online Reborn y Viento como banners históricos reconstruidos. Puedes consultar probabilidades individuales y reclutar×1/×11. Grupos: [Fanadata](https://saomd.fanadata.com/banners); tasas, costes y repetidos: modelo comunitario [S-argo](https://github.com/Expugn/S-argo), identificado en pantalla. No son respuestas del servidor oficial. Los repetidos conservan al personaje y conceden cristales generales, utilizables como una alternativa de pago en las rupturas del Árbol que la ofrecen. Elige una sola fuente; no se mezclan con los materiales del inventario.

Las cuentas nuevas reciben **600 diamantes para reclutar**, una cantidad provisional que puede cambiar para futuros jugadores. Las partidas existentes conservan su saldo. El sorteo se guarda antes de la introducción y de las revelaciones individuales. Se incluyen Argo, puerta, estrellas, NEW/cristales, partículas, música, efectos y voces originales disponibles. Toca para continuar o acelerar la puerta; **Skip**, abajo a la derecha durante la puerta, o **Escape** llevan a la lista. **Último sorteo → Ver animación** repite sin pagar. El movimiento reducido muestra resultados estáticos con nombre y rareza.

Los carteles históricos y las imágenes de introducción son recursos opcionales que pueden faltar en la APK. Si dispones de un paquete compatible, usa **Añadir recursos de gacha** en la portada después de importar la APK. Añadirlo conserva la partida. Sin esas imágenes se mantiene una vista informativa del banner. Las promociones impresas en las artes históricas no cambian las tasas comunitarias indicadas al confirmar. Esta versión actualiza automáticamente el catálogo local a v15 conservando los recursos y la cuenta. La comparación completa con Android todavía está pendiente.

El reproductor de partículas conserva la licencia MIT de [SpriteStudio/ssbpLib](https://github.com/SpriteStudio/ssbpLib) en `js/ssbp_effects.js`.
