# Rive Integration Plan — The Cursed Arcana

## Alcance de esta auditoría

Este documento nació como auditoría de la aplicación y propuesta de integración. Registra también el prototipo visual Rive y su conexión al runtime web. El Tarot Engine no se modificó.

### Estado del asset de escena

`myproject/scene.rml` ya contiene la preparación visual de la lectura: tres imágenes independientes para `past`, `present` y `future`, seleccionables desde el View Model `Reading`; un booleano `*Cursed` por carta; y la State Machine `ReadingExperience`.

La máquina espera `startReveal`, revela cada carta con una rama normal o cursed y avanza automáticamente entre posiciones mediante transiciones con tiempo de salida. Al hacer clic en la mesa emite `ReadingRequested`; al completar la tercera carta emite `ReadingComplete`. El controller asigna las imágenes y estados cursed desde la lectura real del Tarot Engine y dispara `startReveal`.

La fuente local compila y pasa `rive . --verify` sin errores ni advertencias; `rive inspect . --summary` no reporta problemas. La web carga el runtime oficial fijado y el artboard en el diálogo de lectura; al recibir `ReadingComplete`, muestra los detalles de texto. Si falla Rive, se muestra el error y la lectura HTML queda disponible como alternativa.

La escena local conserva los shaders AnimaScript para previsualizarlos en Rive. Para la web, `python3 myproject/export-web.py` crea `web/assets/myproject.riv` con las mismas animaciones y la máquina de estados, pero sin `ScriptedDrawable`, `ScriptAsset` ni código de shader, que no se pueden ejecutar en el build web sin firma. El export valida que no queden esos objetos antes de reemplazar el asset web. El navegador ya se probó con este export sin errores de shader; el runtime todavía advierte que los inputs y eventos legacy están deprecados.

## Current Architecture

### Aplicación y entry points

- Aplicación web: HTML, CSS y JavaScript ES modules sin framework. El punto de entrada de la página es [`index.html`](./index.html), que carga [`web/main.js`](./web/main.js).
- Ejecución local: [`server.js`](./server.js), un servidor HTTP basado en módulos nativos de Node, sirve los archivos en `http://127.0.0.1:5175/`. No hay bundler ni sistema de rutas de cliente.
- Entry point de consola: [`src/main.js`](./src/main.js) carga datos mediante el loader de Node, crea una lectura y la imprime con `debugReading`. Es independiente del flujo web.
- Motor: JavaScript ESM en `src/tarot/`; datos en JSON. Los tests usan el runner nativo de Node (`node --test`).
- No hay framework UI, gestor de estado ni router. La aplicación usa el runtime oficial `@rive-app/canvas` fijado en `package.json`, con GPU Canvas habilitado en el controller; la UI usa tres diálogos nativos HTML (`<dialog>`) para introducción, selección de tema y lectura, superpuestos a una única escena Rive persistente.

### Estructura relevante

```text
index.html                         capa de escena persistente, diálogos y carga de web/main.js
style.css                          escena de fondo y estilos responsive de la UI y los diálogos
web/main.js                        carga JSON, selección de contexto, generación y render
web/rive-controller.js             adapta la lectura a la escena Rive y controla el runtime
web/assets/reading-scene.riv       asset Rive consumido por el runtime web
server.js                          servidor estático local
src/main.js                        entry point CLI
src/data/loader.js                 loader/validación de datos para Node
src/data/values.js                 helpers de valores
src/tarot/reading-engine.js        orquestación de la lectura
src/tarot/draw.js                  selección de cartas y cantidad de curses
src/tarot/curse-engine.js          asignación de curses a cartas
src/tarot/narrative-engine.js      análisis temático y generación narrativa
src/tarot/random.js                aleatoriedad y selección
src/tarot/debug.js                 presentación en consola
*.json, data/*.json                datos del tarot
tests/*.test.js                    pruebas del motor y narrativa
thecursedarcanav1/                 subproyecto Rive CLI
```

### Datos y estado actual

Los datos de cartas, contexts, posiciones, curses, templates y listas son JSON. El loader del servidor/CLI está en [`src/data/loader.js`](./src/data/loader.js). La web tiene su propio `loadData()` en [`web/main.js`](./web/main.js): solicita ocho JSON con `fetch()` al iniciar y conserva el resultado en `tarotData`.

