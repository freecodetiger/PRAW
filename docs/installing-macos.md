# Installing PRAW on macOS

This guide covers the GitHub-hosted macOS releases of PRAW.

Some macOS releases can still be unsigned or unnotarized when the project is published without Apple Developer credentials, so macOS may block the first launch. If that happens, use the steps below.

## 1. Choose the right download

Open the target GitHub release and download:

- `aarch64` / `arm64` if you use an **Apple Silicon** Mac
- `x64` / `x86_64` if you use an **Intel** Mac

Prefer the `.dmg` asset unless you explicitly need the `.app.tar.gz` archive.

## 2. Install the app

1. Double-click the downloaded `.dmg`
2. Drag `PRAW.app` into the `Applications` folder
3. Eject the disk image

## 3. Open it the first time

Try to open `PRAW.app` from `Applications`.

If macOS warns that the app cannot be opened because Apple cannot verify it:

1. In `Applications`, right-click `PRAW.app`
2. Click `Open`
3. Click `Open` again in the confirmation dialog

If macOS still blocks it:

1. Open `System Settings`
2. Go to `Privacy & Security`
3. Find the blocked PRAW launch message near the bottom
4. Click `Open Anyway` / `仍要打开`
5. Confirm once more

## 4. When to use the archive instead

Use the `.app.tar.gz` asset only when:

- you want to inspect the raw `.app` bundle
- you are scripting installation yourself
- the `.dmg` mount step is failing on your machine

For normal testing, the `.dmg` path is simpler.
