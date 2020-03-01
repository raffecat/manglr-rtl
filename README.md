# Manglr runtime library

This library is deployed in-browser with manglr apps.
Apps are produced by the manglr AoT (ahead-of-time) compiler.

### Building

Requires node.js

```
npm install
rollup -c
```

Generates the following files:

```
build/manglr.debug.js
build/manglr.min.js
```
