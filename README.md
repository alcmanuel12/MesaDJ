# Mesa DJ

Mesa de DJ de 4 decks que funciona en el navegador (Chrome o Edge recomendados).

## Arrancar
    ./serve.sh            # o: python3 -m http.server 8765
    # abre http://localhost:8765/

No funciona abriendo `index.html` con `file://` (hace falta `localhost` para AudioWorklet y MIDI).

## Qué hace
- **Listado temporal**: arrastra canciones o carpetas de tu PC a la zona de arrastre (o usa «Elegir archivos/carpeta»).
  También puedes soltar un archivo directamente sobre un deck y se carga al instante. Se detectan etiquetas ID3, BPM,
  rejilla de compases y tono (Camelot). Nada se guarda: al recargar la página el listado queda vacío.
- **Motor Web Audio**: 4 decks, loops, hot cues y memory cues (por sesión), beat jump, scratch, nudge, brake, roll con slip.
- **Key lock** y modo **Keyboard** reales (pitch-shifter en AudioWorklet).
- **Mezclador**: trim, EQ de 3 bandas, filtro Color, faders, crossfader, VU reales, limitador master.
- **Beat FX** (10 efectos sincronizados al BPM del master) y **FX de pad**; **Sampler** (clic derecho en un pad para cargar tu sonido).
- **Auriculares/cue** en una salida distinta (Preferencias → Auriculares).
- **Grabación** de la mezcla a WAV de 24 bits (se descarga al parar).
- **MIDI learn** (Web MIDI): activa «MIDI learn», pulsa un control en pantalla y mueve el de tu controladora. Se guarda en el navegador.
- Preferencias de búfer y frecuencia de muestreo; selección de dispositivos de salida.

## Controladoras físicas (MIDI)
1. Conecta la controladora **antes** de abrir la página (o pulsa «Reconectar» en Preferencias). Chrome/Edge pedirán permiso MIDI.
2. Pulsa **MIDI learn** (cabecera). Haz clic en un control de la pantalla y mueve/pulsa el de tu controladora: queda asignado.
3. Desactiva MIDI learn y úsala. Las asignaciones se guardan, se pueden borrar una a una, exportar e importar (Preferencias).
4. Encoders y platos: si giran al revés o a saltos, cambia el *modo relativo* en Preferencias (Compl. a 2 / Centro 64 / Signo+magn.).
5. LEDs: los botones asignados a **notas** reciben note-on 127/0 con el mismo número cuando cambia su estado.

Controles asignables: play, cue (mantener = previsualizar), sync, master, key lock, vinyl, loops, memory cues, 8 pads por deck,
modos de pads, rango y fader de pitch, pitch bend ±, plato (giro relativo) y **toque del plato** (scratch), EQ/trim/color/fader/cue de cada canal,
crossfader (CC o pitch-bend 14 bits), master/cue-mix/volumen de auriculares, Beat FX (on, canal, tipo, beats, nivel), sampler, rec,
encoder del navegador (giro y pulsación), Back y Load.

## Límites conocidos
- El BPM/tono detectados son automáticos: usa «BPM ÷2 / ×2» si salen al doble o a la mitad. La rejilla asume tempo constante.
- Sync iguala tempo y alinea la fase al activarse; no corrige derivas después.
- Sin streaming (Beatport, SoundCloud, TIDAL).
- La salida de auriculares usa un segundo dispositivo vía `setSinkId`, con más latencia que la salida master.

## Pruebas
`tests/` contiene comprobaciones automáticas end-to-end (ver `tests/README.md`).

## Estructura
- `index.html`: interfaz y lógica del componente.
- `js/engine.js` audio · `js/analysis.js` onda/BPM/tono · `js/library.js` listado en memoria · `js/midi.js` MIDI · `js/pshift.worklet.js` key lock.
- `support.js`, `vendor/`: runtime del diseño y React (sin CDN).
