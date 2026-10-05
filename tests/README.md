# Pruebas end-to-end

Prueban cada control de la interfaz con clics y arrastres reales en Chromium, miden el audio
(niveles de master, EQ, crossfader, FX, key lock, scratch, auriculares…) y simulan una
controladora MIDI con LEDs.

    npm i playwright && npx playwright install chromium
    python3 tests/gen_audio.py        # crea las pistas de prueba
    ./serve.sh &                      # servidor en :8765
    node tests/suite.mjs              # interfaz, mezclador, FX, grabación, prefs, MIDI
    node tests/suite2.mjs             # importación, auriculares, scratch, key lock, MIDI avanzado
