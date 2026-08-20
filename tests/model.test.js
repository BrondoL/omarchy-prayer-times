// Unit tests for Model.js, the widget's pure date/format/highlight math.
// Runs under plain `node --test` with no dependencies, matching the module's
// own Qt-free, locale-free design.

const test = require("node:test")
const assert = require("node:assert")
const M = require("../Model.js")

test("PRAYER_KEYS covers the five daily prayers in chronological order", () => {
  assert.deepStrictEqual(M.PRAYER_KEYS, ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"])
  for (const key of M.PRAYER_KEYS) {
    assert.ok(M.PRAYER_GLYPHS[key], `missing glyph for ${key}`)
  }
})

test("CALC_METHODS ids are unique and the defaults resolve", () => {
  const ids = M.CALC_METHODS.map(m => m.id)
  assert.strictEqual(new Set(ids).size, ids.length, "duplicate calculation method id")
  assert.ok(ids.includes(M.DEFAULT_METHOD))
  assert.ok(M.ASR_SCHOOLS.map(s => s.id).includes(M.DEFAULT_SCHOOL))
})

test("sanitizeMethod accepts known ids as number or string", () => {
  assert.strictEqual(M.sanitizeMethod(4), 4)
  assert.strictEqual(M.sanitizeMethod("4"), 4)
  assert.strictEqual(M.sanitizeMethod(0), 0, "Jafari is id 0 and must not be mistaken for falsy")
})

test("sanitizeMethod falls back to the default for anything unrecognised", () => {
  for (const bad of [undefined, null, "", "abc", 999, -1, {}]) {
    assert.strictEqual(M.sanitizeMethod(bad), M.DEFAULT_METHOD, `not defaulted: ${String(bad)}`)
  }
})

test("sanitizeSchool clamps to the two juristic schools", () => {
  assert.strictEqual(M.sanitizeSchool(1), 1)
  assert.strictEqual(M.sanitizeSchool("1"), 1)
  assert.strictEqual(M.sanitizeSchool(2), M.DEFAULT_SCHOOL)
  assert.strictEqual(M.sanitizeSchool("hanafi"), M.DEFAULT_SCHOOL)
})

test("name lookups return display strings and sanitize their input", () => {
  assert.strictEqual(M.methodName(4), "Umm al-Qura, Makkah")
  assert.strictEqual(M.methodShortName(4), "Umm al-Qura")
  assert.strictEqual(M.schoolName(1), "Hanafi")
  assert.strictEqual(M.schoolName(0), "Standard")
  // Unknown ids resolve through the default rather than returning empty.
  assert.strictEqual(M.methodName(999), M.methodName(M.DEFAULT_METHOD))
  assert.strictEqual(M.schoolName("nonsense"), "Standard")
})

test("timingsUrl carries coordinates, settings and an encoded timezone", () => {
  const url = M.timingsUrl("18-08-2026", 40.7128, -74.006, "America/New_York", 4, 1)
  assert.ok(url.startsWith("https://api.aladhan.com/v1/timings/18-08-2026?"))
  assert.ok(url.includes("latitude=40.7128"))
  assert.ok(url.includes("longitude=-74.006"))
  assert.ok(url.includes("method=4"))
  assert.ok(url.includes("school=1"))
  assert.ok(url.includes("timezonestring=America%2FNew_York"), "timezone slash must be encoded")
})

test("timingsUrl sanitizes bad method/school rather than forwarding them", () => {
  const url = M.timingsUrl("18-08-2026", 0, 0, "UTC", "junk", "junk")
  assert.ok(url.includes(`method=${M.DEFAULT_METHOD}`))
  assert.ok(url.includes(`school=${M.DEFAULT_SCHOOL}`))
})

test("stripTzSuffix removes Aladhan's timezone abbreviation and whitespace", () => {
  assert.strictEqual(M.stripTzSuffix("05:42 (MST)"), "05:42")
  assert.strictEqual(M.stripTzSuffix("  13:07  "), "13:07")
  assert.strictEqual(M.stripTzSuffix("19:30"), "19:30")
  assert.strictEqual(M.stripTzSuffix(null), "")
})

const okResponse = JSON.stringify({
  code: 200,
  data: {
    timings: {
      Fajr: "04:31 (EDT)", Sunrise: "06:05", Dhuhr: "12:57", Asr: "16:38",
      Sunset: "19:48", Maghrib: "19:48 (EDT)", Isha: "21:15"
    }
  }
})

test("parseTimingsResponse extracts the five prayers and drops extras", () => {
  const out = M.parseTimingsResponse(okResponse)
  assert.deepStrictEqual(out, {
    Fajr: "04:31", Dhuhr: "12:57", Asr: "16:38", Maghrib: "19:48", Isha: "21:15"
  })
  assert.strictEqual(out.Sunrise, undefined, "non-prayer timings must not leak through")
})

test("parseTimingsResponse returns null for malformed or failed payloads", () => {
  const missingIsha = JSON.stringify({
    code: 200,
    data: { timings: { Fajr: "04:31", Dhuhr: "12:57", Asr: "16:38", Maghrib: "19:48" } }
  })
  const badTime = JSON.stringify({
    code: 200,
    data: { timings: { Fajr: "-", Dhuhr: "12:57", Asr: "16:38", Maghrib: "19:48", Isha: "21:15" } }
  })
  const cases = [
    ["not json at all", "not json"],
    ["empty string", ""],
    ["null input", null],
    ["non-200 code", JSON.stringify({ code: 400, data: {} })],
    ["no data member", JSON.stringify({ code: 200 })],
    ["missing a prayer", missingIsha],
    ["unparseable time value", badTime]
  ]
  for (const [label, raw] of cases) {
    assert.strictEqual(M.parseTimingsResponse(raw), null, `should be null: ${label}`)
  }
})

test("minutesSinceMidnight converts HH:MM and rejects garbage", () => {
  assert.strictEqual(M.minutesSinceMidnight("00:00"), 0)
  assert.strictEqual(M.minutesSinceMidnight("04:31"), 271)
  assert.strictEqual(M.minutesSinceMidnight("23:59"), 1439)
  assert.strictEqual(M.minutesSinceMidnight("abc"), null)
  assert.strictEqual(M.minutesSinceMidnight(""), null)
  assert.strictEqual(M.minutesSinceMidnight(null), null)
})

test("to12Hour formats around the noon and midnight boundaries", () => {
  assert.strictEqual(M.to12Hour("00:00"), "12:00 AM")
  assert.strictEqual(M.to12Hour("00:07"), "12:07 AM")
  assert.strictEqual(M.to12Hour("11:59"), "11:59 AM")
  assert.strictEqual(M.to12Hour("12:00"), "12:00 PM")
  assert.strictEqual(M.to12Hour("12:57"), "12:57 PM")
  assert.strictEqual(M.to12Hour("21:15"), "9:15 PM")
  assert.strictEqual(M.to12Hour("garbage"), "")
})

const times = { Fajr: "04:31", Dhuhr: "12:57", Asr: "16:38", Maghrib: "19:48", Isha: "21:15" }
const at = hhmm => M.minutesSinceMidnight(hhmm)

test("activeIndex highlights the most recently passed prayer", () => {
  assert.strictEqual(M.activeIndex(times, at("04:31")), 0, "exactly at Fajr")
  assert.strictEqual(M.activeIndex(times, at("09:00")), 0)
  assert.strictEqual(M.activeIndex(times, at("12:57")), 1)
  assert.strictEqual(M.activeIndex(times, at("17:00")), 2)
  assert.strictEqual(M.activeIndex(times, at("20:00")), 3)
  assert.strictEqual(M.activeIndex(times, at("23:59")), 4)
})

test("activeIndex carries Isha over the small hours before Fajr", () => {
  assert.strictEqual(M.activeIndex(times, at("00:00")), 4)
  assert.strictEqual(M.activeIndex(times, at("04:30")), 4, "one minute before Fajr")
})

test("activeIndex returns -1 when times are absent or unparseable", () => {
  assert.strictEqual(M.activeIndex(null, 600), -1)
  assert.strictEqual(M.activeIndex(undefined, 600), -1)
  assert.strictEqual(M.activeIndex({ ...times, Asr: "--" }, 600), -1)
})

test("nextIndex advances by one and wraps Isha back to Fajr", () => {
  assert.strictEqual(M.nextIndex(0), 1)
  assert.strictEqual(M.nextIndex(3), 4)
  assert.strictEqual(M.nextIndex(4), 0, "after Isha comes tomorrow's Fajr")
})

test("nextIndex falls back to Fajr when there is no active prayer", () => {
  for (const bad of [-1, null, undefined]) {
    assert.strictEqual(M.nextIndex(bad), 0)
  }
})

test("minutesUntilNext counts down to the next prayer today", () => {
  assert.deepStrictEqual(M.minutesUntilNext(times, at("04:00")), { key: "Fajr", minutes: 31 })
  assert.deepStrictEqual(M.minutesUntilNext(times, at("12:00")), { key: "Dhuhr", minutes: 57 })
  assert.deepStrictEqual(M.minutesUntilNext(times, at("21:14")), { key: "Isha", minutes: 1 })
})

test("minutesUntilNext reports an unknown gap once Isha has passed", () => {
  // Tomorrow's Fajr is not known until the next fetch, so minutes is null.
  assert.deepStrictEqual(M.minutesUntilNext(times, at("21:15")), { key: "Fajr", minutes: null })
  assert.deepStrictEqual(M.minutesUntilNext(times, at("23:30")), { key: "Fajr", minutes: null })
})

test("minutesUntilNext returns null for absent or unparseable times", () => {
  assert.strictEqual(M.minutesUntilNext(null, 600), null)
  assert.strictEqual(M.minutesUntilNext({ ...times, Isha: "" }, 600), null)
})

test("formatCountdown never renders a zero hours component", () => {
  assert.strictEqual(M.formatCountdown(45), "45m")
  assert.strictEqual(M.formatCountdown(125), "2h 5m")
  assert.strictEqual(M.formatCountdown(120), "2h")
  assert.strictEqual(M.formatCountdown(60), "1h")
  assert.strictEqual(M.formatCountdown(59), "59m")
  assert.ok(!M.formatCountdown(45).includes("0h"))
})

test("formatCountdown collapses the final minute to 'now' and blanks bad input", () => {
  assert.strictEqual(M.formatCountdown(0), "now")
  assert.strictEqual(M.formatCountdown(-1), "")
  assert.strictEqual(M.formatCountdown(null), "")
  assert.strictEqual(M.formatCountdown(undefined), "")
})

test("aladhanDateParam emits zero-padded DD-MM-YYYY", () => {
  assert.strictEqual(M.aladhanDateParam(new Date(2026, 7, 18)), "18-08-2026")
  assert.strictEqual(M.aladhanDateParam(new Date(2026, 0, 5)), "05-01-2026")
  assert.strictEqual(M.aladhanDateParam(new Date(2026, 11, 31)), "31-12-2026")
})

test("dayKey emits zero-padded YYYY-MM-DD and changes across midnight", () => {
  assert.strictEqual(M.dayKey(new Date(2026, 7, 18)), "2026-08-18")
  assert.strictEqual(M.dayKey(new Date(2026, 0, 5)), "2026-01-05")
  assert.notStrictEqual(M.dayKey(new Date(2026, 7, 18)), M.dayKey(new Date(2026, 7, 19)))
})

const geocoding = JSON.stringify({
  results: [
    { name: "Cairo", admin1: "Cairo Governorate", country: "Egypt", latitude: 30.06263, longitude: 31.24967, timezone: "Africa/Cairo" },
    { name: "Springfield", country: "United States", latitude: 39.8017, longitude: -89.6437, timezone: "America/Chicago" }
  ]
})

test("parseGeocodingResults maps rows and joins the region label", () => {
  const out = M.parseGeocodingResults(geocoding)
  assert.strictEqual(out.length, 2)
  assert.deepStrictEqual(out[0], {
    name: "Cairo",
    description: "Cairo Governorate, Egypt",
    latitude: 30.06263,
    longitude: 31.24967,
    timezone: "Africa/Cairo"
  })
  assert.strictEqual(out[1].description, "United States", "missing admin1 must not leave a dangling comma")
})

test("parseGeocodingResults skips rows lacking coordinates or a timezone", () => {
  const partial = JSON.stringify({
    results: [
      { name: "No timezone", latitude: 1, longitude: 2 },
      { name: "No coords", timezone: "Europe/Paris" },
      { latitude: 1, longitude: 2, timezone: "Europe/Paris" },
      { name: "Good", latitude: 1, longitude: 2, timezone: "Europe/Paris" }
    ]
  })
  const out = M.parseGeocodingResults(partial)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].name, "Good")
})

