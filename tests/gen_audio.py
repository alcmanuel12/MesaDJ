"""Genera 3 pistas de prueba (kick + tono) con BPM y tonalidad conocidos."""
import wave, math, struct, random, os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio"); os.makedirs(out, exist_ok=True)
def make(name, bpm, dur, notes, sr=22050, seed=1):
    random.seed(seed); spb = 60 / bpm; data = []
    for i in range(int(sr * dur)):
        t = i / sr; ph = t % spb
        kick = math.sin(2*math.pi*(50+110*math.exp(-ph*30))*ph)*math.exp(-ph*9)*0.9
        hh = (random.random()*2-1)*math.exp(-((t+spb/2) % spb)*60)*0.25
        tone = sum(math.sin(2*math.pi*f*t) for f in notes)/len(notes)*0.18
        data.append(max(-1, min(1, kick+hh+tone)))
    w = wave.open(os.path.join(out, name), "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(b"".join(struct.pack("<h", int(v*30000)) for v in data)); w.close()
make("Test A - Aminor 124.wav", 124, 45, [220, 261.63, 329.63])
make("Test B - Cmajor 128.wav", 128, 45, [261.63, 329.63, 392.0])
make("Otro Artista - Lento 100.wav", 100, 30, [196], seed=3)
