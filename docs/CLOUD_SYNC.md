# Cloud sync

Cloud sync is optional. The browser remains usable from its local store when the service is unavailable.

Use `wrangler.example.toml` only as a placeholder-based configuration reference. Configure real D1 bindings and Cloudflare Access values in restricted deployment operations. Store sensitive values with Cloudflare Pages secrets, not in source-controlled variables.

Cloudflare Access JWTs must be verified for issuer, signature, and audience. The local `DEV_EMAIL` helper is for loopback Pages development only.