test("parseGeocodingResults keeps a zero coordinate, which is a real location", () => {
  const nullIsland = JSON.stringify({
    results: [{ name: "Null Island", latitude: 0, longitude: 0, timezone: "UTC" }]
  })
  assert.strictEqual(M.parseGeocodingResults(nullIsland).length, 1)
})

test("parseGeocodingResults returns an empty list for empty or broken payloads", () => {
  for (const raw of ["", null, "not json", "{}", JSON.stringify({ results: [] })]) {
    assert.deepStrictEqual(M.parseGeocodingResults(raw), [], `should be empty: ${String(raw)}`)
  }
})

const suggestions = [
  { name: "Cairo", latitude: 30.06263, longitude: 31.24967, timezone: "Africa/Cairo" },
  { name: "Cairo", latitude: 37.0053, longitude: -89.1773, timezone: "America/Chicago" }
]

test("locationCommit returns the selected suggestion", () => {
  assert.strictEqual(M.locationCommit("Cairo", suggestions, 0), suggestions[0])
  assert.strictEqual(M.locationCommit("Cairo", suggestions, 1), suggestions[1])
})

test("locationCommit clamps an out-of-range selection into the list", () => {
  assert.strictEqual(M.locationCommit("Cairo", suggestions, 9), suggestions[1])
  assert.strictEqual(M.locationCommit("Cairo", suggestions, -3), suggestions[0])
})

