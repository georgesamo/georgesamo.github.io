# georgesamo.github.io

Personal site of **Giorgi “Samuka” Samukashvili**, Senior Ruby on Rails Engineer.
Live at **https://georgesamo.github.io**.

A résumé that boots like a Rails app: the career is a `git log --graph`, skills are a `Gemfile`,
education runs as `db/migrate`, and there's an interactive terminal (`Ctrl K`, try `help`).

## Editing content

Everything lives in [`_data/resume.yml`](_data/resume.yml). Change it, commit, push to `main`,
and GitHub Actions rebuilds and deploys the site (about a minute).

| What | Where |
| --- | --- |
| Page structure | `index.html` |
| Styles, colors, light/dark themes | `assets/css/main.css` |
| Boot log, git graph, gem trace, contact form | `assets/js/app.js` |
| Rotating ruby | `assets/js/gem.js` |
| Terminal commands and easter eggs | `assets/js/terminal.js` |
| Downloadable résumé (no phone/DOB) | `assets/samuka-resume.pdf` |
| Link-preview image | `assets/og-image.png` (`scripts/make_og_image.py`) |

## Contact form

Messages go through [FormSubmit](https://formsubmit.co) to the address in `_config.yml`
(`contact_endpoint`). The very first message triggers a one-time activation email; click it once.
Afterwards you can swap the email in the URL for the random alias FormSubmit gives you, so the
address isn't in the page source.

## Local preview (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows-preview\serve.ps1
```

Then open http://127.0.0.1:4000. This uses `scripts/windows-preview/Gemfile`, which avoids gems that
need a C compiler on Windows. GitHub's Linux build uses the root `Gemfile`.

## News · markets tab

`/news/` has a **markets** tab: market headlines and prices from [Finnhub](https://finnhub.io)
(free tier), each read by built-in finance rules (no AI, no cost): which stocks it may move,
which way, how hard, and the phrases behind it. Strong calls (one per ticker) are scored against
the real price after 3 days. Everything runs for free.

| What | Where |
| --- | --- |
| Fetch, track and score | `scripts/fetch_markets.rb` (runs in `pages.yml` before every build) |
| The rules that read headlines | `scripts/markets_rules.rb` (phrases, events, impact) |
| Tests (no network) | `bundle exec ruby tests/fetch_markets_test.rb` |
| Tickers, company aliases, sectors, scheduled events | `_data/markets_sources.yml` |
| Data (carried over in the Actions cache; the committed copy is the fallback) | `_data/markets.json` |

It needs one repository secret, `FINNHUB_API_KEY` (free key). Without it the build keeps the
last `_data/markets.json` and nothing else changes. Not financial advice.
