# Releasing PRAW

This repository uses one shared `desktop-release` workflow for macOS and Linux artifacts.

## Release Lanes

- `main` pushes create an automatic **prerelease**
- `v*` tags create an automatic **draft formal release**

Formal releases are intentionally left as drafts so a human author can review the assets and hand-write the final public notes.

## Formal Release Steps

1. Merge the target code into `main`
2. Update the application version if needed
3. Create a tag such as `v0.1.2`
4. Push the tag
5. Wait for `desktop-release` to finish
6. Open the generated **Draft Release**
7. Review assets
8. Edit the release notes
9. Click **Publish release**

## macOS Signing And Notarization

Unsigned macOS apps can show up as “damaged” or fail to open under Gatekeeper.

To produce a formally installable macOS build, the workflow expects Apple signing and notarization credentials.

### Required Apple-side prerequisites

You need:

- an active Apple Developer Program membership
- access to create a **Developer ID Application** certificate
- an Apple ID that can submit notarization requests for the same team

### How to apply / prepare the credentials

#### 1. Join the Apple Developer Program

Start here:

- https://developer.apple.com/programs/enroll/

Use the same Apple team that will own the desktop app signing identity.

#### 2. Create a Developer ID Application certificate

Start here:

- https://developer.apple.com/account/resources/certificates/list

Use **Developer ID Application** as the certificate type.

Typical flow:

1. open **Keychain Access**
2. create a certificate signing request (CSR)
3. create the **Developer ID Application** certificate in Apple Developer
4. download it
5. import it back into Keychain Access
6. export it as a `.p12` file with a password

#### 3. Create an app-specific password for notarization

Start here:

- https://support.apple.com/102654

This password is used as `APPLE_PASSWORD` in CI. Do **not** use your normal Apple ID password.

#### 4. Find your Apple Team ID

You can get it from your Apple Developer membership/account page.

This goes into `APPLE_TEAM_ID`.

### GitHub Secrets to add

Add these repository secrets:

- `APPLE_CERTIFICATE` — base64-encoded `.p12`
- `APPLE_CERTIFICATE_PASSWORD` — password used when exporting the `.p12`
- `KEYCHAIN_PASSWORD` — temporary CI keychain password (choose any strong random string)
- `APPLE_ID` — Apple ID email used for notarization
- `APPLE_PASSWORD` — app-specific password for that Apple ID
- `APPLE_TEAM_ID` — Apple Developer Team ID

Optional:

- `APPLE_PROVIDER_SHORT_NAME` — only if your Apple ID needs an explicit provider short name for notarization

### How to create `APPLE_CERTIFICATE`

On your Mac:

```bash
base64 -i developer-id-application.p12 | pbcopy
```

Paste the copied value into the `APPLE_CERTIFICATE` GitHub secret.

If your shell/base64 implementation differs, any equivalent **single-line base64** output is fine.

## CI Behavior Contract

- macOS prereleases will be signed/notarized automatically when the Apple secrets are present
- tagged releases on macOS will **fail early** if the required Apple signing/notarization secrets are missing
- Linux assets do not depend on the Apple credentials
- formal tagged releases remain **drafts** until a human publishes them
