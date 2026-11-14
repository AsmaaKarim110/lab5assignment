"""Synthesize an 80-second nature soundscape: wind in trees, a stream, birdsong.
No music: only noise-based textures and bird-like tonal calls.
Writes stems + full mix as MP3, short click-to-hear bird calls, and the
envelope/event data the web page uses to sync its visuals.
"""
import json, os, subprocess, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
DUR = 80.0
N = int(SR * DUR)
OUT = sys.argv[1]
TMP = sys.argv[2]
rng = np.random.default_rng(2026)
t = np.arange(N) / SR


def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")

def bp(x, lo, hi, o=2): return signal.sosfilt(sos("band", [lo, hi], o), x)
def lp(x, f, o=2): return signal.sosfilt(sos("low", f, o), x)
def hp(x, f, o=2): return signal.sosfilt(sos("high", f, o), x)

def white(): return rng.standard_normal(N)

def slow(cutoff):
    """Smooth random curve (zero mean, unit std) varying at about `cutoff` Hz."""
    fs_lo = max(100, int(cutoff * 20))
    n = int(DUR * fs_lo) + 2
    y = signal.sosfilt(signal.butter(2, cutoff, "low", fs=fs_lo, output="sos"), rng.standard_normal(n))
    y = (y - y.mean()) / y.std()
    return np.interp(t, np.arange(n) / fs_lo, y)

def rms_scale(x, target):
    return x * (target / np.sqrt(np.mean(x ** 2)))


# ---------------------------------------------------------------- wind
gust = 0.5 + 0.5 * np.tanh(1.3 * slow(0.10))
arc = 0.75 + 0.25 * np.sin(np.pi * t / DUR)
gust = np.clip(gust * arc, 0, 1)
flutter = np.clip(0.6 + 0.5 * slow(5.0), 0, None)

def wind_channel():
    low = bp(white(), 120, 650) * (0.25 + 0.75 * gust)
    mid = bp(white(), 600, 2200) * (0.10 + 0.90 * gust ** 1.5)
    rustle = bp(white(), 2500, 7500) * (gust ** 2) * flutter
    return low + 0.40 * mid + 0.22 * rustle

wind = np.stack([wind_channel(), wind_channel()], axis=1)
wind = rms_scale(wind, 0.050)
wind = 0.20 * np.tanh(wind / 0.20)   # soft-limit rare gust peaks
wind = rms_scale(wind, 0.050)


# ---------------------------------------------------------------- water
level = np.clip(0.88 + 0.12 * slow(0.2), 0.6, 1.2)

def water_bed():
    bed = 0.35 * bp(white(), 350, 3800) + 0.08 * bp(white(), 3800, 9000) + 0.6 * lp(white(), 250)
    return bed * level

waterL, waterR = water_bed(), water_bed()
for _ in range(int(DUR * 55)):
    start = rng.integers(0, N - int(SR * 0.08))
    d = int(SR * rng.uniform(0.015, 0.06))
    tt = np.arange(d) / SR
    f0 = rng.uniform(500, 2600)
    k = rng.uniform(1.2, 2.2)
    f = f0 * (1 + (k - 1) * tt / tt[-1])
    ph = 2 * np.pi * np.cumsum(f) / SR
    b = rng.uniform(0.04, 0.22) * np.sin(ph) * np.exp(-tt * rng.uniform(60, 140))
    a = rng.uniform(0, np.pi / 2)
    waterL[start:start + d] += b * np.cos(a) * level[start]
    waterR[start:start + d] += b * np.sin(a) * level[start]
water = rms_scale(np.stack([waterL, waterR], axis=1), 0.045)


# ---------------------------------------------------------------- birds
def note(fcurve, harm=((1, 1.0), (2, 0.22), (3, 0.06)), env=None):
    ph = 2 * np.pi * np.cumsum(fcurve) / SR
    y = sum(a * np.sin(h * ph) for h, a in harm)
    if env is None:
        env = np.hanning(len(y)) ** 0.8
    return y * env

