# SAO Memory Defrag · Port para navegador

Port no oficial hecho por fans. Está en desarrollo y todavía tiene diferencias respecto al juego original.

**[Abrir el juego](https://zurielatr.github.io/sao-memory-defrag/)**

## Cómo jugar

1. Abre la página en un navegador de escritorio. Se ha probado en navegadores Chromium; la compatibilidad completa con Firefox está pendiente.
2. Selecciona tu propia copia de la APK o del archivo `.apks` compatible (probado con SAO MD Revival).
3. Pulsa **Importar** y espera a que termine. El proceso puede tardar varios minutos y necesita unos 4 GB libres.
4. Pulsa **Jugar**. Activa el sonido desde el control **Sonido** si el navegador lo solicita.

La APK se procesa en tu equipo y **no se envía al servidor**. Los recursos importados y tu partida quedan en el almacenamiento de ese navegador. No borres los datos del sitio si quieres conservarlos; puedes exportar una copia de tu partida desde la portada. Cambiar de navegador o de dispositivo requiere importar de nuevo.

Se recomienda ordenador con teclado. Los controles táctiles están pendientes y no se ha validado el funcionamiento en Safari/iPhone/iPad.

En la pantalla **Equipo**, pulsa **Equipo** junto al personaje y elige **Arma**, **Armadura** o
**Accesorio**. Puedes equipar o retirar piezas compatibles de tu inventario. La elección se guarda
en la partida y sus estadísticas y pasivas se aplican en combate. Si la lista está vacía, primero
necesitas obtener equipo en las misiones. Las mejoras y evoluciones siguen pendientes.

Las pasivas propias del personaje requieren un desbloqueo registrado en la partida; el nivel
por sí solo no las activa. El menú para desbloquearlas todavía está pendiente. Las pasivas de
las piezas equipadas se aplican con sus condiciones de combate.

## Controles de combate

- Flechas o WASD: moverse.
- Z: atacar; con rifle, sostener para apuntar y soltar para disparar. Espacio: saltar.
- La carga del rifle alterna ventanas de disparo normal, menor precisión y crítico. Una parada puede devolver los proyectiles que admiten reflexión.
- C: guardia; C + Espacio: parada. X: paso atrás.
- 1–4: skills. Q/E/R: cambiar al personaje 1/2/3.

## Qué contiene este repositorio

HTML y JavaScript del port, del importador y del servidor local simulado que se ejecuta en el navegador. No contiene APK, recursos del juego, tablas generadas ni descompilaciones, y no ofrece enlaces para descargar el juego original.

La página se publica con GitHub Pages desde `main`. Para probar el código en tu equipo, sirve esta carpeta con un servidor HTTP local (por ejemplo, `python -m http.server 8000`) y abre `http://localhost:8000/`. Abrir el HTML directamente con `file://` no permite la importación.

## Estado

Incluye importación local, misiones, combate, interfaz, diálogos, música, efectos y voces. Quedan pendientes detalles de fidelidad en combate, interfaz y audio; algunas misiones o recursos pueden no funcionar todavía. El multijugador no está implementado.

## Créditos

Sword Art Online y los recursos del juego pertenecen a sus respectivos titulares. Este proyecto no está afiliado a Bandai Namco ni a los titulares de Sword Art Online.

El decodificador ADPCM se basa en [Cricket Audio](https://github.com/sjmerel/ck) y conserva su aviso de licencia zlib en `js/audio/ckb.js`. El lector de interfaz sigue el formato de [cocos2d-x](https://github.com/cocos2d/cocos2d-x), publicado bajo licencia MIT. Los archivos del juego los aporta cada jugador desde su propia copia.
