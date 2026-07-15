---
title: TLS and Reverse Proxying with Caddy Skill
category: DevOps
description: Put a production reverse proxy in front of your services with automatic HTTPS, health-checked upstreams, and correct client IP handling. Covers Caddyfile structure, ACME rate limits and DNS challenges, HSTS, zero-downtime reloads, and running behind a CDN.
usage: Load this skill before asking your AI assistant to write or debug a Caddyfile, terminate TLS, or front a service with a proxy. Say "use the Caddy reverse proxy skill" and describe your topology — domains, upstreams, and whatever sits in front — and the assistant will produce a Caddyfile with a correct trust boundary instead of a copy-pasted starter config.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 5
timeSavedHours: 10
pocUrl: https://github.com/caddyserver/caddy
---

# TLS and Reverse Proxying with Caddy Skill

## 1. Philosophy

Caddy's pitch is that HTTPS happens without you asking. That is true, and it is exactly why people get burned: **automatic HTTPS is not magic, it is an ACME client with preconditions.** When a precondition is unmet, Caddy fails in a way that looks like "Caddy is broken" rather than "your DNS is wrong."

Three rules govern everything below:

1. **Know what the automation needs before you trust it.** Public DNS pointing at this box, inbound 80 and 443 reachable from the internet, and a data directory that survives restarts. Miss one and you get a cert loop, not a cert.
2. **The trust boundary is a decision, not a default.** `X-Forwarded-For` is a header, and headers are attacker-controlled unless something you trust overwrote them. Every config must answer: *who is allowed to tell me the client's IP?*
3. **Let's Encrypt has a quota and it does not care about your CI.** Five duplicate certificates per exact domain set per week. A container that restarts with an empty volume re-issues every time. Do that in a loop and you are locked out for days.

Caddy's defaults are the best in the business. The failures are always at the seams: DNS, ports, storage persistence, and whatever proxy you forgot was in front of it.

## 2. Tech Stack

- **Caddy** — https://github.com/caddyserver/caddy — licensed **Apache-2.0**. HTTP server, reverse proxy, and ACME client in one static binary with no runtime dependencies.
- **Caddyfile** — the human-facing config format. It compiles to Caddy's native JSON, which is what the admin API speaks. Use JSON only when generating config programmatically.
- **ACME CAs** — Let's Encrypt as issuer, ZeroSSL as the built-in fallback. Both are external services with their own rate limits; neither is part of Caddy.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Caddy maintainers. All example configuration and code are original to this skill.

Optional: a DNS provider plugin, compiled into a custom binary via `xcaddy`, for wildcard certs or hosts with no public inbound (3.5).

## 3. Patterns

### 3.1 What automatic HTTPS actually requires

- **Port 80 inbound** — for the HTTP-01 challenge *and* the redirect everyone expects. People block 80 "for security," then wonder why issuance hangs.
- **Port 443 inbound** — for TLS-ALPN-01 and for serving.
- **Public DNS already resolving to this machine.** The CA resolves your name from the internet. `/etc/hosts` entries and "the record is propagating" both mean failure to the CA.
- **Persistent storage.** Caddy writes the ACME account key and certs to its data directory (`/data` in the official container). **In Docker this must be a volume.** An ephemeral data dir means every restart is a fresh account and a fresh issuance — this is how the quota gets burned (3.5).

```yaml
# docker-compose: the two lines that prevent the outage in 3.5
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data          # certs + ACME account key. NOT optional.
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
```

**Why it fails behind another proxy.** If an ALB or nginx terminates TLS in front of Caddy, the CA's challenge never reaches Caddy's ACME handler — the thing in front answers first, or traffic arrives as plain HTTP on an internal port. Caddy retries and logs challenge failures forever. Two honest options: give Caddy the DNS challenge (3.6) so it needs no inbound reachability, or stop asking Caddy for certs and terminate at the edge. Two ACME clients fighting over one hostname is not a topology, it is a bug.

### 3.2 Caddyfile structure

An optional global options block, then site blocks keyed by address.