def call_tweet(r):
    f0 = r.uniform(3200, 4300)
    out = []
    for _ in range(int(r.integers(3, 7))):
        d = int(SR * r.uniform(0.06, 0.11))
        u = np.linspace(0, 1, d)
        f = f0 * (1 + 0.25 * u ** 1.2) * (1 + 0.01 * np.sin(2 * np.pi * 40 * u * d / SR))
        out += [note(f), np.zeros(int(SR * r.uniform(0.05, 0.11)))]
    return np.concatenate(out)

def call_whistle(r):
    f0 = r.uniform(3300, 3900)
    parts = []
    for i, drop in enumerate((0.09, 0.14)):
        d = int(SR * r.uniform(0.32, 0.40))
        u = np.linspace(0, 1, d)
        start = f0 if i == 0 else f0 * 0.89
        f = start * (1 - drop * u)
        parts += [note(f, harm=((1, 1.0), (2, 0.12)), env=np.sin(np.pi * u) ** 0.7),
                  np.zeros(int(SR * 0.09))]
    return np.concatenate(parts)

def call_warble(r):
    d = int(SR * r.uniform(1.2, 1.7))
    tt = np.arange(d) / SR
    f0 = r.uniform(2800, 3400)
    walk = np.cumsum(r.standard_normal(d)) / np.sqrt(d) * 80
    f = (f0 + 500 * np.sin(2 * np.pi * 5 * tt)
         + 700 * np.sin(2 * np.pi * 11 * tt) * np.sin(2 * np.pi * 1.3 * tt) ** 2 + walk)
    gate = (0.5 + 0.5 * np.sin(2 * np.pi * 6 * tt + r.uniform(0, 6))) ** 0.5
    return note(f, env=gate * np.hanning(d))

def call_trill(r):
    d = int(SR * r.uniform(0.6, 0.85))
    tt = np.arange(d) / SR
    u = tt / tt[-1]
    f = 4800 - 900 * u
    gate = (0.5 + 0.5 * np.sin(2 * np.pi * 26 * tt)) ** 1.5
    return note(f, env=gate * np.hanning(d))

def call_coo(r):
    parts = []
    for dur in (0.45, 0.30, 0.30, 0.75):
        d = int(SR * dur)
        u = np.linspace(0, 1, d)
        f = 430 - 50 * u
        parts += [note(f, harm=((1, 1.0), (2, 0.35), (3, 0.12)), env=np.sin(np.pi * u) ** 0.9),
                  np.zeros(int(SR * 0.16))]
    return lp(np.concatenate(parts), 1500)

KINDS = {"tweet": call_tweet, "whistle": call_whistle, "warble": call_warble,
         "trill": call_trill, "coo": call_coo}

# Schedule: sparse at the start, busiest around the middle, sparse again, quiet at the end.
events, tcur = [], 4.0
while tcur < 74.0:
    rate = 0.12 + 0.28 * np.exp(-(((tcur - 42) / 16) ** 2))
    tcur += max(1.0, rng.exponential(1.0 / rate))
    if tcur < 74.0:
        events.append(tcur)

names = list(KINDS)
probs = [0.30, 0.20, 0.20, 0.15, 0.15]
birds = np.zeros((N, 2))
event_info = []
for et in events:
    kind = str(rng.choice(names, p=probs))
    dist = float(rng.uniform(0.75, 0.9)) if kind == "coo" else float(rng.uniform(0.1, 0.75))
    x = float(rng.uniform(0.08, 0.92))
    y = KINDS[kind](rng)
    y = lp(y, 9000 - 6000 * dist) * (1 - 0.55 * dist) * rng.uniform(0.7, 1.0) * 0.36
    s = int(et * SR)
    e = min(N, s + len(y))
    ang = x * np.pi / 2
    birds[s:e, 0] += y[:e - s] * np.cos(ang)
    birds[s:e, 1] += y[:e - s] * np.sin(ang)
    event_info.append({"t": round(et, 2), "dur": round(len(y) / SR, 2), "kind": kind,
                       "x": round(x, 2), "dist": round(dist, 2)})