En la web, el contexto actual vive en la variable local `selectedContext`; los datos cargados, en `tarotData`. `handleStartReading()` genera la lectura al pulsar el CTA del selector y la pasa a `showReadingResult()`, que renderiza y abre el diálogo de lectura. La instancia Rive se carga al iniciar la página en un canvas de fondo fijo; los diálogos quedan por encima y no desmontan la escena. No hay un store central ni persistencia de una lectura entre recargas.

**Discrepancia de datos que conviene resolver en una fase posterior:** existen copias de `theme_relations.json` y `theme_labels.json` en la raíz y en `data/`. No son idénticas: las copias raíz tienen 15 relaciones y 9 etiquetas; `data/` tiene 58 y 58. El loader de Node y la web leen las versiones de `data/`; las copias raíz no participan en esos flujos actuales. La fuente canónica debería seguir siendo `data/` o consolidarse explícitamente antes de mantener/exportar datos por dos rutas.

### Render actual

[`index.html`](./index.html) contiene un canvas Rive fijo detrás de tres diálogos: introducción, selección de tema y lectura. Los temas disponibles son `love`, `career`, `self`, `choice` y `unknown` (presentado como “Unknown”). La escena Rive permanece montada durante todo el flujo; el diálogo de lectura contiene los slots (`past`, `present`, `future`) y la narrativa generada, no otro canvas. [`web/main.js`](./web/main.js) crea y modifica nodos DOM directamente; [`style.css`](./style.css) define la escena, las capas, los estilos responsive y el estado `.cursed`. No hay componentes UI de framework.

## Tarot Flow

El flujo real actual es:

```text
Carga de index.html
  ↓
web/main.js registra listeners, inicia la escena Rive persistente y carga 8 JSON en paralelo
  ↓
Se abre el diálogo de introducción sobre la escena
  ↓
Comenzar → diálogo de selección de tema
  ↓
El usuario elige un context
  ↓
Start your reading
  ↓
handleStartReading()
  ↓
createReading({ context: selectedContext, data: tarotData })
  ↓
showReadingResult(reading) → renderiza el contenido HTML y abre el diálogo
  ↓
riveController.playReading(reading) → asigna imágenes/isCursed e inicia ReadingExperience
  ↓
Rive revela automáticamente past → present → future
  ↓
Rive emite ReadingComplete → se muestran cartas y narrativa en HTML
```

Detalle del engine:

1. [`web/main.js`](./web/main.js) carga `cards`, `contexts`, `positions`, `curses`, `templates`, `lists`, `theme_relations` y `theme_labels`. Los fallos de red, HTTP o JSON se muestran mediante `showError()` y el estado del engine.
2. El botón `Start your reading` ejecuta `handleStartReading()`. Si no hay datos cargados, informa del error; de lo contrario llama a `createReading()` de [`src/tarot/reading-engine.js`](./src/tarot/reading-engine.js), sin `seed`, por lo que la web usa aleatoriedad normal.
3. `createReading()` valida que exista data y que el context esté entre `love`, `career`, `self`, `choice` y `unknown`. Filtra los 22 Major Arcana, llama a `drawCards()` en [`src/tarot/draw.js`](./src/tarot/draw.js), toma tres cartas únicas y las asigna en orden a `past`, `present`, `future`.
4. El engine decide un curse count de 1 a 3, usando la distribución configurada en `draw.js`, y llama a `assignCurses()` en [`src/tarot/curse-engine.js`](./src/tarot/curse-engine.js). Se prefieren curses compatibles con la carta y se usa el conjunto global como fallback.
5. Para cada carta, busca el significado correspondiente al context y a la posición. Luego [`src/tarot/narrative-engine.js`](./src/tarot/narrative-engine.js) analiza curses y relaciones temáticas y devuelve las partes de la narrativa.
6. La lectura expone, entre otros datos, `id`, `context`, `curseCount`, `curseLevel`, `cards`, `themeMap`, `relationships`, `dominantTheme`, `storyAnalysis` y `narrative`. Cada carta contiene `position`, `cardId`, `cardName`, `isCursed`, `curse`, `curseId`, `themes`, `meaning`, `positionMeaning`, `displayThemes` y `curseDistortion`.
7. `renderReading(reading)` valida que haya tres cartas y que el orden/posición encaje con los slots. Actualiza los títulos, los textos, `.cursed`, la narrativa detallada y los valores visibles de estado.

