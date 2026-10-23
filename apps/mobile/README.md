# @finora/mobile

The Finora mobile app: Expo/React Native authentication and a read-only
overview backed by the Finora web API. The app signs in with an existing
email/password account and stores the bearer token in Expo SecureStore — never
in AsyncStorage or plain files.

Fixture data remains in `src/data/fixtures.ts` for the unit tests only. The
running app never falls back to it.

## Requirements

- Node.js 24.x (matches the repository and CI)
- pnpm 12.6.0 (the workspace package manager)
- A running Finora web backend (`pnpm --filter @finora/web dev`)
- A user account created through the web app
- Expo Go on a physical device, or an emulator/simulator:
  - Android: Android Studio with an Android Virtual Device running
  - iOS: Xcode with an iOS Simulator (macOS only)

## Backend URL

The app selects a development URL automatically:

- Android emulator: `http://10.0.2.2:3000`
- iOS simulator/web: `http://127.0.0.1:3000`

For a physical device or a different backend, set `EXPO_PUBLIC_API_URL` before
starting Expo:

```sh
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.20:3000"
pnpm --filter @finora/mobile start
```

The phone and the development machine must be on the same network, and the
backend port must be reachable. Use HTTPS in production; do not ship a
production build pointing at a plain HTTP endpoint.

## Install

From the repository root:

```sh
pnpm install
```

## Run

From the repository root:

```sh
pnpm --filter @finora/mobile start
```

Then press `a` for an Android emulator, `i` for an iOS Simulator, or scan the QR
code with Expo Go on a physical device.

Direct shortcuts:

```sh
pnpm --filter @finora/mobile android
pnpm --filter @finora/mobile ios
```

The app targets Expo SDK 58 (React Native 0.88, React 19.3). The installed Expo
Go version must support that SDK.

## Session handling

- Login calls `POST /api/mobile/auth/login` and stores the returned token,
  expiry, and minimal user profile in SecureStore.
- On startup the token is restored and expiry is checked locally before the
  overview is requested.
- `GET /api/mobile/overview` sends the token as `Authorization: Bearer …`.
- A `401` deletes the stored token and returns to the login screen.
- Logout deletes the stored token before showing the login screen.

## Checks

```sh
pnpm --filter @finora/mobile typecheck
pnpm --filter @finora/mobile lint
pnpm --filter @finora/mobile test:unit
```

## Shared code

`@finora/shared` is a workspace dependency. Mobile imports money and Jalali
formatting plus mobile API DTOs directly from its public entry point.
`metro.config.js` configures the pnpm workspace root so Metro can watch and
bundle the shared package source.
