#!/usr/bin/env python3
"""Speaks src/script.json with Kokoro (https://github.com/hexgrad/kokoro, Apache-2.0).

Writes public/voiceover/<lang>/<id>.mp3 and the length of each line to src/voiceover.json.
Needs Python 3.10 to 3.12 with `pip install "kokoro>=0.9.4" "misaki[zh,en]" soundfile`, and ffmpeg.
Run it from video/: python scripts/voiceover.py
"""

import json
import pathlib
import subprocess

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = pathlib.Path(__file__).resolve().parent.parent
RATE = 24000
VOICES = {'zh': 'zm_029', 'en': 'am_michael'}

english = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
# The Chinese model reads the English words in a Chinese line with its own English voice.
english_zh = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M-v1.1-zh')
chinese = KPipeline(
    lang_code='z',
    repo_id='hexgrad/Kokoro-82M-v1.1-zh',
    en_callable=lambda text: next(english_zh(text, voice='af_maple')).phonemes,
)
pipelines = {'zh': chinese, 'en': english}

lengths = {}
for lang, pipeline in pipelines.items():
    out = ROOT / 'public' / 'voiceover' / lang
    out.mkdir(parents=True, exist_ok=True)
    lengths[lang] = {}
    for line in json.loads((ROOT / 'src' / 'script.json').read_text()):
        audio = np.concatenate([r.audio.numpy() for r in pipeline(line[lang], voice=VOICES[lang])])
        wav = out / f"{line['id']}.wav"
        sf.write(wav, audio, RATE)
        subprocess.run(
            ['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-b:a', '128k', out / f"{line['id']}.mp3"], check=True
        )
        wav.unlink()
        lengths[lang][line['id']] = round(len(audio) / RATE, 2)
        print(lang, line['id'], lengths[lang][line['id']])

(ROOT / 'src' / 'voiceover.json').write_text(json.dumps(lengths, indent=2) + '\n')
