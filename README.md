# Islamic Prayer Times

A bar widget for the [Omarchy](https://omarchy.org) Quickshell bar. It shows
Fajr, Dhuhr, Asr, Maghrib and Isha, keeps the current prayer highlighted, and
opens a popup where you can set your city, calculation method and Asr school.

`Vibe-coded with some final human touches`


## Install

```bash
# User verification first
omarchy plugin add https://github.com/ah410/omarchy-islamic-prayer-times.git
```
OR
```bash
# Add and enable it in one go, skipping that review step
omarchy plugin add https://github.com/ah410/omarchy-islamic-prayer-times.git --enable
```

## Usage

Click any prayer in the bar to open the popup. From there you can:

- Click the city name to search for a different one. Pick a suggestion with
  the arrow keys or the mouse; times update as soon as it is saved.
- Switch between **Full** (all five prayers) and **Compact** (just the current
  prayer and the next one, with names).
- Change the **Method** used to calculate Fajr and Isha, and the **Asr**
  juristic school.

Both of those calculation settings matter. Hanafi puts Asr roughly an hour
later than Standard, and switching from Muslim World League to Umm al-Qura
moves Fajr by around twenty minutes, so it is worth setting them to whatever
your local mosque follows rather than leaving the defaults.

The defaults for a fresh install are New York City, Muslim World League and
Standard Asr.

## How it works

Times come from the [Aladhan API](https://aladhan.com/prayer-times-api),
fetched once a day for your coordinates and timezone. City search uses
[Open-Meteo's geocoder](https://open-meteo.com/en/docs/geocoding-api), which
returns the IANA timezone along with the coordinates, so a city change is
enough on its own. Nothing is sent anywhere else, and there is no account or
API key.

If the network is not up yet when the shell starts, the widget retries with a
backoff up to five minutes until it gets an answer.

## Settings

Everything lives in the widget's own entry in `~/.config/omarchy/shell.json`
and is written by the popup, so you do not normally need to touch it:

| Key | Meaning |
| --- | --- |
| `locationName`, `latitude`, `longitude`, `timezone` | Where prayers are calculated for |
| `method` | Aladhan calculation method id |
| `school` | `0` standard, `1` Hanafi |
| `displayMode` | `full` or `compact` |

## License

MIT
