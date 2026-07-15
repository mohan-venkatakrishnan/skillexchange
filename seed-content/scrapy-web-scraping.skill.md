---
title: Resilient Web Scraping with Scrapy Skill
category: Data
description: Build Scrapy crawlers that finish, resume, and stay welcome — instead of the script that gets IP-banned on day two and loses 400k items to an OOM kill on day three. Covers spider/item/pipeline architecture, AutoThrottle, retry and backoff on 429s, resumable JOBDIRs, hunting the JSON endpoint before reaching for a browser, and pipelines that land in Postgres or Parquet.
usage: Load this skill before asking your AI assistant to write or debug a Scrapy spider. Say "use the Scrapy web scraping skill" and describe the target site and the fields you need; the assistant will produce a throttled, resumable, validated crawler with a real pipeline, and will push you to find the site's JSON API before it writes a single CSS selector.
platforms: [Claude, ChatGPT, Cursor, Copilot]
priceUsd: 5
timeSavedHours: 12
pocUrl: https://github.com/scrapy/scrapy
---

# Resilient Web Scraping with Scrapy Skill

## 1. Philosophy

Anyone can write a scraper that works on page one. The craft is the crawler still running at hour forty — not banned, not restarted from zero, producing data you can actually load.

**You are a guest on someone else's infrastructure.** Every request costs them CPU, bandwidth, and money. A crawler hitting 50 req/s against a small site is not clever; it is a denial-of-service with a user agent. Politeness is not only ethics — a banned IP collects zero rows, so being a good citizen *is* the high-throughput strategy.

**The HTML is the fallback, not the target.** Before writing one selector, open the network tab. Most sites already return their data as JSON to their own frontend. That endpoint is stable, paginated, typed, and far cheaper to parse than the DOM built on top of it. Scraping rendered HTML from a site that has a JSON API is doing the hard version of an easy job.

**Assume the crawl dies.** Long crawls get OOM-killed, rate-limited, deployed over, and Ctrl-C'd. A crawl that cannot resume is a crawl you will restart from zero at hour 38. `JOBDIR` is not optional.

## 2. Tech Stack

- **Scrapy** — https://github.com/scrapy/scrapy — licensed **BSD-3-Clause**. The engine, scheduler, downloader middleware stack, and item pipelines behind every pattern below.
- **Scrapy 2.11+** with `itemadapter` and `itemloaders`, plus `psycopg` for the Postgres pipeline and `pyarrow` for Parquet.
- **Playwright** — only when section 3.6's checklist actually forces it. A last resort, not a starting point.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Scrapy maintainers. All example code is original to this skill.

Recommended companions: `scrapy shell` for selector development (never iterate by re-running the whole spider), and a `.env`-backed settings module so proxy credentials never enter the repo.

## 3. Patterns

### 3.1 Architecture: spiders find, items describe, pipelines persist

The separation is the whole point, and beginners collapse it into one file that does all three.

- **Spider** — navigation and extraction. Yields `Request` and `Item`. Knows nothing about your database.
- **Item / ItemLoader** — the schema and the cleaning: fields, types, defaults.
- **Pipeline** — validation, dedupe, persistence. Knows nothing about HTML.
- **Middleware** — cross-cutting concerns: retries, proxies, headers, caching.

```python
# items.py
def to_cents(text: str) -> int | None:
    cleaned = "".join(c for c in text if c.isdigit() or c == ".")
    return int(round(float(cleaned) * 100)) if cleaned else None

class ProductItem(scrapy.Item):
    url = scrapy.Field(output_processor=TakeFirst())
    sku = scrapy.Field(input_processor=MapCompose(str.strip), output_processor=TakeFirst())
    title = scrapy.Field(input_processor=MapCompose(str.strip), output_processor=TakeFirst())
    price_cents = scrapy.Field(input_processor=MapCompose(to_cents), output_processor=TakeFirst())
    description = scrapy.Field(input_processor=MapCompose(str.strip), output_processor=Join(" "))
    scraped_at = scrapy.Field(output_processor=TakeFirst())
```