```caddyfile
{
	# Global options. Must be first, and only one.
	email ops@example.com          # ACME account contact; expiry warnings go here
	admin localhost:2019           # admin API — never bind this to 0.0.0.0
	servers {
		trusted_proxies static private_ranges   # see 3.4
	}
}

# A bare hostname = automatic HTTPS.
app.example.com {
	encode zstd gzip
	reverse_proxy app:8080
}

# :80 or http:// = explicitly no TLS. For internal listeners and health checks.
:8081 {
	respond /healthz "ok" 200
}

# Snippets keep repetition out of the file. Import them per site block.
(security_headers) {
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		-Server
	}
}

example.com {
	import security_headers

	@api path /api/*              # named matcher: reused, readable
	reverse_proxy @api backend:9000

	root * /srv/www               # everything else is the SPA
	try_files {path} /index.html
	file_server
}
```

Caddy sorts directives by a built-in priority, so ordering matters less than you fear. When you need explicit ordering, wrap in `route`.

### 3.3 reverse_proxy with health checks and load balancing

One-line `reverse_proxy app:8080` is fine for one upstream. With two, you must say what "healthy" means or Caddy will send a third of your traffic into a pod that is still booting.

```caddyfile
api.example.com {
	reverse_proxy api-1:9000 api-2:9000 api-3:9000 {
		lb_policy least_conn        # default is random; least_conn suits uneven work
		lb_try_duration 5s          # retry another upstream before erroring
		lb_try_interval 250ms

		# Active: Caddy polls on its own schedule.
		health_uri /healthz
		health_interval 10s
		health_timeout 2s
		health_status 200

		# Passive: mark an upstream down based on real traffic.
		fail_duration 30s           # DEFAULT IS 0 — passive checks are OFF unless you set this
		max_fails 3
		unhealthy_status 5xx

		transport http {
			dial_timeout 3s
			read_timeout 60s
		}
	}
}
```

Choosing `lb_policy`: `least_conn` for APIs with variable request cost; `round_robin` when every request costs the same; `first` for active/passive failover; `ip_hash`/`cookie` only when the backend is stateful — and if you are reaching for sticky sessions, ask first whether the session belongs in Redis.

That `fail_duration 30s` line matters more than it looks. At the default of 0, a 500-ing upstream stays in rotation forever, because active checks on `/healthz` still pass while the real endpoint burns.

### 3.4 Real client IP and the trust boundary footgun

Caddy **appends** the immediate peer's IP to whatever `X-Forwarded-For` the client sent. That is correct behaviour, and it means the header is a list where **only the entries your own infrastructure added are trustworthy.**

If a client sends `X-Forwarded-For: 1.2.3.4` and connects to you directly, your backend receives `1.2.3.4, <real client IP>`. A backend that reads the *first* entry — which is what every "get the real IP" snippet on the internet does — just believed the attacker. That is how IP allowlists get bypassed and rate limiters defeated: spoof a fresh first entry per request and you have infinite buckets.

The rule: **read from the right, skipping hops you trust.** Tell Caddy which hops are yours.

```caddyfile
{
	servers {
		# Only these sources may contribute a forwarded client IP.
		# `private_ranges` is shorthand — correct behind a same-VPC LB,
		# WRONG if untrusted traffic can reach Caddy from a private range.
		trusted_proxies static 10.0.0.0/8 172.16.0.0/12
		client_ip_headers X-Forwarded-For
	}
}

api.example.com {
	reverse_proxy api:9000 {
		# Hand the backend one unambiguous value, overwriting anything injected.
		header_up X-Real-IP {client_ip}
		header_up X-Forwarded-Proto {scheme}
	}
}
```

If nothing sits in front of Caddy, declare **no** trusted proxies and let the socket peer be the client. Do not configure trust you do not have. `trusted_proxies static 0.0.0.0/0` is not a configuration; it is a decision to believe strangers.

### 3.5 ACME rate limits: the week we could not issue certs

Let's Encrypt enforces **five duplicate certificates per exact set of hostnames per 7 days**, on a rolling window. Not per-account, and not appealable.

A staging deploy ran Caddy with the Caddyfile bind-mounted and `/data` left on the container's ephemeral filesystem — the volume line from 3.1, missing. Nobody noticed for months, because staging redeployed maybe twice a week: two issuances, well under five.

Then a bad health check put the deployment into **CrashLoopBackOff**. Each restart: fresh container, empty `/data`, no cert on disk, new ACME account, new order for the same three hostnames. It cycled roughly every 40 seconds. The fifth issuance landed inside two minutes. Everything after returned `too many certificates already issued for this exact set of domains` — and because `/data` was still ephemeral, there was no cached cert to fall back on. Staging served TLS errors for **six days** until the window cleared. The "just add the volume" fix could not help: the volume had nothing to populate it with.

