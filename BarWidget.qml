import QtQuick
import QtQuick.Layouts
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "ah410.prayer-times"

  // Coordinates are read with an explicit finite check rather than `||`,
  // which would treat a perfectly valid 0 as missing and silently relocate
  // anyone on the equator or the prime meridian (Pontianak, Accra, Quito)
  // to the fallback city.
  function coordinate(key, fallback) {
    var value = parseFloat(setting(key, ""))
    return isFinite(value) ? value : fallback
  }

  readonly property real latitude: coordinate("latitude", 40.7128)
  readonly property real longitude: coordinate("longitude", -74.0060)
  readonly property string timezone: setting("timezone", "America/New_York")
  readonly property string locationName: setting("locationName", "New York, NY")
  readonly property int method: Model.sanitizeMethod(setting("method", Model.DEFAULT_METHOD))
  readonly property int school: Model.sanitizeSchool(setting("school", Model.DEFAULT_SCHOOL))
  readonly property bool compact: setting("displayMode", "full") === "compact"
  readonly property var prayerKeys: Model.PRAYER_KEYS
  readonly property var displayIndices: root.compact && root.activeIdx !== -1
    ? [root.activeIdx, Model.nextIndex(root.activeIdx)]
    : [0, 1, 2, 3, 4]
  readonly property color dividerForeground: root.bar ? root.bar.barForeground : Color.foreground

  property var times: null        // {Fajr, Dhuhr, Asr, Maghrib, Isha} as "HH:mm"
  property string timesDayKey: ""
  property int fetchRetries: 0
  property int activeIdx: -1

  function refresh() {
    var now = new Date()
    fetchProc.command = ["curl", "-fsS", "--max-time", "8",
      Model.timingsUrl(Model.aladhanDateParam(now), root.latitude, root.longitude,
        root.timezone, root.method, root.school)]
    fetchProc.running = true
  }

  // Backs off instead of giving up: the shell starts at login, often before
  // the network is up, and a fixed three-strikes cap left the widget blank
  // until the next daily refresh. Doubling up to a five-minute ceiling
  // recovers on its own without hammering the API.
  function scheduleRetry() {
    root.fetchRetries++
    retryTimer.interval = Math.min(2500 * Math.pow(2, root.fetchRetries - 1), 5 * 60 * 1000)
    retryTimer.restart()
  }

  function recomputeActive() {
    var now = new Date()
    if (root.times && root.timesDayKey !== Model.dayKey(now)) root.refresh()
    if (!root.times) { root.activeIdx = -1; return }
    var minutesNow = now.getHours() * 60 + now.getMinutes()
    root.activeIdx = Model.activeIndex(root.times, minutesNow)
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = root
    if ("hostWidget" in target) target.hostWidget = root
  }

  // ---- Popup panel. Shape contract for shell.summon/hide/toggle routing
  //      (Bar.findPanelWidget requires open/close/opened on the bar-widget
  //      root), mirroring the clock/weather widgets.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  implicitWidth: content.implicitWidth
  implicitHeight: content.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onLatitudeChanged: root.refresh()
  onLongitudeChanged: root.refresh()
  onTimezoneChanged: root.refresh()
  onMethodChanged: root.refresh()
  onSchoolChanged: root.refresh()

  Process {
    id: fetchProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var raw = String(text || "").trim()
        if (!raw) { root.scheduleRetry(); return }
        var parsed = Model.parseTimingsResponse(raw)
        if (!parsed) { root.scheduleRetry(); return }
        root.times = parsed
        root.timesDayKey = Model.dayKey(new Date())
        root.fetchRetries = 0
        root.recomputeActive()
      }
    }
  }

  Timer {
    id: retryTimer
    interval: 2500
    onTriggered: if (!fetchProc.running) root.refresh()
  }

  // Daily cadence: prayer times only change once a day.
  Timer {
    interval: 12 * 60 * 60 * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Per-minute cadence: just recompute which already-fetched prayer is active.
  Timer {
    interval: 60 * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.recomputeActive()
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  RowLayout {
    id: content
    anchors.fill: parent
    spacing: Style.space(2)

    Rectangle {
      visible: !root.vertical
      Layout.preferredWidth: 2
      Layout.fillHeight: true
      Layout.topMargin: Style.space(5)
      Layout.bottomMargin: Style.space(5)
      Layout.rightMargin: Style.space(1)
      color: Qt.rgba(root.dividerForeground.r, root.dividerForeground.g, root.dividerForeground.b, 0.4)
    }

    GridLayout {
      id: grid
      columns: root.vertical ? 1 : root.displayIndices.length
      columnSpacing: root.vertical ? 0 : Style.space(1)
      rowSpacing: root.vertical ? Style.space(2) : 0

      Repeater {
        model: root.displayIndices

        WidgetButton {
          id: prayerButton
          required property int index
          required property int modelData

          readonly property string prayerKey: Model.PRAYER_KEYS[modelData]
          readonly property string hhmm: root.times ? root.times[prayerKey] : ""
          readonly property string glyph: Model.PRAYER_GLYPHS[prayerKey]
          readonly property string timeLabel: hhmm === "" ? "" : Model.to12Hour(hhmm)

          bar: root.bar
          // Kept only so hasVisualContent/tooltips still work; the visible
          // content is the Row below. Icon glyphs don't share one advance
          // width, so a literal space between glyph and text renders at a
          // different size per prayer — real layout spacing plus a
          // fixed-width glyph cell keeps every entry identical.
          text: hhmm === "" ? "" : (glyph + " " + (root.compact ? prayerKey + " " : "") + timeLabel)
          labelVisible: false
          fixedWidth: hhmm === "" ? 0 : contentRow.implicitWidth + Style.space(12)
          // The theme's accent/urgent color can be darker than the normal
          // foreground (Solitude's `red` is a gray), which would render the
          // current prayer dimmer than the rest. Brightness plus weight is
          // the theme-independent way to mark it, matching how the built-in
          // workspaces widget fades everything that is not focused.
          useActiveColor: false
          active: modelData === root.activeIdx
          interactive: true
          horizontalMargin: 6
          verticalPadding: 6
          tooltipText: prayerKey
          onPressed: root.togglePanel()

          Row {
            id: contentRow
            anchors.centerIn: parent
            spacing: Style.space(6)
            visible: prayerButton.hhmm !== ""
            opacity: prayerButton.active ? 1 : 0.55

            Text {
              // Uniform cell, glyph centered in it. The glyphs have
              // different ink widths (the ray-bearing sunrise/sunset and
              // the cloud are wider than the plain sun and moon), so a
              // shared cell is what keeps every entry the same shape;
              // centering spreads the leftover space evenly instead of
              // letting the widest glyphs crowd the time.
              width: Style.space(18)
              horizontalAlignment: Text.AlignHCenter
              text: prayerButton.glyph
              color: prayerButton.foreground
              font.family: prayerButton.fontFamily
              font.pixelSize: prayerButton.fontSize
              renderType: Text.NativeRendering
            }
            Text {
              visible: root.compact
              text: prayerButton.prayerKey
              color: prayerButton.foreground
              font.family: prayerButton.fontFamily
              font.pixelSize: prayerButton.fontSize
              font.bold: prayerButton.active
              renderType: Text.NativeRendering
            }
            Text {
              text: prayerButton.timeLabel
              color: prayerButton.foreground
              font.family: prayerButton.fontFamily
              font.pixelSize: prayerButton.fontSize
              font.bold: prayerButton.active
              renderType: Text.NativeRendering
            }
          }
        }
      }
    }
  }
}
