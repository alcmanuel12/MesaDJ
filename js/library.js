/* Biblioteca temporal: los archivos arrastrados viven solo en memoria mientras la página está abierta. */
(function () {
  const FILES = new Map(); // id -> File (solo en memoria; se pierde al recargar)
  let nextId = 1;

  const AUDIO_RE = /\.(mp3|wav|flac|ogg|oga|m4a|aac|opus|aif|aiff|webm)$/i;

  function readTags(file) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) return resolve({});
      try {
        window.jsmediatags.read(file, {
          onSuccess: (t) => { const g = t.tags || {}; resolve({ title: g.title, artist: g.artist, bpm: parseFloat(g.TBPM && g.TBPM.data) || null }); },
          onError: () => resolve({}),
        });
      } catch (e) { resolve({}); }
    });
  }

  const Lib = {
    isAudio: (f) => (f.type && f.type.startsWith("audio/")) || AUDIO_RE.test(f.name),

    put() {},
    remove(id) { FILES.delete(id); },
    file(id) { return FILES.get(id); },

    /* Importa un File: lo decodifica y lo analiza. Devuelve los metadatos. */
    async importFile(file, engine, analysis) {
      const buf = await engine.decode(await file.arrayBuffer());
      const [tags, an] = await Promise.all([readTags(file), analysis.analyze(buf)]);
      const base = file.name.replace(/\.[^.]+$/, "");
      let title = tags.title, artist = tags.artist;
      if (!title) { const m = base.match(/^(.+?)\s+-\s+(.+)$/); if (m) { artist = artist || m[1]; title = m[2]; } else title = base; }
      const meta = {
        title, artist: artist || "Desconocido", bpm: an.bpm, firstBeat: an.firstBeat, key: an.key, dur: buf.duration,
        name: file.name, size: file.size, added: Date.now(), cues: { hot: [null, null, null, null, null, null, null, null], mem: [], cuePt: 0 },
      };
      meta.id = nextId++;
      FILES.set(meta.id, file);
      return meta;
    },
  };
  window.DJLibrary = Lib;
})();
