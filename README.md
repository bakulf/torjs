# torjs-webext.js

A WebExtension that runs an *experimental* WebAssembly Tor client.

This is a fork of: https://github.com/acatarineu/torjs-webext

## Disclaimer

This is produced independently and carries no guarantee from the Tor Project organization. Any references to Tor do not imply endorsement from the Tor Project.

## Build
```
make
```

This creates a zip file in `web-ext-artifacts` folder that can be installed in Firefox Developer Edition or Nightly via `about:debugging`.

Set the pref `extensions.experiments.enabled` to `true` in order to allow the experimental TCP API.
If you run the extension without creating a XPI, you must set the environment variable `MOZ_DISABLE_CONTENT_SANDBOX=1`.

## Run
```
make run
```

This assumes `firefox-developer-edition` executable is available.
