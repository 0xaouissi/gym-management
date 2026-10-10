# Hardware integration guide

How the app talks to RFID readers and turnstiles, how to configure the ZK TS1000, and what to do
when something does not connect.

## Architecture

All hardware lives in the **Electron main process** — the renderer only displays status and results.

```
src/main/hardware/
  contracts.ts                    RFIDReader / TurnstileController interfaces
  manager.ts                      builds adapters from settings, reconnect loop, status events
  MockRFIDReader.ts               + MockTurnstileController.ts   (development)
  passive.ts                      keyboard-wedge reader placeholder
  serial.ts                       lazy loader for the optional "serialport" module
  SerialRFIDReader.ts             COM-port reader
  TcpRFIDReader.ts                network reader
  HttpTurnstileController.ts      HTTP relay/controller
  TcpTurnstileController.ts       raw TCP controller (hex frames)
  SerialRelayTurnstileController.ts  ZK TS1000 style serial relay
  uidStream.ts                    UID accumulation/parsing + hex command helpers
```

The two interfaces every adapter implements (`contracts.ts`):

```ts
interface RFIDReader {
  connect(): Promise<void>
  disconnect(): Promise<void>
  onCardDetected(callback: (uid: string) => void): void
  onConnectionChange?(callback: (connected: boolean, detail: string) => void): void
  isConnected?(): boolean
}

interface TurnstileController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  open(): Promise<void>
  lock(): Promise<void>
  getStatus(): Promise<string>
  onConnectionChange?(callback: (connected: boolean, detail: string) => void): void
  isConnected?(): boolean
}
```

The `HardwareManager` builds the right adapter from the saved settings, connects on startup and
**retries every 10 seconds** while a device is down. Status changes are pushed to the UI (badges on
the Settings page and in the header). The access service holds a stable proxy handle, so a
reconnect never leaves a stale controller reference behind.

A scan always flows through the backend:

```
reader → HardwareManager → AccessService.processScan()  (validate → open only if allowed → log)
```

**UID normalization:** before lookup, UIDs are trimmed, uppercased and stripped of spaces, `:` and
`-`. So `aa:bb cc-dd ee` matches the card stored as `AABBCCDDEE`.

**Scan sources** recorded in the log: `MOCK`, `SIMULATED` (Simulate button), `KEYBOARD`, `SERIAL`,
`TCP`, `MANUAL` (typed on Live Access).

## RFID reader modes

Configure in **Settings → RFID reader** (administrators only). All reader modes share the
`deviceName` label used in access logs.

### Mock (default)

No hardware. Use **Live Access → Simulate RFID scan** (default UID `AABBCCDDEE`) or the automated
tests. The status badge reads “Mock reader ready”.

### Keyboard wedge (USB HID)

Many USB readers emulate a keyboard: they “type” the UID and press Enter.

- Choose `Keyboard wedge (USB HID)` — nothing else to configure; the reader must be in HID mode
  (usually a DIP switch / configuration card from the vendor).
- The app listens window-wide: keystrokes arriving less than 120 ms apart, at least 4 characters,
  terminated by **Enter**, are treated as one card scan and evaluated immediately. This works on
  every screen, so staff can keep the app on any page.
- When a dialog asks you to present a card (“Scan UID”, assigning/replacing a card), the app
  switches to **capture mode**: the next scan fills the field instead of being evaluated against
  subscriptions.

### Serial port (COM)

For readers connected over RS‑232/USB‑serial that stream UIDs.

| Field       | Meaning                                                             |
| ----------- | ------------------------------------------------------------------- |
| Serial port | e.g. `COM3` — see Windows Device Manager → Ports                     |
| Baud rate   | must match the reader (9600 is typical)                              |
| Parser      | `LINE` — UIDs are delivered on their own line (CR/LF terminated)     |
|             | `RAW` — every received chunk is one complete UID                     |

Requires the optional `serialport` module (see below). Connection drops are detected and retried
automatically.

### TCP / Ethernet

For readers exposing a TCP server or serial-to-Ethernet converters (Moxa, USR, …).

| Field    | Meaning                          |
| -------- | -------------------------------- |
| Host     | e.g. `192.168.1.100`             |
| TCP port | e.g. `4001`                      |
| Parser   | `LINE` or `RAW` (as above)       |

Connect timeout is 5 s; TCP keepalive is enabled so dead links are noticed quickly.

## Turnstile modes

Configure in **Settings → Turnstile (ZK TS1000)** (administrators only). Changing RFID/turnstile
settings reconnects the hardware automatically. Use **Test open** to verify the wiring without a
card.

### Mock (default)

Counts open commands; used for development and tests. **Test open** always succeeds.

### HTTP API

For relay boards/controllers with an HTTP endpoint.

- `URL` (e.g. `http://192.168.1.150/api/open`), `Method` GET or POST.
- Connect = reachability probe (4 s timeout); Open = request (6 s timeout); any non‑2xx response is
  treated as a failure. `lock()` is a no-op — pulse relays close the contact themselves.