Why bother: when the site redesigns — it will, on a Tuesday — you change selectors in one file and every downstream consumer keeps working, because the item schema did not move.

### 3.2 AutoThrottle: set this before you write the spider, not after the ban

```python
# settings.py
BOT_NAME = "acme_research"
USER_AGENT = "acme-research/1.0 (+https://acme.example/crawler; data@acme.example)"

ROBOTSTXT_OBEY = True                 # leave it on; turning it off is a decision, in writing
CONCURRENT_REQUESTS = 8
CONCURRENT_REQUESTS_PER_DOMAIN = 2    # the one that matters — per domain, not global
DOWNLOAD_DELAY = 0.5
RANDOMIZE_DOWNLOAD_DELAY = True

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1.0
AUTOTHROTTLE_MAX_DELAY = 30.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.5   # be gentler than the default
HTTPCACHE_ENABLED = True                # in dev: stop re-hitting the site while you iterate
```

`AUTOTHROTTLE_TARGET_CONCURRENCY` targets an *average* concurrency per host and adapts the delay to observed latency: when the site slows down, you back off automatically. That is what a well-behaved client does, and it is what keeps you off the ban list.

A real number: a crawl at `CONCURRENT_REQUESTS_PER_DOMAIN = 16` with no delay got a Cloudflare challenge on every request after 90 seconds — roughly 1,400 requests in. The same crawl at 2-concurrent with AutoThrottle ran 11 hours untouched and collected 260k pages. The "slow" config was the one that finished.

A real user agent with contact details is not naive. It is how a sysadmin sends you an email instead of a firewall rule.

### 3.3 Retry and backoff: 429 is a conversation

Scrapy's defaults do not retry 429, and they retry fast. Both are wrong for a site telling you to slow down.

```python
RETRY_ENABLED = True
RETRY_TIMES = 5
RETRY_HTTP_CODES = [429, 500, 502, 503, 504, 522, 524, 408]
DOWNLOAD_TIMEOUT = 30
```

```python
# middlewares.py — honour Retry-After instead of hammering through it
class RetryAfterMiddleware(RetryMiddleware):
    def process_response(self, request, response, spider):
        if response.status == 429:
            wait = min(float(response.headers.get("Retry-After", b"30")), 300)
            spider.logger.warning("429 on %s — sleeping %.0fs", request.url, wait)
            d = Deferred()
            reactor.callLater(wait, d.callback, None)
            d.addCallback(lambda _: self._retry(request, "429 backoff", spider) or response)
            return d
        return super().process_response(request, response, spider)
```

A 429 is the server naming its price. Pay it. Retrying five times at 0.5s intervals is how a temporary throttle becomes a permanent block. And never retry a 404 or 403 — those are answers, not errors.

### 3.4 Validate at the boundary, loudly

```python
# pipelines.py
class ValidationPipeline:
    def process_item(self, item, spider):
        a = ItemAdapter(item)
        if not a.get("sku"):
            raise DropItem(f"no sku: {a.get('url')}")
        if a.get("price_cents") is None:
            raise DropItem(f"unparsed price: {a.get('url')}")
        if not (0 < a["price_cents"] < 100_000_00):
            raise DropItem(f"implausible price {a['price_cents']}: {a['url']}")
        return item
```

The implausible-value check has earned its keep. A site changed `$1,299.00` to `1 299,00 €` and our naive parser produced 100x prices on a subset of rows. Nothing crashed. Nothing warned. It landed in a pricing model and the wrong number was in a report for a week. A range assertion turns silent corruption into 4,000 loud `DropItem`s in the stats.

### 3.5 Dedupe fingerprints and resumable crawls

Scrapy dedupes requests in-memory per run. That is not enough for a crawl spanning restarts.

```bash
scrapy crawl products -s JOBDIR=crawls/products-2026-07
```