Three cheap preventions:

```caddyfile
{
	# 1. Dev/staging/CI: the staging CA. Untrusted in the browser, effectively
	#    unlimited issuance. This one line is the whole lesson.
	acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}
```

```caddyfile
{
	# 2. Local dev: no CA at all, no rate limit to hit.
	local_certs
}
```

3. **Persist `/data` everywhere, including staging.** A cached valid cert means a crash loop re-reads from disk and never contacts the CA. The volume turns "restart" into a no-op instead of an ACME order.

Before any change touching domain names:

```bash
caddy validate --config /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
```

### 3.6 DNS challenge for wildcards and internal hosts

HTTP-01 and TLS-ALPN-01 both require the CA to reach you. DNS-01 does not — it proves control by writing a TXT record. That makes it the only option for **wildcard certs** (never issuable over HTTP-01), **internal hosts** with public DNS but no public inbound, and **Caddy behind a terminating proxy** (3.1).

```bash
# Build once in CI; the result is still a single static binary.
xcaddy build --with github.com/caddy-dns/cloudflare
```

```caddyfile
*.internal.example.com {
	tls {
		dns cloudflare {env.CF_API_TOKEN}
		resolvers 1.1.1.1 8.8.8.8      # bypass split-horizon DNS during propagation checks
		propagation_timeout 5m
	}
	reverse_proxy internal-app:3000
}
```

Scope the API token to DNS-edit on that one zone. An account-wide DNS token in an env var on a public-facing proxy is a worse problem than the one you solved.

### 3.7 Static files, compression, and HSTS

```caddyfile
example.com {
	encode zstd gzip          # order = preference; Caddy skips already-compressed types
	root * /srv/www
	file_server

	@immutable path /assets/*                 # fingerprinted: cache hard
	header @immutable Cache-Control "public, max-age=31536000, immutable"

	@html path / /index.html                  # the shell: never cache, or deploys don't land
	header @html Cache-Control "no-cache"
}
```

On HSTS: `max-age=31536000` is a one-year promise that this hostname is always HTTPS. `includeSubDomains` extends that to every subdomain, including that legacy box on plain HTTP. Adding `preload` and submitting to the browser preload list is **effectively irreversible on a human timescale**. Ship `max-age=300` first, confirm nothing breaks, then raise it.

### 3.8 Graceful reload and structured logs

```bash
# Loads and validates the new config, then swaps it in. In-flight requests finish
# on the old config. No dropped connections, no restart.
caddy reload --config /etc/caddy/Caddyfile
```

If the new config fails validation, `reload` errors and the **old config keeps serving**. That is why you never use `systemctl restart caddy` for a config change: restart drops connections and, on a typo, leaves nothing serving at all.

Logs are JSON by default, which is the right call — they are machine input, not prose. Set `output file` with `roll_size`/`roll_keep` when you are not shipping stdout to a collector.

### 3.9 Running behind a CDN

Caddy's peer becomes the CDN edge, not the user. Two things change:

```caddyfile
{
	servers {
		# Trust ONLY the CDN's published egress ranges. Keep this in config
		# management and refresh it — CDNs add ranges.
		trusted_proxies static 203.0.113.0/24 198.51.100.0/24
		client_ip_headers CF-Connecting-IP X-Forwarded-For
	}
}
```

And decide who owns TLS. Either the **CDN terminates and Caddy serves plain HTTP on a firewalled origin port** (simple; Caddy does no ACME at all), or the **CDN re-encrypts to Caddy on 443** and Caddy holds a real cert — which needs the DNS challenge (3.6), because the CDN answers the HTTP-01 challenge before Caddy ever sees it.

What does not work: the CDN's "flexible" TLS mode, speaking HTTPS to the browser and plain HTTP to your origin over the public internet. The padlock is a lie and the traffic is cleartext for most of its journey.

## 4. Anti-patterns

