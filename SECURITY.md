# Security policy

Do not report suspected vulnerabilities in public issues. Use GitHub's private security advisory flow for this repository and include reproduction steps, impact, and affected version.

Do not commit credentials, tokens, private keys, user exports, invite codes, or production configuration. Cloudflare Pages secrets must be stored with the platform secret mechanism, never in `vars`, `.dev.vars`, or source control.

The local `DEV_EMAIL` development bypass is accepted only on loopback requests. It must never be used to authenticate a deployed request.