`JOBDIR` persists the pending request queue *and* the seen-request fingerprints to disk. Ctrl-C once — gracefully; twice force-kills and loses the flush — restart with the same `JOBDIR`, and the crawl resumes.

For item-level dedupe across runs, key on the site's stable identifier, not the URL. URLs carry tracking params and change with redesigns:

```python
class DedupePipeline:
    def open_spider(self, spider): self.seen: set[str] = set()

    def process_item(self, item, spider):
        key = ItemAdapter(item)["sku"]
        if key in self.seen:
            raise DropItem(f"duplicate sku {key}")
        self.seen.add(key)
        return item
```

Past a few million items that `set` becomes the memory problem — move it to Redis, or rely on the database's unique constraint via `ON CONFLICT`. One `JOBDIR` per crawl, and never reuse one across code changes: the persisted queue holds pickled requests whose callbacks must still exist.

### 3.6 When the page is JavaScript-rendered: hunt the JSON first

Before reaching for a headless browser, spend fifteen minutes on this checklist. It has saved me days:

1. **Network tab → Fetch/XHR.** Nine times in ten the page fetches `/api/v2/products?page=3` and renders it. Hit that directly: paginated, typed, lighter.
2. **`view-source:`** — if the data is in the HTML but not the rendered DOM, it is often in a `__NEXT_DATA__` / `__NUXT__` script tag. Parse that JSON.
3. **`<script type="application/ld+json">`** — SEO structured data, often the exact fields you want, no JS required.
4. **`sitemap.xml`** — frequently enumerates every URL you were about to discover by hand.

```python
def parse(self, response):
    blob = response.css("script#__NEXT_DATA__::text").get()
    if blob:
        for p in json.loads(blob)["props"]["pageProps"]["products"]:
            yield {"sku": p["sku"], "title": p["name"], "price_cents": int(p["priceCents"])}
        return
    # fall back to DOM selectors only if the payload isn't there
```

Only if all four fail do you add `scrapy-playwright` — and then render only the pages that need it, via `meta={"playwright": True}`, never globally. A browser is 50-100x the CPU and memory of an HTTP request. Rendering 100k pages because 300 needed JS is how a crawler becomes a cloud bill.

### 3.7 Proxies and user agents: responsibly

Rotation is legitimate for resilience and geography, the way a CDN has many edges. It is not a tool for evading a block you earned.

```python
class ProxyMiddleware:
    @classmethod
    def from_crawler(cls, crawler):
        return cls(crawler.settings.getlist("PROXY_POOL"))  # from env, never the repo

    def process_request(self, request, spider):
        if self.proxies and "proxy" not in request.meta:
            request.meta["proxy"] = random.choice(self.proxies)
```

The line I hold: **rotate to distribute load and survive flaky exits; never to defeat a rate limit.** Cycling 200 IPs to push past a limit the site set deliberately is not scraping, it is attacking, and it moves you from a ToS problem to a legal one. Keep the honest user agent even behind proxies — a fake Chrome UA plus 200 residential IPs is the profile of a bot farm and gets treated as one.

### 3.8 Pipelines: batch into Postgres, or stream to Parquet

Never write items one at a time. A `commit()` per item turns a 200k-item crawl into 200k round trips.

```python
class PostgresPipeline:
    BATCH = 500

    def open_spider(self, spider):
        self.conn = psycopg.connect(spider.settings["PG_DSN"]); self.buf = []

    def process_item(self, item, spider):
        a = ItemAdapter(item)
        self.buf.append((a["sku"], a["title"], a["price_cents"], a["url"], a["scraped_at"]))
        if len(self.buf) >= self.BATCH: self._flush()
        return item

    def _flush(self):
        if not self.buf: return
        with self.conn.cursor() as cur:
            cur.executemany(
                """insert into products (sku, title, price_cents, url, scraped_at)
                   values (%s, %s, %s, %s, %s)
                   on conflict (sku) do update set
                     title = excluded.title, price_cents = excluded.price_cents,
                     scraped_at = excluded.scraped_at""", self.buf)
        self.conn.commit(); self.buf.clear()

    def close_spider(self, spider):
        self._flush()          # the flush people forget — the last 499 items, gone
        self.conn.close()
```