# Soft reverb: a different decaying-noise impulse response per channel.
for ch in range(2):
    L = int(SR * 0.7)
    ir = rng.standard_normal(L) * np.exp(-np.arange(L) / SR / 0.18)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = signal.fftconvolve(birds[:, ch], ir)[:N]
    birds[:, ch] = birds[:, ch] + 0.28 * wet


# ---------------------------------------------------------------- mix
fade = np.clip(t / 3.0, 0, 1)
fade = np.sin(fade * np.pi / 2) ** 2
tail = np.clip((DUR - t) / 5.0, 0, 1)
tail = np.sin(tail * np.pi / 2) ** 2
master = (fade * tail)[:, None]

stems = {"wind": wind, "water": water, "birds": birds}
for k in stems:
    stems[k] = hp(stems[k], 20, 1, ) if False else signal.sosfilt(sos("high", 20, 2), stems[k], axis=0)
    stems[k] = stems[k] * master

mix = sum(stems.values())
gain = 0.89 / np.max(np.abs(mix))
for k in stems:
    stems[k] = stems[k] * gain
mix = mix * gain
print("global gain", round(float(gain), 3), "mix peak", round(float(np.max(np.abs(mix))), 3))


def write_mp3(name, data, bitrate):
    wav = os.path.join(TMP, name + ".wav")
    wavfile.write(wav, SR, (np.clip(data, -1, 1) * 32767).astype(np.int16))
    mp3 = os.path.join(OUT, "audio", name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libmp3lame",
                    "-b:a", bitrate, mp3], check=True)
    return mp3

write_mp3("soundscape", mix, "160k")
for k, v in stems.items():
    write_mp3(k, v, "128k")

# Short click-to-hear calls for the page (mono).
for i, (kind, seed) in enumerate((("tweet", 11), ("whistle", 12), ("trill", 13)), start=1):
    r = np.random.default_rng(seed)
    y = lp(KINDS[kind](r), 9000)
    y = y / np.max(np.abs(y)) * 0.8
    y = np.concatenate([y, np.zeros(int(SR * 0.2))])
    wav = os.path.join(TMP, f"chirp{i}.wav")
    wavfile.write(wav, SR, (y * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libmp3lame",
                    "-b:a", "96k", os.path.join(OUT, "audio", f"chirp{i}.mp3")], check=True)


# ---------------------------------------------------------------- data for the page
FPS = 20
frame = SR // FPS
def envelope(x, floor_pct=3, top_pct=97):
    m = x.mean(axis=1)
    n = len(m) // frame
    r = np.sqrt((m[:n * frame].reshape(n, frame) ** 2).mean(axis=1))
    lo, hi = np.percentile(r, floor_pct), np.percentile(r, top_pct)
    v = np.clip((r - lo) / (hi - lo + 1e-9), 0, 1)
    v = np.convolve(v, [0.25, 0.5, 0.25], mode="same")
    return [round(float(a), 3) for a in v]

data = {
    "duration": DUR, "fps": FPS,
    "wind": envelope(stems["wind"]),
    "water": envelope(stems["water"]),
    "birds": envelope(stems["birds"], 0, 98),
    "events": event_info,
}
with open(os.path.join(OUT, "soundscape-data.js"), "w") as fh:
    fh.write("// Generated by make_soundscape.py: loudness envelopes and bird-call times.\n")
    fh.write("window.SOUNDSCAPE = " + json.dumps(data, separators=(",", ":")) + ";\n")

# Spectrogram for a quick visual check.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(12, 4))
ax.specgram(mix.mean(axis=1), NFFT=2048, Fs=SR, noverlap=1024, cmap="magma", vmin=-130, vmax=-60)
ax.set_ylim(0, 9000); ax.set_xlabel("seconds"); ax.set_ylabel("Hz")
fig.tight_layout(); fig.savefig(os.path.join(TMP, "spectrogram.png"), dpi=90)

print("bird events:", len(event_info), {k: sum(e['kind'] == k for e in event_info) for k in names})
for k, v in stems.items():
    print(k, "peak", round(float(np.max(np.abs(v))), 3), "rms", round(float(np.sqrt(np.mean(v ** 2))), 4))
