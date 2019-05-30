# torjs-webext.js

A WebExtension that runs an *experimental* WebAssembly Tor client, using mozilla/libdweb for TCP networking APIs.

## Disclaimer

This is produced independently and carries no guarantee from the Tor Project organization. Any references to Tor do not imply endorsement from the Tor Project.

## Build
```
make
```

This creates a zip file in `web-ext-artifacts` folder that can be installed in Firefox Developer Edition or Nightly via `about:debugging`.

`MOZ_DISABLE_CONTENT_SANDBOX=1` seems to be needed in order to be able to create a local server.

## Run
```
make run
```

This assumes `firefox-developer-edition` executable is available.