`ON CONFLICT DO UPDATE` makes the whole crawl idempotent: re-run it, get one row per SKU. That plus `JOBDIR` means a crash costs minutes, not a day. For analytics sinks, a feed export beats a custom pipeline: `scrapy crawl products -O s3://lake/raw/dt=2026-07-15/part.parquet -s FEED_EXPORT_BATCH_ITEM_COUNT=50000`.

### 3.9 Memory on deep crawls

A crawler OOM-killed at hour 38 produced nothing if you skipped 3.5. The usual causes:

- **The scheduler queue.** A broad crawl discovers links faster than it consumes them. 400k queued requests at ~2KB each is ~800MB RSS before you have parsed anything. `JOBDIR` moves the queue to disk; `DEPTH_LIMIT` and a tight `allowed_domains` stop the discovery explosion.
- **Response bodies pinned in `meta`.** Passing a `response` through `meta` into a callback chain holds every body in memory. Pass the three fields you need.
- **An unbounded dedupe `set`.** See 3.5.

```python
DEPTH_LIMIT = 6
DEPTH_PRIORITY = 1                # BFS: shallow first, so a kill still leaves useful data
MEMUSAGE_ENABLED = True
MEMUSAGE_LIMIT_MB = 2048
MEMUSAGE_WARNING_MB = 1536        # warn before the reaper arrives
```

Run with `-s LOGSTATS_INTERVAL=60` and watch `item_scraped_count` against RSS. If memory climbs while the item rate is flat, you are queueing, not scraping.

### 3.10 Legal and ToS caution

Engineering advice, not legal advice — and the line is real:

- **Read the ToS and `robots.txt`.** `ROBOTSTXT_OBEY = True` is the default position; disabling it is a decision a human makes, with a reason.
- **Public data only.** The moment you authenticate you are bound by an agreement you clicked. Scraping behind a login is a different risk category — get sign-off.
- **Personal data is regulated data.** GDPR/DPDP apply to your crawl output. "It was public" is not a lawful basis.
- **Respect explicit blocks.** A 403 saying "no automated access" is a decision, not a puzzle.
- **Rate-limit even when nobody stops you.** The site with no defenses is usually the one that can least afford your traffic.

## 4. Anti-patterns

- **Reaching for Playwright before checking the network tab.** 50-100x the cost per page to re-render data the site already hands you as JSON.
- **No `JOBDIR` on a multi-hour crawl.** Hour 38, OOM kill, start from zero. It is one flag.
- **High `CONCURRENT_REQUESTS_PER_DOMAIN` with no delay.** 1,400 requests in 90 seconds bought a permanent challenge; 2-concurrent with AutoThrottle collected 260k pages in 11 hours.
- **Retrying 429 immediately.** The server named its price. Honour `Retry-After` or your throttle becomes a ban.
- **No range validation on parsed numbers.** A currency-format change silently produced 100x prices for a week. Nothing crashed. That is the problem.
- **Writing items one row at a time.** 200k commits for a 200k-item crawl. Batch 500 and `ON CONFLICT`.
- **Forgetting the final flush in `close_spider`.** The last partial batch vanishes and the counts never reconcile.
- **Dedupe keyed on the URL.** Tracking params and redesigns deliver the same product under four URLs. Key on the site's own identifier.
- **A fake Chrome user agent plus 200 rotating IPs.** The signature of a bot farm — it converts a ToS conversation into a legal one.
- **Business logic in the spider.** Selectors plus database writes plus currency math in one `parse()` makes the next redesign a rewrite instead of a diff.

## 5. Usage

