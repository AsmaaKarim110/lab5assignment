# The Listening Grove

Part A (soundscape) and Part B (visualscape) in one folder.

## Run it
Open `index.html` in Chrome, Edge, Firefox or Safari. No server or install is needed.
Keep the folder structure as it is (`audio/`, `soundscape-data.js`, `styles.css`, `script.js`).

## What is in here
| File | Purpose |
| --- | --- |
| `index.html` | Page structure, media controls, three `<audio>` elements, optional `<video>` |
| `styles.css` | All styling (external stylesheet) |
| `script.js` | Playback sync, canvas scene, interactions (external script) |
| `soundscape-data.js` | Loudness of each layer over time and the moment of every bird call |
| `audio/soundscape.mp3` | The finished 80-second mix (Part A) |
| `audio/wind.mp3`, `water.mp3`, `birds.mp3` | The three layers, played together by the page |
| `audio/chirp1-3.mp3` | Short calls for clicking a bird |
| `tools/make_soundscape.py` | Script that generated all the audio and `soundscape-data.js` |

## The sound
Wind in the trees, a stream and birds. No music. All of it is synthesized (filtered noise
for wind and water, tonal calls for the birds), so there are no third-party samples and
no licences to credit.

## Using real recordings or footage
- **Footage:** save a clip from Pexels as `media/forest.mp4`, or use the "Use your own footage"
  button on the page. The illustration becomes a layer over the video, and the video's speed,
  brightness and saturation follow the sound.
- **Recordings:** replace `audio/wind.mp3`, `water.mp3` and `birds.mp3` with equal-length
  recordings (for example from Freesound) and credit them. Replace `soundscape-data.js`
  with data measured from your files, otherwise the visuals will follow the old sound.

## Regenerating the audio
Needs Python 3 with numpy, scipy, matplotlib and ffmpeg:

    python3 tools/make_soundscape.py <output-folder> <scratch-folder>

Fonts (Fraunces, Inter) load from Google Fonts. Without a connection the page falls back
to Georgia and system fonts.