No se modifica el resultado del engine al renderizar. La UI consume directamente el objeto devuelto.

## Important Events

| Evento/acción | Archivo y función | Cambio de estado | Efecto UI actual |
|---|---|---|---|
| Inicio de la página / carga de datos | [`web/main.js`](./web/main.js): `loadData()`, `riveController.initialize()` y bloque de inicialización | Llena `tarotData`; inicia la escena Rive persistente y actualiza estado de servidor/data/engine | La escena queda de fondo; los indicadores pasan a cargado o muestran error |
| Comenzar | [`index.html`](./index.html): `#begin-reading`; [`web/main.js`](./web/main.js): `openDialog()` | Cambia del diálogo de introducción al selector | Abre el diálogo de tema |
| Seleccionar tema | [`web/main.js`](./web/main.js): listener en `[data-context]` | Cambia `selectedContext` | Actualiza `.selected` y `aria-pressed`; no genera lectura |
| Start your reading | [`web/main.js`](./web/main.js): `handleStartReading()` → `createReading()` → `showReadingResult()` | Genera la lectura usando el contexto seleccionado y cierra el selector | Deja la escena despejada y entrega la lectura a la instancia Rive persistente |
| Reveal / revelado de cartas | [`myproject/scene.rml`](./myproject/scene.rml): `ReadingExperience`; [`web/rive-controller.js`](./web/rive-controller.js): `playReading()` | El engine resuelve las tres cartas juntas; Rive las anima y las coloca por posición | Con la escena despejada, al recibir `ReadingComplete` se muestran las cartas y narrativa y se abre el diálogo |
| Cambio de posición | [`src/tarot/reading-engine.js`](./src/tarot/reading-engine.js) usa `POSITIONS` de `draw.js` | Asigna past/present/future por índice | `renderReading()` coloca cada carta en su slot y falla si no coincide |
| Curse | [`src/tarot/reading-engine.js`](./src/tarot/reading-engine.js) → [`src/tarot/curse-engine.js`](./src/tarot/curse-engine.js) | Cada carta recibe `isCursed` y su objeto `curse`; la lectura tiene `curseCount`/`curseLevel` | Clase `.cursed`, texto de curse y contadores |
| Possessed / estado poseído | **No existe** | No hay `isPossessed` ni estado equivalente | Ninguno; no se debe traducir automáticamente `isCursed` como “possessed” |
| New reading | [`index.html`](./index.html): `#new-reading`; [`web/main.js`](./web/main.js): `openDialog()` | Reinicia la máquina Rive y conserva el contexto seleccionado hasta cambiarlo | Regresa al selector sin retirar la escena de fondo |
| Cerrar resultado | `#close-reading` y clic en el backdrop de `#reading-modal` en [`web/main.js`](./web/main.js) | Cierra solo el diálogo; conserva la escena Rive y las cartas reveladas | La mesa queda visible sin reiniciar la lectura |
| Atrás / Escape del selector | Botón de navegación y listener `cancel` de `#theme-modal` en [`web/main.js`](./web/main.js) | No cambia la lectura ni el contexto | Regresa a la introducción |
| Error de lectura | [`web/main.js`](./web/main.js): `showError()` y catch de `handleStartReading()` | No se guarda una lectura nueva | Mensaje accesible en el selector y estado de engine |

La acción `Start your reading` del modal inicia el mismo caso de uso de generación; no añade reglas al Tarot Engine. `showReadingResult(reading)` cierra los diálogos y deja la escena despejada durante el reveal. Al recibir `ReadingComplete`, presenta el resultado HTML y abre el modal; si el reveal falla, abre el modal igualmente con la lectura HTML y el error. El resultado se puede cerrar con la X o con un clic fuera; esas acciones cierran solo el diálogo y mantienen las cartas reveladas en la escena.

## Rive Integration Point

El punto de integración más pequeño y coherente es la capa web, no el Tarot Engine:

```text
web/main.js
  ├── maneja el DOM y los controles
  ├── llama createReading()
  ├── llama renderReading()
  └── envía la lectura a un rive-controller.js
          └── runtime Rive → canvas fijo de fondo → archivo .riv
```