test("locationCommit is a no-op without text or a matched suggestion", () => {
  // Prayer times need real coordinates, so there is no name-only fallback.
  assert.strictEqual(M.locationCommit("", suggestions, 0), null)
  assert.strictEqual(M.locationCommit("   ", suggestions, 0), null)
  assert.strictEqual(M.locationCommit(null, suggestions, 0), null)
  assert.strictEqual(M.locationCommit("Cairo", [], 0), null)
  assert.strictEqual(M.locationCommit("Cairo", null, 0), null)
})

// ---- Notification scheduling.

const day = { Fajr: "05:00", Dhuhr: "12:30", Asr: "15:45", Maghrib: "18:20", Isha: "19:40" }

test("sanitizeReminder and sanitizeNotify fall back for anything unrecognised", () => {
  assert.strictEqual(M.sanitizeReminder("15"), 15)
  assert.strictEqual(M.sanitizeReminder(0), 0)
  assert.strictEqual(M.sanitizeReminder("7"), M.DEFAULT_REMINDER)
  assert.strictEqual(M.sanitizeReminder(""), M.DEFAULT_REMINDER)
  assert.strictEqual(M.sanitizeNotify("0"), 0)
  assert.strictEqual(M.sanitizeNotify("nonsense"), M.DEFAULT_NOTIFY)
})

