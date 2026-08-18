// Pure date/format/highlight math for the prayer-times widget. Locale- and
// Qt-free so it stays testable under node, mirroring the built-in widgets'
// Model.js files.

var PRAYER_KEYS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]

// Nerd Font glyphs, cmap-verified present in the installed JetBrainsMono
// Nerd Font. Fajr/Dhuhr/Asr/Maghrib come from the weather-icons block
// (Dhuhr and Asr reuse codepoints the built-in weather widget already
// renders). Isha is oct-moon rather than the weather block's night_clear:
// that glyph's ink is 578 units against 867-1199 for the suns, so it read
// as visibly undersized in a row with them. Ink widths are what to match
// when swapping any of these — the advance width is 600 for all of them.
var PRAYER_GLYPHS = {
  Fajr: "",
  Dhuhr: "",
  Asr: "",
  Maghrib: "",
  Isha: ""
}

// Aladhan calculation methods, ids verified against
// https://api.aladhan.com/v1/methods. These are not cosmetic: Umm al-Qura
// puts Fajr ~19 minutes earlier than ISNA at the same coordinates, so a
// plugin that ships one hardcoded method is simply wrong for most of the
// world. Ordered by how widely each is used rather than by id, since this
// list is rendered as-is in the picker.
var CALC_METHODS = [
  { id: 3,  name: "Muslim World League", short: "Muslim World League" },
  { id: 2,  name: "Islamic Society of North America", short: "ISNA" },
  { id: 4,  name: "Umm al-Qura, Makkah", short: "Umm al-Qura" },
  { id: 5,  name: "Egyptian General Authority", short: "Egyptian" },
  { id: 1,  name: "University of Islamic Sciences, Karachi", short: "Karachi" },
  { id: 15, name: "Moonsighting Committee Worldwide", short: "Moonsighting" },
  { id: 0,  name: "Shia Ithna-Ashari (Jafari)", short: "Jafari" },
  { id: 7,  name: "Institute of Geophysics, Tehran", short: "Tehran" },
  { id: 8,  name: "Gulf Region", short: "Gulf Region" },
  { id: 9,  name: "Kuwait", short: "Kuwait" },
  { id: 10, name: "Qatar", short: "Qatar" },
  { id: 11, name: "Singapore (MUIS)", short: "Singapore" },
  { id: 12, name: "France (UOIF)", short: "France" },
  { id: 13, name: "Turkey (Diyanet)", short: "Turkey" },
  { id: 14, name: "Russia", short: "Russia" },
  { id: 16, name: "Dubai", short: "Dubai" },
  { id: 17, name: "Malaysia (JAKIM)", short: "Malaysia" },
  { id: 18, name: "Tunisia", short: "Tunisia" },
  { id: 19, name: "Algeria", short: "Algeria" },
  { id: 20, name: "Indonesia (Kemenag)", short: "Indonesia" },
  { id: 21, name: "Morocco", short: "Morocco" },
  { id: 22, name: "Portugal (Lisboa)", short: "Portugal" },
  { id: 23, name: "Jordan", short: "Jordan" }
]

// Asr juristic method. Hanafi shifts Asr about an hour later, so this is the
// setting users notice first if it is wrong for them.
var ASR_SCHOOLS = [
  { id: 0, name: "Standard" },
  { id: 1, name: "Hanafi" }
]

var DEFAULT_METHOD = 3   // Muslim World League, the most broadly applicable
var DEFAULT_SCHOOL = 0   // Standard (Shafi/Maliki/Hanbali)

// Settings arrive as strings from shell.json; anything unrecognised falls
// back to the default rather than being passed through to the API.
function sanitizeChoice(value, choices, fallback) {
  var id = parseInt(value, 10)
  for (var i = 0; i < choices.length; i++) if (choices[i].id === id) return id
  return fallback
}

function sanitizeMethod(value) { return sanitizeChoice(value, CALC_METHODS, DEFAULT_METHOD) }
function sanitizeSchool(value) { return sanitizeChoice(value, ASR_SCHOOLS, DEFAULT_SCHOOL) }

function choiceName(id, choices) {
  for (var i = 0; i < choices.length; i++) if (choices[i].id === id) return choices[i].name
  return ""
}

function methodName(id) { return choiceName(sanitizeMethod(id), CALC_METHODS) }

// Short label for the collapsed settings row, where the full institution
// name would just elide.
function methodShortName(id) {
  var wanted = sanitizeMethod(id)
  for (var i = 0; i < CALC_METHODS.length; i++)
    if (CALC_METHODS[i].id === wanted) return CALC_METHODS[i].short
  return ""
}
function schoolName(id) { return choiceName(sanitizeSchool(id), ASR_SCHOOLS) }

// Calculation method, Asr school, timezone and coordinates are all passed
// in from settings rather than hardcoded, so the query stays correct for any
// user's location and school of thought, not just the author's.
function timingsUrl(aladhanDateStr, latitude, longitude, timezone, method, school) {
  return "https://api.aladhan.com/v1/timings/" + aladhanDateStr +
    "?latitude=" + latitude + "&longitude=" + longitude +
    "&method=" + sanitizeMethod(method) + "&school=" + sanitizeSchool(school) +
    "&timezonestring=" + encodeURIComponent(timezone)
}

// Aladhan can suffix a tz abbreviation, e.g. "05:42 (MST)".
function stripTzSuffix(value) {
  return String(value || "").replace(/\s*\(.*\)\s*$/, "").replace(/^\s+|\s+$/g, "")
}