`handleStartReading()` es el punto de orquestación real: después de que `createReading()` devuelve una lectura válida, `showReadingResult()` la envía a `riveController.playReading()`. La misma instancia Rive creada al inicio se reinicia para la nueva secuencia, recibe la lectura y permanece detrás del diálogo. El controller traduce únicamente los campos visuales necesarios; no selecciona cartas, interpreta significados ni decide curses. `renderReading()` controla el texto HTML y la narrativa del modal.

El controller implementado está en `web/rive-controller.js`, junto a `web/main.js`; el canvas de fondo y su contenedor están en `index.html`. `initialize()` carga la escena una vez al iniciar la página; `playReading()` actualiza el View Model y reproduce el reveal en esa instancia; `reset()` vuelve al estado inicial sin limpiar el canvas. Así, el puente pertenece al runtime de la aplicación y no crea una dependencia del Tarot Engine con Rive.

## Rive Controller Implementado

El controller debe adaptar el modelo que el engine ya devuelve a un contrato visual estable. Es preferible enviar la lectura completa en lugar de un `setCard()` aislado, porque el engine genera exactamente tres cartas en una sola operación.

API conceptual:

```js
const riveController = createRiveController({
  canvas,
  onComplete: () => revealReadingDetails(),
});

await riveController.playReading(reading);
riveController.reset();
```

- `playReading(reading)` valida y ordena `reading.cards` por posición, asigna las 3 imágenes y los flags `isCursed`, y dispara `startReveal`. El nombre de archivo `major_00`–`major_21` se mapea a `/myproject/{n}.png`.
- `onComplete` recibe el evento `ReadingComplete` y libera la presentación HTML de cartas y narrativa.
- `reset()` invalida cualquier carga anterior, elimina listener e instancia Rive y libera las imágenes; se invoca al iniciar una nueva lectura o salir del diálogo.
- El método `destroy()` no está expuesto; actualmente la limpieza explícita necesaria para el ciclo de la UI se ofrece con `reset()`.
- `setExpression("possessed")` no corresponde al contrato actual. En el futuro, una expresión podría derivarse de `isCursed`, pero “cursed” y “possessed” son conceptos diferentes hasta que producto/engine defina esa semántica.

La integración no requiere cambiar la firma de `createReading()` ni mover lógica al `.riv`.

## Rive Responsibilities

### Debe vivir en Rive

- Ilustración, composición, movimiento y expresiones visuales.
- Reverso y frente de carta, giro/revelado, transiciones y efectos de curse.
- Animaciones de entrada, espera/idle y salida o limpieza visual.
- Reglas de transición puramente visuales dentro de su State Machine.
- Sincronía interna de etapas de animación y señales visuales consumibles por el controller.
- Opcionalmente, representación de las tres posiciones en una escena adaptable al tamaño del canvas.

No se observa una mascota, gato ni ilustración de cartas en la UI actual, así que no conviene asumirlos como contenido requerido del `.riv`. Si la escena Rive dibuja nombres o textos de carta, esos textos deben recibir valores de JavaScript mediante propiedades enlazadas; Rive no debe inventar ni seleccionar cartas.

## JavaScript Responsibilities

### Debe permanecer en JavaScript

- Carga y validación de JSON.
- Selección aleatoria de cartas y posiciones.
- Reglas de curses y compatibilidad.
- Contexto, significados, relaciones, narrativa y resultado de la lectura.
- Estado de aplicación: contexto elegido, lectura vigente, errores, carga, accesibilidad, modales y navegación.
- Decidir cuándo iniciar/cancelar una presentación visual y qué hacer si Rive no carga.
- Renderizar la narrativa textual y conservar controles HTML accesibles.

Rive puede mostrar que una carta está cursed, pero `isCursed` y `curseCount` deben proceder de la lectura. Rive no debe calcular curse count, alterar la lectura ni convertirse en una fuente de verdad de estado del producto.

## State Machine Actual

```text
Artboard: Escene
State Machine: ReadingExperience

Reveal idle
  → Revealing past normal/cursed
  → Revealing present normal/cursed
  → Revealing future normal/cursed
  → Reveal complete
  → ReadingComplete (evento)

View Model Reading:
  - pastFace / presentFace / futureFace (AssetImage)
  - pastCursed / presentCursed / futureCursed (boolean)
```

