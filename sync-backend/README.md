AurelyStudio private device synchronization

Each business creates a separate random workspace in Device Sync. The server stores an authentication hash and AES-GCM ciphertext. The encryption key stays on the client. Exact app origins, bounded request bodies, setup rate limits, a Free-plan capacity guard and revision compare-and-swap are enabled. No email or payment account is required.

The current Worker uses Cloudflare Workers Free and D1 Free. MAX_WORKSPACES is an owner-side capacity guard, not a local record limit. Each encrypted snapshot is capped at 600 kB before encryption to keep the free database budget bounded. Records remain local when the service is unavailable.

Install the free development dependencies and run npm run sync:deploy with the owner account. Keep runtime.js false for the full app. The public demo uses true and disables private workspace enrollment, backup import and persistence. Never place connection codes, private seeds or OAuth credentials in this repository.
