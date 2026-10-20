#!/usr/bin/env python3
"""Synthesizes the background music and sound effects into public/audio/.

Everything is generated from numpy waveforms, so the audio has no licence of its own.
Run it from video/: python3 scripts/make-audio.py (needs numpy and ffmpeg).
"""

import pathlib
import subprocess
import wave

import numpy as np

RATE = 44100
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'audio'
rng = np.random.default_rng(7)


def t_of(seconds):
    return np.arange(int(seconds * RATE)) / RATE


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * RATE), int(release * RATE)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def lowpass(x, cutoff):
    # One-pole low-pass, run forward and backward for no phase shift.
    a = np.exp(-2 * np.pi * cutoff / RATE)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc = (1 - a) * v + a * acc
            y[i] = acc
        x = y[::-1]
    return x


def write(name, left, right=None):
    right = left if right is None else right
    stereo = np.stack([left, right], axis=1)
    stereo /= max(1e-9, np.abs(stereo).max()) / 0.89
    pcm = (stereo * 32767).astype('<i2')
    wav = OUT / f'{name}.wav'
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    subprocess.run(
        ['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-b:a', '160k', str(OUT / f'{name}.mp3')], check=True
    )
    wav.unlink()


# ---- music ------------------------------------------------------------------

BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
# Dmaj9, Bm9, Gmaj9, A6/9: two bars each.
CHORDS = [
    [50, 57, 61, 64, 66],
    [47, 54, 57, 61, 62],
    [43, 50, 54, 57, 59],
    [45, 52, 57, 59, 61],
]


def pad_voice(freq, seconds):
    t = t_of(seconds)
    x = np.zeros_like(t)
    for detune in (-0.12, 0.0, 0.11):
        f = freq * 2 ** (detune / 12)
        for k, amp in ((1, 1.0), (2, 0.35), (3, 0.18), (4, 0.08)):
            x += amp * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28))
    return x * env(len(t), 1.2, 1.4)


def pluck(freq, seconds=0.9):
    t = t_of(seconds)
    x = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t) + 0.1 * np.sin(2 * np.pi * 3 * freq * t)
    return x * np.exp(-t * 6) * env(len(t), 0.004, 0.05)


def kick():
    t = t_of(0.35)
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * 9)


def hat():
    t = t_of(0.06)
    n = rng.standard_normal(len(t))
    n = n - lowpass(n, 6000)
    return n * np.exp(-t * 70)


def add(track, sound, at, gain=1.0):
    i = int(at * RATE)
    j = min(len(track), i + len(sound))
    if i < len(track):
        track[i:j] += gain * sound[: j - i]


def music(seconds):
    n = int(seconds * RATE)
    pad, bass, arp_l, arp_r, drums = (np.zeros(n) for _ in range(5))
    bars = int(np.ceil(seconds / BAR))
    for bar in range(0, bars, 2):
        chord = CHORDS[(bar // 2) % len(CHORDS)]
        start = bar * BAR
        for note in chord[1:]:
            add(pad, pad_voice(hz(note), 2 * BAR + 0.8), start, 0.18)
        for beat in range(8):
            when = start + beat * BEAT
            if beat % 4 in (0, 2):
                add(bass, pluck(hz(chord[0] - 12), 1.2), when, 0.9)
        if bar >= 2:
            arp = chord[1:] + [chord[2] + 12]
            for step in range(16):
                note = arp[(step * 3) % len(arp)] + 12
                when = start + step * BEAT / 2
                add(arp_l, pluck(hz(note)), when, 0.22)
                add(arp_r, pluck(hz(note)), when + 0.18, 0.12)  # a short echo on the right
        if bar >= 4:
            for beat in range(8):
                add(drums, kick(), start + beat * BEAT, 0.55)
                add(drums, hat(), start + beat * BEAT + BEAT / 2, 0.12)
    pad = lowpass(pad, 1800)
    left = pad + bass * 0.5 + arp_l + drums
    right = pad + bass * 0.5 + arp_r + drums
    fade = env(n, 1.5, 4.0)
    return left * fade, right * fade


# ---- sound effects ----------------------------------------------------------


def click():
    t = t_of(0.05)
    return rng.standard_normal(len(t)) * np.exp(-t * 180) + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 120)


def whoosh():
    t = t_of(0.6)
    n = rng.standard_normal(len(t))
    sweep = np.sin(np.pi * t / t[-1]) ** 2
    return (lowpass(n, 900) * 4 + (n - lowpass(n, 3000)) * 0.15) * sweep


def ding():
    t = t_of(1.4)
    x = sum(a * np.sin(2 * np.pi * hz(m) * t) for m, a in ((86, 1.0), (93, 0.5), (98, 0.25)))
    return x * np.exp(-t * 4) * env(len(t), 0.003, 0.1)


def pop():
    t = t_of(0.12)
    f = 400 + 900 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * 30)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    write('music', *music(80))
    write('click', click())
    write('whoosh', whoosh())
    write('ding', ding())
    write('pop', pop())