Esta secuencia es una presentación, no un cambio al flujo de datos: las tres cartas llegan juntas desde el engine y Rive las anima en orden. El arte del estado cursed no equivale a un estado `Possessed` de producto.

La máquina debe seguir siendo visual. JavaScript conserva la lectura durante toda la secuencia; la State Machine no debe ser el lugar que determina qué carta viene después o si la lectura es válida.

## Inputs

### Contrato actual y evolución recomendada

La escena ya usa Data Binding para sus tres imágenes y flags cursed. Sin embargo, el inicio de la secuencia todavía usa el trigger legacy `startReveal` y la finalización usa el evento legacy `ReadingComplete`, escuchado por el runtime. Funcionan con el runtime fijado, aunque generan avisos de deprecación; conviene migrarlos a propiedades/eventos Data Binding antes de actualizar el runtime.

Propiedades candidatas:

| Propiedad del View Model | Tipo conceptual | Fuente |
|---|---|---|
| `pastFace`, `presentFace`, `futureFace` | AssetImage | Imagen de carta derivada de `reading.cards[].cardId` según posición |
| `pastCursed`, `presentCursed`, `futureCursed` | boolean | `reading.cards[].isCursed` |

Los 22 IDs `major_00`–`major_21` se mapean a los 22 PNG existentes; el controller asigna el wrapper de imagen decodificado a cada propiedad `AssetImage`.

### Señal de vuelta a JavaScript

No hace falta que Rive notifique nada para que el Tarot Engine genere la lectura. Actualmente, el controller escucha `ReadingComplete` para mostrar el contenido HTML que ya estaba preparado. Esa señal solo informa que la animación terminó; no significa que una regla de Tarot haya ocurrido.

La API exacta de creación/observación de View Models debe verificarse contra la versión fijada del runtime y el asset final durante la implementación.

## Event Flow

### Flujo web actual y presentación animada

```text
Usuario pulsa “Start your reading” (HTML)
  ↓
JavaScript: handleStartReading()
  ↓
Tarot Engine: createReading({ context, data })
  ↓
JavaScript conserva el reading devuelto
  └── showReadingResult(reading) prepara HTML, cierra el diálogo y llama
      riveController.playReading(reading)
        ↓
      View Model Reading actualizado en Rive
        ↓
      State Machine anima past → present → future automáticamente
        ↓
      Rive emite ReadingComplete
        ↓
      JavaScript muestra cartas y narrativa HTML
```

JavaScript crea y conserva el resultado antes de animarlo. Si Rive falla, la lectura HTML queda disponible inmediatamente y el error se muestra en la UI.

### Selección de context

```text
Click context HTML
  ↓
JavaScript cambia selectedContext y accesibilidad
  ↓
Opcional: enviar context a Rive para una reacción puramente ambiental
```

No se debe crear una lectura ni iniciar la animación de draw al seleccionar el contexto, porque el código actual solo actualiza la selección.

### Animación terminada → contenido HTML

Los diálogos web de introducción, tema y lectura ya existen y JavaScript controla su navegación. La escena Rive se carga una vez como capa fija de fondo; introducción y tema se superponen a ella. Al iniciar una lectura, JavaScript cierra los diálogos y actualiza esa misma escena para que el reveal quede despejado; al recibir `ReadingComplete`, muestra las cartas y narrativa HTML y abre el modal de lectura. Rive no controla la navegación.

Los botones principales deberían continuar siendo HTML accesible. Si se añade un botón interactivo dibujado dentro de Rive, su activación debe emitir una intención que JavaScript valide y traduzca a una acción real de aplicación.

## Navegación y modales

La aplicación sigue siendo una sola página y no usa router. Sus tres pasos se implementan con diálogos nativos y una función `openDialog()`.

- **Controla JavaScript:** controles, estado de pantalla, modal, foco/accesibilidad, navegación, acciones del usuario, cuándo despejar la escena durante el reveal y fallos.
- **Controla Rive:** escena de fondo persistente y animación visual iniciada por el estado/acción de JavaScript.
- **JavaScript → Rive:** enviar datos ya resueltos y órdenes de presentación (`presentReading`, context, limpiar).
- **Rive → JavaScript:** solo una notificación de UX (por ejemplo, visual complete) cuando el producto necesite sincronizar una acción externa con el final de una animación.

