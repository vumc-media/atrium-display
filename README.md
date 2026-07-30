# Atrium vMix Overlay

A fixed 1920×1080 browser overlay for Versailles United Methodist Church.

## What it includes

- One welcome message
- Sunday service countdown
- Local time and date
- Versailles weather
- Embedded Welcome Center feed
- Planning Center ICS events
- Transparent live-video opening for PP7/NDI in vMix
- VUMC Connect QR code
- Scrolling ticker

## GitHub setup

1. Add a repository secret named `ICS_URL`.
2. Paste the public Planning Center calendar `.ics` URL into that secret.
3. Push to `main`.
4. The workflow builds and commits `index.html`.

## vMix setup

Add the deployed page as a Browser input:

- Width: 1920
- Height: 1080
- Zoom: 100%

Place the PP7 NDI input below the Browser input in a vMix virtual input or multiview. The large center opening is transparent.

## Local build

```bash
ICS_URL="https://example.com/calendar.ics" npm run build
```
