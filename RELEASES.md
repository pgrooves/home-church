# Releases

One row for each build sent to the App Store and Google Play, newest first.
`/new-build` writes it, and nothing else should: **the commit that adds a
row is the code that build was made from**, and that is how the next
`/new-build` knows where "what changed since the last build" starts.

- **Version** is what people see in both stores. It goes up by one for each
  App Store release, and `versionName` in `android/app/build.gradle`
  matches it.
- **iPhone build** goes up by one on every upload and never starts over.
  It is typed into Xcode on the laptop, so this file is the only record of
  it here.
- **Android build** is the number of the Android run on the commit that
  added the row (github.com → the repo → **Actions** → **Android**). It is
  also in the file name, `home-church-<version>-build-<N>.aab`.
- **Status** is filled in by the next `/new-build`: `Live`,
  `TestFlight only` or `Never uploaded`.

| Date | Version | iPhone build | Status | What's New |
|---|---|---|---|---|