No conviene que la app espere a Rive para calcular una lectura; tampoco conviene abrir automáticamente un modal por un evento interno de Rive si el estado de aplicación no lo espera.

## Rive Runtime

### Estado actual

- La aplicación usa `@rive-app/canvas@2.44.2`, cargado desde `node_modules`; no hay bundler. El canvas está fijo detrás de los modales y la instancia se inicializa al cargar la página.
- El asset servido es [`web/assets/reading-scene.riv`](./web/assets/reading-scene.riv), generado desde [`myproject/scene.rml`](./myproject/scene.rml). El proyecto anterior [`thecursedarcanav1/`](./thecursedarcanav1/) es independiente y no forma parte del flujo.
- El controller inicializa una instancia con artboard `Escene`, State Machine `ReadingExperience`, el View Model `Reading` y `autoBind`; al iniciar una lectura carga las caras PNG y actualiza sus propiedades. Al resetear reinicia la máquina y libera las imágenes, pero conserva la instancia y el canvas de fondo.
- El servidor local [`server.js`](./server.js) sirve el runtime y asigna MIME types de `.riv` y `.wasm`.
- El asset local compila y se carga, pero tres shaders ambientales sin firma se omiten desde el runtime web. Para recuperarlos, se necesita una exportación/build firmado desde Rive Studio; no se ha subido ningún archivo a una cuenta de Rive.
- El runtime informa de deprecación por `StateMachineTrigger` y `RiveEvent`. La escena funciona con la versión fijada, pero debe migrarse a la API de Data Binding antes de actualizarla.