test("dueNotifications fires a prayer exactly once, on the tick that crosses it", () => {
  const before = M.dueNotifications(day, at("12:28"), at("12:29"), 0)
  assert.deepStrictEqual(before, [])

  const crossing = M.dueNotifications(day, at("12:29"), at("12:30"), 0)
  assert.strictEqual(crossing.length, 1)
  assert.strictEqual(crossing[0].key, "Dhuhr")
  assert.strictEqual(crossing[0].kind, "due")

  // The next tick must not repeat it.
  assert.deepStrictEqual(M.dueNotifications(day, at("12:30"), at("12:31"), 0), [])
})

test("dueNotifications fires the reminder ahead of the prayer", () => {
  const reminder = M.dueNotifications(day, at("19:29"), at("19:30"), 10)
  assert.strictEqual(reminder.length, 1)
  assert.deepStrictEqual(
    { key: reminder[0].key, kind: reminder[0].kind, lead: reminder[0].lead },
    { key: "Isha", kind: "reminder", lead: 10 }
  )
  // ...and the prayer itself still arrives on its own minute.
  const due = M.dueNotifications(day, at("19:39"), at("19:40"), 10)
  assert.strictEqual(due.length, 1)
  assert.strictEqual(due[0].kind, "due")
})

test("dueNotifications with the reminder off emits only the prayers", () => {
  assert.deepStrictEqual(M.dueNotifications(day, at("19:29"), at("19:30"), 0), [])
})