function parseTimingsResponse(raw) {
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || data.code !== 200 || !data.data || !data.data.timings) return null
    var t = data.data.timings
    var out = {}
    for (var i = 0; i < PRAYER_KEYS.length; i++) {
      var key = PRAYER_KEYS[i]
      var hhmm = stripTzSuffix(t[key])
      if (!/^\d{1,2}:\d{2}$/.test(hhmm)) return null
      out[key] = hhmm
    }
    return out
  } catch (e) {
    return null
  }
}

function minutesSinceMidnight(hhmm) {
  var parts = String(hhmm || "").split(":")
  var h = parseInt(parts[0], 10)
  var m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function pad2(n) { return n < 10 ? "0" + n : String(n) }

function to12Hour(hhmm) {
  var mins = minutesSinceMidnight(hhmm)
  if (mins === null) return ""
  var h = Math.floor(mins / 60)
  var m = mins % 60
  var period = h >= 12 ? "PM" : "AM"
  var h12 = h % 12
  if (h12 === 0) h12 = 12
  return h12 + ":" + pad2(m) + " " + period
}

// "Active window": most recently passed prayer stays highlighted until the
// next arrives. Before Fajr, Isha (carried over from the previous night)
// is still the active window.
function activeIndex(times, nowMinutes) {
  if (!times) return -1
  var minutesArr = PRAYER_KEYS.map(function(k) { return minutesSinceMidnight(times[k]) })
  if (minutesArr.indexOf(null) !== -1) return -1
  if (nowMinutes < minutesArr[0]) return PRAYER_KEYS.length - 1
  var active = 0
  for (var i = 0; i < minutesArr.length; i++) {
    if (nowMinutes >= minutesArr[i]) active = i
  }
  return active
}

// The upcoming prayer's index, one slot after whichever one activeIndex
// returned. Used by the bar's compact display mode.
function nextIndex(activeIdx) {
  if (activeIdx === -1 || activeIdx === null || activeIdx === undefined) return 0
  return (activeIdx + 1) % PRAYER_KEYS.length
}

// Minutes remaining until the next prayer today, or null once Isha has
// passed (tomorrow's Fajr is unknown until the next fetch).
function minutesUntilNext(times, nowMinutes) {
  if (!times) return null
  var minutesArr = PRAYER_KEYS.map(function(k) { return minutesSinceMidnight(times[k]) })
  if (minutesArr.indexOf(null) !== -1) return null
  for (var i = 0; i < minutesArr.length; i++) {
    if (nowMinutes < minutesArr[i]) return { key: PRAYER_KEYS[i], minutes: minutesArr[i] - nowMinutes }
  }
  return { key: PRAYER_KEYS[0], minutes: null }
}

// "2h 5m" / "45m" / "now" — never "0h 45m", which reads like a bug.
function formatCountdown(minutes) {
  if (minutes === null || minutes === undefined || minutes < 0) return ""
  if (minutes < 1) return "now"
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  if (h === 0) return m + "m"
  if (m === 0) return h + "h"
  return h + "h " + m + "m"
}

function aladhanDateParam(date) {
  return pad2(date.getDate()) + "-" + pad2(date.getMonth() + 1) + "-" + date.getFullYear()
}

function dayKey(date) {
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
}

// Open-Meteo geocoding response -> suggestion rows for the location picker.
// Carries timezone forward (unlike the weather widget's version) since
// Aladhan needs it to compute correct prayer times for the picked city.
function parseGeocodingResults(raw) {
  try {
    var data = JSON.parse(String(raw || "{}"))
    var results = data.results
    if (!results || !results.length) return []

    var out = []
    for (var i = 0; i < results.length; i++) {
      var r = results[i]
      if (!r || !r.name || r.latitude === undefined || r.longitude === undefined || !r.timezone) continue
      var region = [r.admin1, r.country].filter(function(part) { return !!part }).join(", ")
      out.push({
        name: String(r.name),
        description: region,
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: String(r.timezone)
      })
    }
    return out
  } catch (e) {
    return []
  }
}

// Resolves the field text + suggestion list into a location to persist.
// Unlike weather, there is no name-only fallback: prayer times need real
// coordinates and a timezone, so committing without a matched suggestion
// is a no-op (returns null).
function locationCommit(text, suggestions, selectedIndex) {
  var name = String(text || "").replace(/^\s+|\s+$/g, "")
  if (name === "") return null
  var choices = suggestions || []
  var index = Math.max(0, Math.min(parseInt(selectedIndex, 10) || 0, choices.length - 1))
  return choices[index] || null
}

if (typeof module !== "undefined") {
  module.exports = {
    PRAYER_KEYS: PRAYER_KEYS,
    PRAYER_GLYPHS: PRAYER_GLYPHS,
    CALC_METHODS: CALC_METHODS,
    ASR_SCHOOLS: ASR_SCHOOLS,
    DEFAULT_METHOD: DEFAULT_METHOD,
    DEFAULT_SCHOOL: DEFAULT_SCHOOL,
    sanitizeMethod: sanitizeMethod,
    sanitizeSchool: sanitizeSchool,
    methodName: methodName,
    methodShortName: methodShortName,
    schoolName: schoolName,
    formatCountdown: formatCountdown,
    timingsUrl: timingsUrl,
    stripTzSuffix: stripTzSuffix,
    parseTimingsResponse: parseTimingsResponse,
    minutesSinceMidnight: minutesSinceMidnight,
    to12Hour: to12Hour,
    activeIndex: activeIndex,
    nextIndex: nextIndex,
    minutesUntilNext: minutesUntilNext,
    aladhanDateParam: aladhanDateParam,
    dayKey: dayKey,
    parseGeocodingResults: parseGeocodingResults,
    locationCommit: locationCommit
  }
}