La documentación web oficial muestra las opciones de `canvas`, `src`, `artboard`, `stateMachine`, `onLoad` y carga/limpieza en [Getting Started](https://rive.app/docs/runtimes/web/web-js), [Rive Parameters](https://rive.app/docs/runtimes/web/rive-parameters), [State Machine Playback](https://rive.app/docs/runtimes/web/state-machines) y [Loading Assets](https://rive.app/docs/runtimes/web/loading-assets).

## Compatibilidad con la arquitectura

La arquitectura actual implementa `Tarot Engine → controller → runtime → .riv` sin reescribir el engine:

- `createReading()` ya entrega las tres cartas ordenadas, identificadores estables, curse por carta y nivel de curse.
- El controller puede consumir el resultado existente y mapearlo a propiedades visuales.
- La UI puede seguir usando `renderReading()` para texto y accesibilidad.

Pendientes fuera del engine:

- Usar/exportar desde Rive Studio una versión firmada del asset si se necesitan los tres shaders ambientales en la web.
- Migrar el trigger `startReveal` y el evento `ReadingComplete` a Data Binding para retirar las advertencias de deprecación.
- Opcionalmente, separar los estados/animaciones de espera que ya no se usan en la secuencia automática.

No se observa un bloqueo arquitectónico. La principal precaución es mantener la UI y el engine como fuentes de verdad y no tratar `isCursed` como `isPossessed`.

## Recommended File Structure

Estructura actual:

```text
web/
  main.js                    orquestación DOM y lectura
  rive-controller.js         traducción lectura ↔ propiedades Rive
  components/                solo si la UI crece y se extraen componentes
index.html                   canvas y estructura accesible
src/tarot/                   Tarot Engine actual, sin dependencia de Rive
web/assets/
  reading-scene.riv          asset consumido por el runtime web
thecursedarcanav1/
  ...                        proyecto anterior independiente
myproject/
  scene.rml                  fuente Rive de autoría
```

La aplicación conserva la estructura del servidor estático actual; la ruta del asset es servible por HTTP.

## Implementation Plan

1. **Cerrar el contrato visual — preparado:** artboard `Escene`, State Machine `ReadingExperience`, View Model `Reading` con `pastFace`, `presentFace`, `futureFace` y sus booleanos `pastCursed`, `presentCursed`, `futureCursed`. Las caras disponibles son los 22 assets `major_00`–`major_21`.
2. **Preparar el asset Rive — implementado:** composición de las tres posiciones, animaciones normal/cursed y transiciones automáticas entre cartas, con los eventos de revelación y fin.
3. **Elegir el runtime y carga — implementado:** dependencia oficial `@rive-app/canvas` fijada y asset `.riv` servido desde `web/assets/myproject.riv`; la escena se carga en un canvas fijo de fondo con `enableGPUCanvas: true`.
4. **Añadir el controller — implementado:** `web/rive-controller.js` inicializa y conserva la escena, mapea `reading.cards` por posición, asigna imágenes y estados cursed, dispara `startReveal`, observa `ReadingComplete` y libera imágenes sin desmontar la instancia.
5. **Conectar la web — implementado:** `handleStartReading()` envía la lectura generada al controller sin mover reglas del Tarot fuera del engine.
6. **Sincronizar UX — implementado:** la escena queda visible de fondo durante introducción y selección. Durante el reveal se cierran los diálogos; al terminar de colocar las cartas se abre el modal con los detalles y la narrativa. Si el reveal falla, el modal se abre con la lectura HTML y el error.
7. **Validar — implementado:** 17 pruebas pasan; `rive . --verify` y `rive inspect . --summary` terminan sin problemas estructurales; el flujo automático se verificó en navegador, incluida una lectura nueva. Los tres shaders están integrados y renderizados en el build local y en el asset servido; el runtime web informa que sus firmas no se verifican, por lo que falta publicar/exportar una versión firmada desde Rive.

## Fuentes de Rive consultadas

- [Rive Web JS runtime](https://rive.app/docs/runtimes/web/web-js)
- [Rive Parameters](https://rive.app/docs/runtimes/web/rive-parameters)
- [State Machine Playback](https://rive.app/docs/runtimes/web/state-machines)
- [Data Binding](https://rive.app/docs/runtimes/web/data-binding)
- [Migration Guide: State Machine Inputs and runtime Events → Data Binding](https://rive.app/docs/editor/data-binding/migration-guide)
- [Events Overview](https://rive.app/docs/editor/events/overview)

## Estado actual del prototipo Rive

- Proyecto fuente: [`myproject/scene.rml`](./myproject/scene.rml); artboard exportable `Escene` (1280×832).
- La State Machine `ReadingExperience` recibe `startReveal`, anima las ramas normal/cursed para las posiciones past, present y future en secuencia automática y emite `ReadingComplete`.
- Cada carta aparece grande en el centro, se revela allí y luego viaja a su posición final en la mesa; la siguiente repite el recorrido. La fila final coincide con las tres posiciones de la composición de referencia.
- Cada posición de carta incluye una sombra lavanda (normal) o rosa (cursed), construida con ocho rectángulos redondeados de opacidad decreciente. Los grupos heredan el movimiento, escala, giro y visibilidad de las cartas; se dibujan debajo de ellas y también permanecen en el export web.
- La fuente local conserva shaders para la vela, el cristal, el ambiente, el aura de posesión y el glitch. El export web conserva las sombras de carta nativas y sus timelines, y elimina shaders/scripts no firmados.
- El View Model `Reading` contiene tres imágenes de carta (`pastFace`, `presentFace`, `futureFace`) y tres flags booleanos (`pastCursed`, `presentCursed`, `futureCursed`). Las 22 caras PNG (`0.png`–`21.png`) corresponden con `major_00`–`major_21` del engine.
- En la app, `web/rive-controller.js` escucha `ReadingRequested`, carga las caras de la lectura, asigna los flags cursed y dispara la máquina. `web/main.js` genera la lectura y muestra el resultado HTML al recibir `ReadingComplete`; después de cerrar el diálogo, otro clic en la mesa solicita una nueva lectura.
- La web pide el tema y la primera lectura mediante la interfaz existente. En el preview Rive independiente, el clic reproduce las cartas de muestra del View Model local.
- `rive . --verify` y `rive inspect . --summary` validan la fuente, sus scripts locales, las 22 animaciones y la máquina de estados. `python3 myproject/export-web.py` regenera el asset web sin shader scripts. `npm test` cubre el mapeo de lecturas a Rive; el flujo web también se validó en el navegador con la lectura completa y un segundo inicio desde la escena.
- El asset web en `web/assets/myproject.riv` es el export shader-free; el build local en `myproject/build/myproject.riv` conserva los scripts para la previsualización en Rive. No se ha publicado ningún asset a una cuenta de Rive.
- La versión fijada del runtime aún advierte que `StateMachineTrigger` y `RiveEvent` son API legacy; el flujo funciona y la migración a Data Binding queda como mantenimiento futuro.