test("dueNotifications survives a late tick without dropping the prayer", () => {
  // Three minutes of drift: the prayer is still inside the catch-up window.
  const late = M.dueNotifications(day, at("15:43"), at("15:46"), 0)
  assert.strictEqual(late.length, 1)
  assert.strictEqual(late[0].key, "Asr")
})

test("dueNotifications does not replay the day after a long suspend", () => {
  // Laptop asleep from before Dhuhr until after Maghrib: only what falls in
  // the clamped catch-up window may speak, never the whole afternoon.
  const resumed = M.dueNotifications(day, at("12:00"), at("18:30"), 10)
  assert.deepStrictEqual(resumed, [])

  // Resuming right on top of a prayer still announces that one.
  const onTop = M.dueNotifications(day, at("12:00"), at("18:22"), 0)
  assert.strictEqual(onTop.length, 1)
  assert.strictEqual(onTop[0].key, "Maghrib")
})

test("dueNotifications stays quiet on the first tick and on a repeated minute", () => {
  assert.deepStrictEqual(M.dueNotifications(day, -1, at("12:30"), 10), [])
  assert.deepStrictEqual(M.dueNotifications(day, at("12:30"), at("12:30"), 10), [])
  assert.deepStrictEqual(M.dueNotifications(null, at("12:29"), at("12:30"), 10), [])
})

test("dueNotifications crosses midnight without losing the tick", () => {
  const nightly = { ...day, Isha: "23:58" }
  const crossing = M.dueNotifications(nightly, at("23:57"), at("00:01"), 0)
  assert.strictEqual(crossing.length, 1)
  assert.strictEqual(crossing[0].key, "Isha")
})

test("dueNotifications skips a reminder that would fall before midnight", () => {
  // A 30-minute lead on a 00:10 Fajr belongs to yesterday, not to this tick.
  const arctic = { ...day, Fajr: "00:10" }
  assert.deepStrictEqual(M.dueNotifications(arctic, at("23:39"), at("23:41"), 30), [])
})

test("dueNotifications ignores a day whose times never parsed", () => {
  assert.deepStrictEqual(M.dueNotifications({ ...day, Dhuhr: "" }, at("12:29"), at("12:30"), 0), [])
})

test("notificationText names the prayer first and carries the clock time", () => {
  const due = M.notificationText({ key: "Isha", kind: "due", lead: 0, at: "19:40" })
  assert.strictEqual(due.summary, "Isha")
  assert.match(due.body, /7:40 PM/)

  const reminder = M.notificationText({ key: "Fajr", kind: "reminder", lead: 15, at: "05:00" })
  assert.strictEqual(reminder.summary, "Fajr in 15m")
  assert.strictEqual(reminder.body, "Begins at 5:00 AM")

  assert.strictEqual(M.notificationText(null), null)
})
