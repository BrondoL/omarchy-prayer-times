import QtQuick
import QtQuick.Layouts
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Prayer-times popup: all 5 times, current one marked, a countdown to the
// next, and a click-to-edit location field (geocoded via the same
// Open-Meteo endpoint the weather widget uses) plus a full/compact toggle
// for the bar row.
Panel {
  id: root
  moduleName: "ah410.prayer-times"
  ipcTarget: "ah410.prayer-times"

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  function open() {
    setCenterHoverRevealSuppressed(false)
    root.controller.show()
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.openPicker = ""
    if (root.editingLocation) root.cancelEditingLocation()
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  readonly property var times: hostWidget ? hostWidget.times : null
  readonly property int activeIdx: hostWidget ? hostWidget.activeIdx : -1
  readonly property string locationName: setting("locationName", "New York, NY")
  readonly property bool compact: setting("displayMode", "full") === "compact"
  readonly property int method: Model.sanitizeMethod(setting("method", Model.DEFAULT_METHOD))
  readonly property int school: Model.sanitizeSchool(setting("school", Model.DEFAULT_SCHOOL))

  // A plain `new Date()` inside the countdown binding is not a reactive
  // dependency, so the text froze at whatever the time was when the day's
  // prayers were fetched. This ticks only while the panel is on screen.
  property int nowMinutes: 0

  function syncNow() {
    var now = new Date()
    root.nowMinutes = now.getHours() * 60 + now.getMinutes()
  }

  Timer {
    interval: 30 * 1000
    running: root.opened
    repeat: true
    triggeredOnStart: true
    onTriggered: root.syncNow()
  }

  readonly property var nextInfo: Model.minutesUntilNext(root.times, root.nowMinutes)

  // Which calculation picker is expanded: "", "method" or "school".
  property string openPicker: ""

  function togglePicker(which) {
    root.openPicker = root.openPicker === which ? "" : which
  }

  function choicesFor(key) { return key === "method" ? Model.CALC_METHODS : Model.ASR_SCHOOLS }
  function currentFor(key) { return key === "method" ? root.method : root.school }
  function currentNameFor(key) { return key === "method" ? Model.methodShortName(root.method) : Model.schoolName(root.school) }

  // Click-to-edit state for the location field.
  property bool editingLocation: false
  property var locationSuggestions: []
  property int suggestionIndex: 0
  property string geocodePendingQuery: ""
  property string geocodeActiveQuery: ""

  function startEditingLocation() {
    editingLocation = true
    locationSuggestions = []
    suggestionIndex = 0
    Qt.callLater(function() {
      locationField.text = root.locationName
      locationField.selectAll()
      locationField.forceActiveFocus()
    })
  }

  function cancelEditingLocation() {
    editingLocation = false
    openPicker = ""
    locationSuggestions = []
    geocodeDebounce.stop()
    Qt.callLater(function() { if (keyCatcher) keyCatcher.forceActiveFocus() })
  }

  function commitLocation() {
    var location = Model.locationCommit(locationField.text, locationSuggestions, suggestionIndex)
    if (!location) return
    persistSettings({
      locationName: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone
    })
    cancelEditingLocation()
  }

  function requestGeocode() {
    var query = locationField.text.replace(/^\s+|\s+$/g, "")
    if (query.length < 2) {
      locationSuggestions = []
      return
    }
    geocodePendingQuery = query
    if (!geocodeProc.running) startGeocode()
  }

  function startGeocode() {
    geocodeActiveQuery = geocodePendingQuery
    geocodeProc.command = ["curl", "-fsS", "--max-time", "5",
      "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(geocodeActiveQuery) + "&count=5&language=en&format=json"]
    geocodeProc.running = true
  }

  function setCalculation(key, id) {
    var values = {}
    values[key] = id
    persistSettings(values)
    root.openPicker = ""
  }

  function setDisplayMode(mode) {
    persistSettings({ displayMode: mode })
  }

  function persistSettings(values) {
    var entry = { id: root.moduleName }
    for (var existing in root.settings) if (existing !== "id") entry[existing] = root.settings[existing]
    for (var key in values) entry[key] = values[key]

    root.settings = entry
    if (root.hostWidget && "settings" in root.hostWidget) root.hostWidget.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  Process {
    id: geocodeProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        root.locationSuggestions = root.editingLocation ? Model.parseGeocodingResults(text) : []
        root.suggestionIndex = 0
        if (root.geocodePendingQuery !== root.geocodeActiveQuery) Qt.callLater(root.startGeocode)
      }
    }
  }

  Timer {
    id: geocodeDebounce
    interval: 300
    onTriggered: root.requestGeocode()
  }

  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(320))
    contentHeight: panel.fittedContentHeight(mainColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: root.editingLocation
      onReturnRequested: root.startEditingLocation()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Flickable {
        id: panelScroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: mainColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: mainColumn
          width: panelScroll.width
          spacing: Style.space(14)

          // ---- Header: location (click to edit) + full/compact toggle.
          Item {
            width: parent.width
            height: Math.max(locationRow.implicitHeight, locationField.implicitHeight, modeRow.implicitHeight) + Style.space(8)

            Row {
              id: locationRow
              visible: !root.editingLocation
              anchors.left: parent.left
              anchors.leftMargin: Style.space(16)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(6)

              TapHandler { onTapped: root.startEditingLocation() }
              HoverHandler { cursorShape: Qt.PointingHandCursor }

              Text {
                text: ""  // nf-fa-map_marker
                color: Qt.darker(root.contentForeground, 1.4)
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.body
                anchors.verticalCenter: parent.verticalCenter
              }
              Text {
                text: root.locationName.toUpperCase()
                color: Qt.darker(root.contentForeground, 1.4)
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.body
                font.letterSpacing: 1
                anchors.verticalCenter: parent.verticalCenter
              }
            }

            TextField {
              id: locationField
              visible: root.editingLocation
              anchors.left: parent.left
              anchors.leftMargin: Style.space(16)
              anchors.right: parent.right
              anchors.rightMargin: Style.space(16)
              anchors.verticalCenter: parent.verticalCenter
              placeholderText: "Search city"
              foreground: root.contentForeground
              font.family: root.contentFontFamily

              onTextChanged: if (root.editingLocation) geocodeDebounce.restart()

              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  root.cancelEditingLocation()
                  event.accepted = true
                } else if (event.key === Qt.Key_Down) {
                  if (root.suggestionIndex < root.locationSuggestions.length - 1) root.suggestionIndex++
                  event.accepted = true
                } else if (event.key === Qt.Key_Up) {
                  if (root.suggestionIndex > 0) root.suggestionIndex--
                  event.accepted = true
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                  root.commitLocation()
                  event.accepted = true
                }
              }
            }

            Row {
              id: modeRow
              visible: !root.editingLocation
              anchors.right: parent.right
              anchors.rightMargin: Style.space(16)
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(10)

              Repeater {
                model: [
                  { label: "Full", mode: "full" },
                  { label: "Compact", mode: "compact" }
                ]

                Text {
                  required property var modelData
                  readonly property bool selected: (root.compact ? "compact" : "full") === modelData.mode
                  text: modelData.label
                  color: selected ? Style.selectedStateColor(root.contentForeground, Color.accent) : Qt.darker(root.contentForeground, 1.6)
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: selected

                  MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.space(4)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.setDisplayMode(modelData.mode)
                  }
                }
              }
            }
          }

          // ---- Geocoding suggestions while the location is being edited.
          Column {
            visible: root.editingLocation && root.locationSuggestions.length > 0
            width: parent.width
            spacing: 0

            Repeater {
              model: root.locationSuggestions

              Rectangle {
                required property var modelData
                required property int index
                width: parent.width
                height: suggestionRow.implicitHeight + Style.space(12)
                radius: Style.cornerRadius
                color: index === root.suggestionIndex ? Style.hoverFillFor(root.contentForeground, Color.accent) : "transparent"

                Row {
                  id: suggestionRow
                  anchors.left: parent.left
                  anchors.leftMargin: Style.space(16)
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.space(8)

                  Text {
                    text: modelData.name
                    color: index === root.suggestionIndex ? Style.hoverStateColor(root.contentForeground, Color.accent) : root.contentForeground
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.body
                  }
                  Text {
                    visible: text !== ""
                    text: modelData.description
                    color: Qt.darker(root.contentForeground, 1.5)
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    anchors.verticalCenter: parent.verticalCenter
                  }
                }

                MouseArea {
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onPositionChanged: root.suggestionIndex = index
                  onClicked: {
                    root.suggestionIndex = index
                    root.commitLocation()
                  }
                }
              }
            }
          }

          // ---- Divider between location and the prayer list.
          Rectangle {
            width: parent.width
            height: Style.spacing.hairline
            color: root.contentForeground
            opacity: 0.12
          }

          // ---- 5 prayer rows.
          Column {
            width: parent.width
            spacing: Style.space(4)

            Repeater {
              model: Model.PRAYER_KEYS

              Item {
                required property string modelData
                required property int index
                width: parent.width
                height: Style.space(28)

                readonly property string hhmm: root.times ? root.times[modelData] : ""
                readonly property bool current: index === root.activeIdx
                // Brightness + weight rather than an accent color: a theme's
                // accent/urgent can be darker than its foreground (Solitude's
                // `red` is a gray), which would dim the current row instead
                // of highlighting it.
                opacity: current ? 1 : 0.55

                Row {
                  anchors.left: parent.left
                  anchors.leftMargin: Style.space(16)
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.space(10)

                  // Fixed-width cell: the glyphs have different advance
                  // widths (the moon is narrower than the suns), so without
                  // it each prayer's name would start at a different x.
                  Text {
                    width: Style.space(18)
                    horizontalAlignment: Text.AlignHCenter
                    text: Model.PRAYER_GLYPHS[modelData]
                    color: root.contentForeground
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.body
                  }
                  Text {
                    text: modelData
                    color: root.contentForeground
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.body
                    font.bold: current
                  }
                }

                Text {
                  anchors.right: parent.right
                  anchors.rightMargin: Style.space(16)
                  anchors.verticalCenter: parent.verticalCenter
                  text: hhmm === "" ? "—" : Model.to12Hour(hhmm)
                  color: root.contentForeground
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.body
                  font.bold: current
                }
              }
            }
          }

          // ---- Next-prayer countdown.
          Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            bottomPadding: Style.space(4)
            text: root.nextInfo
              ? (root.nextInfo.minutes === null
                  ? "Next: " + root.nextInfo.key + " (tomorrow)"
                  : "Next: " + root.nextInfo.key + " in " + Model.formatCountdown(root.nextInfo.minutes))
              : "Fetching prayer times…"
            color: Qt.darker(root.contentForeground, 1.4)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            font.italic: true
          }

          // ---- Calculation settings. Method and Asr school are not
          //      cosmetic: Hanafi moves Asr about an hour, and the method
          //      shifts Fajr and Isha by tens of minutes, so both have to
          //      be the user's choice rather than the author's.
          Rectangle {
            width: parent.width
            height: Style.spacing.hairline
            color: root.contentForeground
            opacity: 0.12
          }

          Column {
            width: parent.width
            spacing: 0

            Repeater {
              model: [
                { key: "method", label: "Method" },
                { key: "school", label: "Asr" }
              ]

              Column {
                id: settingRow
                required property var modelData
                readonly property bool expanded: root.openPicker === modelData.key
                width: parent.width
                spacing: 0

                Item {
                  width: parent.width
                  height: Style.space(26)

                  Text {
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(16)
                    anchors.verticalCenter: parent.verticalCenter
                    text: modelData.label
                    color: Qt.darker(root.contentForeground, 1.5)
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                  }

                  Text {
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(16)
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(70)
                    anchors.verticalCenter: parent.verticalCenter
                    horizontalAlignment: Text.AlignRight
                    elide: Text.ElideRight
                    text: root.currentNameFor(modelData.key)
                    color: expanded ? Style.selectedStateColor(root.contentForeground, Color.accent) : root.contentForeground
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                  }

                  MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.togglePicker(modelData.key)
                  }
                }

                Repeater {
                  model: settingRow.expanded ? root.choicesFor(settingRow.modelData.key) : []

                  Rectangle {
                    required property var modelData
                    readonly property string settingKey: settingRow.modelData.key
                    readonly property bool selected: root.currentFor(settingKey) === modelData.id
                    width: parent.width
                    height: Style.space(24)
                    radius: Style.cornerRadius
                    color: optionHover.hovered ? Style.hoverFillFor(root.contentForeground, Color.accent) : "transparent"

                    Text {
                      anchors.left: parent.left
                      anchors.leftMargin: Style.space(28)
                      anchors.right: parent.right
                      anchors.rightMargin: Style.space(16)
                      anchors.verticalCenter: parent.verticalCenter
                      elide: Text.ElideRight
                      text: modelData.name
                      color: selected ? Style.selectedStateColor(root.contentForeground, Color.accent) : root.contentForeground
                      opacity: selected ? 1 : 0.65
                      font.family: root.contentFontFamily
                      font.pixelSize: Style.font.bodySmall
                      font.bold: selected
                    }

                    HoverHandler { id: optionHover; cursorShape: Qt.PointingHandCursor }
                    TapHandler { onTapped: root.setCalculation(settingKey, modelData.id) }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