- **Ephemeral `/data` in a container.** Every restart is a fresh ACME order. Add a crash loop and you burn five duplicate certs in two minutes and lose issuance for a week — the outage in 3.5.
- **Blocking port 80 "for security."** HTTP-01 needs it and users type the bare hostname. You broke renewal, which fails silently until the cert expires at 2am on a Sunday.
- **Testing against the production ACME CA.** Dev and CI use `acme_ca` staging or `local_certs`. The production CA is not a test fixture and its quota is shared with your real domains.
- **`trusted_proxies static 0.0.0.0/0`.** Every stranger is now authoritative about their own IP. Your rate limiter, audit log, and allowlist are decorative.
- **Reading the first entry of `X-Forwarded-For`.** That is the attacker-supplied one. Read from the right past trusted hops, or use `{client_ip}` after configuring `trusted_proxies`.
- **Two ACME clients for one hostname.** Caddy and an ALB both issuing for `app.example.com` will race, fail challenges, and burn quota. Pick one owner for TLS.
- **Multiple upstreams with no health checks.** `fail_duration` defaults to 0 — passive checking is off, so a 500-ing pod stays in rotation indefinitely.
- **`systemctl restart caddy` to apply a config change.** Drops in-flight connections, and a typo takes the site down instead of being rejected. Use `caddy reload`.
- **HSTS `preload` on day one.** A one-year, effectively irreversible promise made before you know every subdomain can do TLS. Start at `max-age=300`.
- **Binding the admin API to 0.0.0.0.** It reconfigures the server with no auth. Keep it on localhost, or `admin off`.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the topology front to back: "Cloudflare (proxied) → Caddy in ECS → three API tasks on :9000 and an S3-backed SPA. Wildcard cert for `*.app.example.com`."
3. State explicitly what sits in front of Caddy and its egress ranges. That single fact determines the trust boundary (3.4) and whether you need the DNS challenge (3.6).
4. Ask for, in order: (a) the Caddyfile, (b) the container config proving `/data` persists, (c) a dev override using `local_certs` or the staging CA.
5. Run section 4 as a checklist before the first deploy to a real domain — several items are unrecoverable for days once you get them wrong.

The assistant should refuse to emit a config with blanket-trusted proxies, should always persist the data directory, and should ask what terminates TLS before writing a single site block.

## 6. Example Output

Prompt given with this skill loaded: *"Front our Rails app with Caddy on Fly. Two app instances, health endpoint at /up, static assets from /public, and we need the real client IP for rate limiting. Nothing else is in front of us."*

Expected shape of the answer:

```caddyfile
{
	email ops@example.com
	admin off                # nothing needs the admin API in this deployment

	servers {
		# Nothing is in front of us, so NOTHING is trusted to report a client IP.
		# The socket peer IS the client. Do not add private_ranges "just in case."
		trusted_proxies static
	}
}

app.example.com {
	encode zstd gzip

	# Fingerprinted assets: from disk, cached forever, never proxied.
	@assets path /assets/* /packs/*
	handle @assets {
		root * /srv/public
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}

	handle {
		reverse_proxy rails-1:3000 rails-2:3000 {
			lb_policy least_conn
			lb_try_duration 5s

			health_uri /up
			health_interval 10s
			health_timeout 2s

			fail_duration 30s       # passive checks are OFF by default — turn them on
			max_fails 3
			unhealthy_status 5xx

			# {client_ip} is the socket peer here, since we trust no proxies.
			# The app reads X-Real-IP and never parses X-Forwarded-For itself.
			header_up X-Real-IP {client_ip}
			header_up X-Forwarded-Proto {scheme}
		}
	}

	header {
		Strict-Transport-Security "max-age=300"   # raise to 31536000 after a week of green
		X-Content-Type-Options "nosniff"
		-Server
	}

	log {
		output stdout
		format json
	}
}
```

```yaml
# fly.toml — the part that matters more than the Caddyfile
[mounts]
  source = "caddy_data"
  destination = "/data"      # certs survive restarts; a crash loop cannot burn ACME quota
```

```caddyfile
# Caddyfile.dev — no CA, no quota, no DNS requirement.
{
	local_certs
}
app.localhost {
	reverse_proxy localhost:3000
}
```

Note what the output does *not* contain: no `trusted_proxies` covering private ranges nothing in this topology uses, no HSTS `preload` before anyone verified the subdomains, no admin API listening, and no manual `tls` block with a cert path — because the whole point is that Caddy gets and renews the cert itself, provided `/data` persists.