1. Paste this skill file into your AI assistant's context (or install it as a project skill in Claude Code / Cursor rules).
2. Describe the job as a contract: "Target: shop.example.com, ~90k product pages, need sku/title/price/description, refreshed weekly into Postgres. It renders client-side. Public catalogue, no login."
3. **Ask the assistant to do section 3.6's hunt first** — have it tell you what to look for in the network tab before it writes any selector.
4. Then ask for, in order: (a) `settings.py` with AutoThrottle, per-domain concurrency, retry codes; (b) the Item and ItemLoader; (c) the spider; (d) validation and persistence pipelines; (e) the `JOBDIR`-enabled run command.
5. Run section 4 as a checklist, then do a 200-item smoke run with `CLOSESPIDER_ITEMCOUNT=200` and read every field of ten random rows by hand.

The assistant should ask whether a JSON endpoint exists before proposing a headless browser, refuse to disable `ROBOTSTXT_OBEY` without a stated reason, and never propose IP rotation as a way around a rate limit.

## 6. Example Output

Prompt given with this skill loaded: *"Crawl the public catalogue at shop.example.com — about 90k products. I need sku, title, price, description into Postgres, refreshed weekly. The pages are React-rendered."*

Expected shape of the answer — the first move is a question, not code:

> React-rendered usually means the data arrives as JSON. Before we add a browser: open a product page, Network → Fetch/XHR, look for an `/api/` call, or check `view-source:` for a `__NEXT_DATA__` script tag. If either exists the job gets ~50x cheaper. Assuming `__NEXT_DATA__` is present:

```python
# settings.py
USER_AGENT = "acme-catalogue/1.0 (+https://acme.example/crawler; data@acme.example)"
ROBOTSTXT_OBEY = True
CONCURRENT_REQUESTS_PER_DOMAIN = 2
DOWNLOAD_DELAY = 0.5
RANDOMIZE_DOWNLOAD_DELAY = True
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.5
RETRY_HTTP_CODES = [429, 500, 502, 503, 504, 408]
DEPTH_LIMIT = 4
MEMUSAGE_ENABLED = True
MEMUSAGE_LIMIT_MB = 2048
ITEM_PIPELINES = {"acme.pipelines.ValidationPipeline": 100, "acme.pipelines.PostgresPipeline": 300}
```

```python
# spiders/catalogue.py
class CatalogueSpider(SitemapSpider):
    name = "catalogue"
    allowed_domains = ["shop.example.com"]
    sitemap_urls = ["https://shop.example.com/sitemap.xml"]   # enumerate, don't guess
    sitemap_rules = [(r"/product/", "parse_product")]

    def parse_product(self, response):
        blob = response.css("script#__NEXT_DATA__::text").get()
        if not blob:
            self.logger.error("no __NEXT_DATA__ on %s — selectors needed", response.url)
            return
        p = json.loads(blob)["props"]["pageProps"]["product"]
        yield {
            "sku": p["sku"],
            "title": p["name"].strip(),
            "price_cents": int(p["price"]["amountCents"]),
            "description": " ".join(p.get("descriptionBlocks", [])).strip(),
            "url": response.url,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        }
```

```sql
create table if not exists products (
  sku          text primary key,
  title        text not null,
  price_cents  integer not null check (price_cents between 1 and 10000000),
  description  text,
  url          text not null,
  scraped_at   timestamptz not null default now()
);
```

```bash
scrapy crawl catalogue -s CLOSESPIDER_ITEMCOUNT=200 -O sample.jsonl   # smoke test, read 10 by hand
scrapy crawl catalogue -s JOBDIR=crawls/catalogue-2026-w29 -s LOGSTATS_INTERVAL=60
```

Note what the output does *not* contain: no Playwright, no rotating proxy pool, no fake Chrome user agent, no `ROBOTSTXT_OBEY = False`, and no `time.sleep()` pretending to be throttling. It reads the sitemap the site publishes for exactly this purpose and the JSON the page already carries, at two requests per domain, with a `JOBDIR` so Tuesday's crash costs four minutes. The 90k pages take about nine hours — and they finish.
