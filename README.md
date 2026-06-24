# Press2Safety

Emergency SOS app for Android. Trigger an alert from a **locked phone** using configured hardware buttons (volume up/down, power). The app automatically:

1. **Sends SMS** with your preconfigured message to all SMS contacts
2. **Records ambient audio** for a configurable duration
3. **Shares the recording** to configured WhatsApp contacts (voice note)
4. **Tracks GPS location** and sends periodic SMS updates with Google Maps links

## Platform note

This project targets **Android** because iOS does not allow third-party apps to intercept hardware buttons on the lock screen, send SMS silently, or post WhatsApp voice messages in the background.

## How the trigger works

Press2Safety uses an **Accessibility Service** to listen for hardware key events while the screen is off or the device is locked. Default pattern: **3 presses** of Volume Up and/or Volume Down within **2 seconds**.

You configure which buttons count, how many presses are required, and the time window in the app.

## Setup (required once)

1. Install the app on your Android phone (API 26+).
2. Open **Press2Safety** and add emergency contacts (international format, e.g. `+351912345678`).
3. Tap **Grant permissions** (SMS, microphone, location, notifications).
4. Tap **Allow background location** so tracking works when the phone is locked.
5. Tap **Enable accessibility service** and turn on **Press2Safety** in system settings.
6. Toggle **Enable SOS monitoring** and tap **Save configuration**.

Use **Test SOS** to verify SMS, recording, location, and WhatsApp flow without pressing hardware buttons.

## What happens when SOS fires

| Step | Action |
|------|--------|
| Immediate | SMS to all SMS contacts with your message + timestamp + GPS link (if enabled) |
| During SOS | Foreground service records microphone audio for N seconds |
| During SOS | Location updates sent via SMS every M seconds for up to T minutes |
| After recording | WhatsApp opens per contact with the audio attached (see limitation below) |

## Important limitations

### WhatsApp voice messages
WhatsApp does **not** provide a public API for silently sending voice notes to personal chats. Press2Safety attaches the recording and opens WhatsApp for each configured contact. On some devices/Android versions you may need to confirm send, or the app may need to be in the foreground. SMS remains the primary fully automatic channel.

### Power button
Power-button detection depends on the device manufacturer and Android version. Volume buttons are the most reliable trigger when the phone is locked.

### Battery optimization
Disable battery optimization for Press2Safety on aggressive OEM skins (Samsung, Xiaomi, Huawei, etc.) so the monitor service survives.

### Legal & safety
- Only use for genuine emergencies.
- Inform your contacts that they will receive automated SOS messages.
- Sending SMS and sharing location may incur carrier costs.
- This app is not a replacement for official emergency services (112, 911, etc.).

## Web dashboard (multi-client admin)

Press2Safety includes a **web dashboard and API** so admins can manage emergency contacts and smartphone configuration remotely. Each **client network** (tenant) is fully isolated — contacts and devices from one client are never visible to another.

### Start the server

Requirements: Node.js 20+

```bash
cd server
npm install
cp .env.example .env
npm run seed
npm start
```

Open **http://localhost:3000** in a browser.

### Demo accounts (after seed)

| Role | Email | Password |
|------|-------|----------|
| Platform super admin | admin@press2safety.local | changeme123 |
| Acme client admin | admin@acme.example | changeme123 |
| Hospital client admin | admin@hospital.example | changeme123 |

Acme and Hospital are **separate client networks** with their own contacts, smartphones, and SOS settings.

### Dashboard features

- **Client networks** (super admin) — create isolated tenants
- **Contacts** — manage SMS / WhatsApp / location recipients per client
- **Admin users** — add, disable, reset passwords for tenant administrators
- **Smartphones** — register devices and get a **device token**
- **Device config** — edit SOS settings and assign contacts; phones pull config via sync

### Link a smartphone to the dashboard

1. In the web dashboard, open the client network and register a smartphone.
2. Copy the **device token** shown once at registration.
3. On the Android app, enter the server URL (e.g. `http://192.168.1.10:3000` for LAN) and device token.
4. Enable **Configuration managed by web dashboard** and tap **Sync configuration now**.

When remote management is on, local config fields are read-only on the phone; the admin controls everything from the web.

### API overview

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/auth/login` | — | Admin login |
| `GET /api/tenants/:tenantId/contacts` | JWT | List contacts |
| `GET /api/tenants/:tenantId/users` | JWT | List tenant admin users |
| `POST /api/tenants/:tenantId/users` | JWT | Create tenant admin |
| `PUT /api/tenants/:tenantId/users/:id` | JWT | Update user / reset password |
| `PUT /api/tenants/:tenantId/devices/:id/config` | JWT | Push device config |
| `GET /api/device/config` | `X-Device-Token` | Phone pulls config |

## Build from source

Requirements: Android Studio Ladybug or newer, JDK 17, Android SDK 35.

```bash
cd Press2Safety
./gradlew assembleDebug
```

Install the APK from `app/build/outputs/apk/debug/`.

Or open the project in Android Studio and run on a device.

## Project structure

```
Press2Safety/
├── app/                         # Android smartphone app
├── server/                      # Node.js API + serves web dashboard
├── web/                         # Admin dashboard (static SPA)
└── README.md
```

```
app/src/main/java/com/press2safety/
├── MainActivity.kt              # Configuration UI + cloud sync
├── sync/RemoteConfigClient.kt   # Pulls config from web API
├── accessibility/
│   └── SosAccessibilityService.kt
├── service/
│   ├── SosMonitorService.kt
│   └── SosResponseService.kt
└── sos/
    ├── ButtonPressDetector.kt
    └── SosOrchestrator.kt
```
## Configuration options

- **SMS contacts** — required; receive all automatic texts
- **WhatsApp contacts** — receive environment audio after recording
- **Location contacts** — receive GPS SMS updates (defaults to SMS contacts)
- **SMS message** — custom emergency text
- **Recording duration** — 10–300 seconds
- **Location interval** — 15–300 seconds between updates
- **Tracking duration** — 5–120 minutes
- **Trigger buttons** — Volume Up, Volume Down, Power (any combination)
- **Presses required** — 2–5 within the press window

## License

Use responsibly. No warranty; test thoroughly on your device before relying on it in an emergency.