- `Open duration` is a display setting for staff expectations (how long the lane stays open).

### TCP (hex commands)

For controllers commanded with raw binary frames over TCP.

- `Host` / `TCP port` (e.g. `192.168.1.150:4002`).
- `Open command (hex)` — e.g. `A0 01 01 A2`. Spaces, colons and dashes are ignored; the value must
  be an even-length hex string.
- `Lock command (hex)` — optional; only sent when configured.

### Serial relay (ZK TS1000)

The most common TS1000 setup: release the turnstile by **pulsing a relay** over a COM port
(usually a USB↔RS‑232/RS‑485 adapter).

| Field                  | Meaning                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| Serial port / Baud     | e.g. `COM4` @ `9600` — must match the controller                  |
| Open command (hex)     | frame that energizes the relay, e.g. `A0 01 01 A2`                |
| Lock command (hex)     | optional explicit release frame; otherwise the relay is restored  |
| Relay pulse (ms)       | how long the relay stays energized (default 500 ms)               |

## ZK TS1000 — step-by-step

The TS1000 is a tripod turnstile controller. Card reading and door release are separate concerns in
this app: your **RFID reader** (serial, TCP or keyboard wedge) supplies the UID; the **turnstile
controller** only receives open commands. No Wiegand integration is required.

1. **Wire the serial link.** Connect the controller (or its USB↔serial adapter) to the PC.
   Note the COM port in Device Manager. Match the controller's baud (9600 default here).
2. **Configure the app.** Settings → Turnstile → mode `Serial relay`, port `COM4`, baud `9600`,
   `Open command` = the release frame from your controller's manual, relay pulse 500 ms.
   The shipped `A0 01 01 A2` is an example — it is **not** universal; replace it with the exact
   frame your controller expects.
3. **Save, then press Test open.** The log shows the result; failures appear verbatim (timeouts,
   port errors, bad frames).
4. **Check the status badge** — turnstile “connected” and reader “connected”.
5. **Live test** — scan a card with an active subscription: the verdict banner turns green and the
   turnstile releases. Denied scans keep the lane closed and are logged with a reason.

**TCP instead of serial:** put a serial-to-Ethernet converter on the controller, choose mode `TCP`,
enter the converter's IP/port (e.g. `192.168.1.150:4002`) and the same hex frame.

**Relay board instead of serial:** use `HTTP` mode if the relay board has an HTTP API.

> Hardware configuration is restricted to administrators, and the backend re-checks that rule on
> every change — hiding the buttons is only a convenience, not the security boundary.

## Optional `serialport` dependency

Serial modes (COM reader, serial relay) need the optional `serialport` module:

```bash
npm install serialport
```

- The module is loaded lazily at connect time and kept out of the bundle, so the app installs,
  builds and runs normally without it; serial modes simply report
  *“The optional serialport module is not available. Install it with npm install serialport …”* in
  the hardware status.
- For a packaged installer, install it before running `npm run package`; electron-builder rebuilds
  native modules for Electron automatically.

## Auto-reconnect & status

- On startup and every 10 s while disconnected, the manager retries failed connections (reader and
  turnstile independently).
- The current `HardwareStatus` (reader mode + connection detail, turnstile mode + connection detail,
  database path) is broadcast to the UI on every change and shown in Settings → Hardware status.
- Reconnect attempts never interrupt access decisions: if the controller is unreachable, the scan is
  still evaluated and **logged**, and the outcome carries the hardware error.

## Troubleshooting

| Symptom                                         | Likely cause / fix                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| “optional serialport module is not available”   | `npm install serialport` in the project, restart the app                              |
| “Cannot open COM3: Access denied”               | port busy (another app/open instance) or wrong port name                              |
| “Cannot connect to …: Timed out”                | wrong IP/port, firewall, converter not in TCP-server mode                             |
| UIDs look garbled                               | wrong baud rate, or wrong parser (`LINE` vs `RAW`)                                    |
| Turnstile never opens, scans show ALLOWED       | check turnstile badge + **Test open**; verify open command hex and relay wiring       |
| Keyboard reader types into other apps           | the wedge reader must be connected as HID; the app only hears keys while focused      |
| Card reads as UNKNOWN_CARD                      | card UID not registered — check RFID Cards page (or capture it with “Scan UID”)       |
| Devices stay disconnected after editing         | press **Reconnect** in Settings; changes to RFID/turnstile settings reconnect anyway   |

## Adding another vendor

1. Implement `RFIDReader` and/or `TurnstileController` in `src/main/hardware/`.
2. Register it in `createReader()` / `createTurnstile()` in `manager.ts`.
3. Add the mode to `RfidReaderMode` / `TurnstileMode` in `src/shared/types.ts` and to the labels in
   the Settings page.

The access pipeline (`AccessService`, logging, turnstile-only-when-allowed) needs no changes.
