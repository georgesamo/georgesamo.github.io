# Samuka · markets fetcher for the /news/ "markets" tab
#
# Pulls market headlines and quotes from Finnhub, has Claude turn each new headline into a
# catalyst card (which tickers it moves, which way, how hard, why, what would prove it wrong),
# turns strong cards into tracked calls and scores them against the real price after 3 days.
# Writes _data/markets.json, which Jekyll renders into the markets tab on /news/.
#
#   FINNHUB_API_KEY=... ANTHROPIC_API_KEY=... bundle exec ruby scripts/fetch_markets.rb
#   bundle exec ruby scripts/fetch_markets.rb --dry-run   # print what would be written
#
# Like fetch_news.rb, every run starts from the last run's file (CI restores it from the
# Actions cache, and the committed copy is the fallback), so headlines, calls and the scorecard
# carry over between builds. Without the API keys it changes nothing and exits cleanly, so
# local and fork builds still work. Research support only, not financial advice.
require "date"
require "digest"
require "json"
require "net/http"
require "time"
require "uri"
require "yaml"

module Markets
  ROOT = File.expand_path("..", __dir__)
  SOURCES = File.join(ROOT, "_data/markets_sources.yml")
  OUT = File.join(ROOT, "_data/markets.json")
  AGENT = "SamukaMarketsBot/1.0 (+https://georgesamo.github.io/news/)"
  MODEL = ENV.fetch("CLAUDE_MODEL", "claude-opus-5-5")

  ITEM_MAX_AGE = 4 * 86_400     # analyzed stories kept this long
  ITEM_MAX = 150
  PENDING_MAX_AGE = 2 * 86_400  # headlines not analyzed by then are dropped
  PENDING_MAX = 150
  ANALYZE_PER_RUN = ENV.fetch("MARKETS_ANALYZE_LIMIT", 30).to_i
  CALL_HISTORY = 120 * 86_400   # scored calls kept for the scorecard
  MIN_IMPACT = 3
  MIN_CONFIDENCE = 0.5
  HORIZON_DAYS = 3
  DIRECTIONS = %w[bullish bearish neutral].freeze
  EVENT_TYPES = %w[
    earnings guidance macro_data central_bank policy_regulation geopolitics product_launch
    conference mergers_acquisitions analyst_rating legal supply_chain management_change other
  ].freeze

  SYSTEM_PROMPT = <<~PROMPT.freeze
    You are a markets analyst who reads one news item and judges how it is likely
    to move US-listed stocks over the next 1-5 trading days.

    Be calibrated, not dramatic. Most headlines are noise or already priced in:
    give those impact 1-2 and direction "neutral". Reserve impact 4-5 for news that
    plausibly moves a large company or a whole sector by several percent
    (earnings surprises, guidance changes, central-bank decisions, major
    regulation, big M&A, flagship product launches at conferences).

    Field guide:
    - headline_summary: one plain sentence, max 25 words.
    - tickers: US tickers directly affected, including clear second-order names
      (suppliers, competitors, customers). Uppercase symbol, max 6. Empty if none.
      Give EACH ticker its own direction for that company. Stories often split:
      an oil spike is bullish for producers but bearish for airlines; a CEO exit
      can be bearish for the company and bullish for its rivals. Never copy the
      overall direction onto a ticker it doesn't fit; use neutral when unsure.
    - sectors: pick from the allowed list only.
    - direction: the overall market read of the story (bullish, bearish or
      neutral). It drives the market-mood gauge, not the per-ticker calls.
    - sentiment: -1.0 (very negative) to 1.0 (very positive).
    - impact: integer 1-5 as described above.
    - confidence: 0.0-1.0, how sure you are about the directions.
    - rationale: 1-3 sentences on the mechanism, citing comparable past events
      when you know them.
    - invalidation: one sentence on what would prove this call wrong.

    This is research support, not investment advice.
  PROMPT

  class Refused < StandardError; end

  module_function

  # ---------------------------------------------------------------- helpers

  def id_for(url) = Digest::SHA1.hexdigest(url.to_s)[0, 12]
  def web_url?(url) = url.to_s.match?(%r{\Ahttps?://}i)
  def iso(t) = t.utc.iso8601
  def parse_time(s) = (Time.iso8601(s.to_s) rescue nil)

  def config
    @config ||= YAML.safe_load(File.read(SOURCES), permitted_classes: [ Date ])
  end

  def tickers = config.fetch("tickers").keys
  def sectors = config.fetch("sectors")

  def load_previous
    JSON.parse(File.read(OUT))
  rescue StandardError
    {}
  end

  # ---------------------------------------------------------------- finnhub

  def finnhub(path, params = {})
    uri = URI("https://finnhub.io/api/v1#{path}")
    uri.query = URI.encode_www_form(params.merge(token: ENV.fetch("FINNHUB_API_KEY")))
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 20) do |http|
      http.get(uri.request_uri, "User-Agent" => AGENT)
    end
    # never echo the URL: it carries the API key
    raise "Finnhub #{path} returned HTTP #{res.code}" unless res.is_a?(Net::HTTPSuccess)
    sleep 0.25 # free tier: 60 calls a minute
    JSON.parse(res.body)
  end

  def headline(raw)
    return unless web_url?(raw["url"]) && raw["headline"].to_s.strip != ""
    at = raw["datetime"].to_i.positive? ? Time.at(raw["datetime"].to_i) : Time.now
    { "id" => id_for(raw["url"]), "title" => raw["headline"].to_s.strip[0, 300], "url" => raw["url"],
      "source" => raw["source"].to_s, "related" => raw["related"].to_s,
      "summary" => raw["summary"].to_s.strip[0, 600], "published" => iso([ at, Time.now ].min) }
  end

  def fetch_headlines
    raw = finnhub("/news", category: "general").first(40) + finnhub("/news", category: "merger").first(10)
    (tickers - %w[SPY QQQ]).each do |t|
      raw += finnhub("/company-news", symbol: t, from: (Date.today - 2).iso8601, to: Date.today.iso8601).first(5)
    end
    raw.filter_map { |r| headline(r) }
  end

  def fetch_quotes
    tickers.each_with_object({}) do |t, out|
      q = finnhub("/quote", symbol: t)
      next if q["c"].to_f.zero?
      meta = config["tickers"][t]
      out[t] = { "name" => meta["name"], "sector" => meta["sector"], "price" => q["c"].to_f.round(2),
                 "change_percent" => q["dp"].to_f.round(2) }
    end
  end

  def fetch_earnings
    rows = finnhub("/calendar/earnings", from: Date.today.iso8601, to: (Date.today + 21).iso8601)["earningsCalendar"] || []
    rows.select { |r| tickers.include?(r["symbol"]) }.map do |r|
      timing = { "bmo" => "before the open", "amc" => "after the close" }[r["hour"]]
      { "name" => "#{r['symbol']} earnings", "kind" => "earnings", "starts_on" => r["date"], "ticker" => r["symbol"],
        "importance" => 3, "details" => [ timing, r["epsEstimate"] && "EPS estimate #{r['epsEstimate']}" ].compact.join(" · ") }
    end
  end

  # ---------------------------------------------------------------- claude

  def schema
    {
      type: "object", additionalProperties: false,
      required: %w[headline_summary event_type direction sentiment impact confidence tickers sectors rationale invalidation],
      properties: {
        headline_summary: { type: "string" },
        event_type: { type: "string", enum: EVENT_TYPES },
        direction: { type: "string", enum: DIRECTIONS },
        sentiment: { type: "number" },
        impact: { type: "integer" },
        confidence: { type: "number" },
        tickers: { type: "array", items: {
          type: "object", additionalProperties: false, required: %w[symbol direction],
          properties: { symbol: { type: "string" }, direction: { type: "string", enum: DIRECTIONS } }
        } },
        sectors: { type: "array", items: { type: "string", enum: sectors } },
        rationale: { type: "string" },
        invalidation: { type: "string" }
      }
    }
  end

  def claude
    require "anthropic"
    @claude ||= Anthropic::Client.new
  end

  def classify(h)
    message = claude.beta.messages.create(
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: :low, format_: { type: :json_schema, schema: schema } },
      fallbacks: :default,
      betas: [ "server-side-fallback-2026-07-01" ],
      system_: [ { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } } ],
      messages: [ { role: "user", content: <<~TEXT } ]
        Source: #{h['source']}
        Published: #{h['published']}
        Tagged ticker: #{h['related'].to_s.empty? ? 'none' : h['related']}
        Headline: #{h['title']}
        Summary: #{h['summary'].to_s.empty? ? '(none)' : h['summary']}
      TEXT
    )
    raise Refused, "declined" if message.stop_reason == :refusal
    text = message.content.find { |b| b.type == :text }&.text
    raise JSON::ParserError, "empty response" if text.to_s.strip.empty?
    JSON.parse(text)
  end

  # Claude's answer + the headline => the stored catalyst card
  def card(h, r)
    calls = []
    Array(r["tickers"]).each do |t|
      sym = t["symbol"].to_s.upcase.strip
      next if sym.empty? || calls.any? { |c| c["symbol"] == sym } || calls.size >= 6
      calls << { "symbol" => sym, "direction" => DIRECTIONS.include?(t["direction"]) ? t["direction"] : "neutral" }
    end
    h.slice("id", "title", "url", "source", "published").merge(
      "summary" => r["headline_summary"].to_s[0, 250],
      "event_type" => EVENT_TYPES.include?(r["event_type"]) ? r["event_type"] : "other",
      "direction" => DIRECTIONS.include?(r["direction"]) ? r["direction"] : "neutral",
      "sentiment" => r["sentiment"].to_f.clamp(-1.0, 1.0).round(2),
      "impact" => r["impact"].to_i.clamp(1, 5),
      "confidence" => r["confidence"].to_f.clamp(0.0, 1.0).round(2),
      "tickers" => calls,
      "sectors" => Array(r["sectors"]) & sectors,
      "rationale" => r["rationale"].to_s[0, 900],
      "invalidation" => r["invalidation"].to_s[0, 300]
    )
  end

  # Analyzes up to ANALYZE_PER_RUN queued headlines, newest first.
  # Returns [new cards, headlines still queued, skipped count].
  def analyze(queue)
    cards = []
    skipped = 0
    queue = queue.sort_by { |h| h["published"] }.reverse
    todo = queue.first(ANALYZE_PER_RUN)
    rest = queue.drop(ANALYZE_PER_RUN)
    todo.each_with_index do |h, i|
      cards << card(h, classify(h))
      warn format("  ✓ %-60s %s", h["title"][0, 60], cards.last["tickers"].map { |t| "#{t['symbol']}:#{t['direction'][0, 4]}" }.join(" "))
    rescue Refused, JSON::ParserError, Anthropic::Errors::BadRequestError => e
      skipped += 1
      warn "  ✗ skipped #{h['title'][0, 60]} (#{e.class.name.split('::').last})"
    rescue Anthropic::Errors::APIError => e
      # rate limit, overload, network: keep this and the rest for the next run
      warn "  ! Claude unavailable (#{e.class.name.split('::').last}); #{todo.size - i} headlines wait for the next run"
      rest = todo.drop(i) + rest
      break
    end
    [ cards, rest, skipped ]
  end

  # ---------------------------------------------------------------- calls

  def strength(item) = item["impact"].to_i * item["confidence"].to_f
  def direction_for(item, sym) = item["tickers"].find { |t| t["symbol"] == sym }&.dig("direction")
  def covered?(call, id) = ([ call["story"] ] + call["supporting"] + call["overruled"]).include?(id)

  # One open call per ticker. The strongest story owns it; agreeing stories are recorded as
  # support, weaker opposing ones as overruled, a stronger opposing one takes the call over.
  # A story never produces a second call, even after its first call was scored.
  def make_calls(calls, items, quotes, now)
    items.sort_by { |i| [ -strength(i), i["published"] ] }.each do |item|
      next if item["impact"].to_i < MIN_IMPACT || item["confidence"].to_f < MIN_CONFIDENCE
      item["tickers"].each do |t|
        sym = t["symbol"]
        next unless tickers.include?(sym) && %w[bullish bearish].include?(t["direction"])
        next if calls.any? { |c| c["ticker"] == sym && covered?(c, item["id"]) }
        dir = t["direction"] == "bullish" ? "up" : "down"
        open = calls.find { |c| c["ticker"] == sym && c["evaluated_at"].nil? }
        if open.nil?
          call = new_call(item, sym, dir, quotes, now) and calls << call
        elsif open["direction"] == dir || strength(item) <= open["strength"]
          (open["direction"] == dir ? open["supporting"] : open["overruled"]) << item["id"]
        elsif (call = new_call(item, sym, dir, quotes, now))
          call["overruled"] = [ open["story"], *open["supporting"], *open["overruled"] ]
          calls.delete(open)
          calls << call
        end
      end
    end
    calls
  end

  def new_call(item, sym, dir, quotes, now)
    price = quotes.dig(sym, "price") or return nil
    { "ticker" => sym, "direction" => dir, "story" => item["id"], "story_title" => item["summary"].to_s.empty? ? item["title"] : item["summary"],
      "story_url" => item["url"], "event_type" => item["event_type"], "strength" => strength(item).round(2),
      "confidence" => item["confidence"], "supporting" => [], "overruled" => [],
      "price_at" => price, "predicted_at" => iso(now), "due_at" => iso(now + HORIZON_DAYS * 86_400),
      "price_end" => nil, "evaluated_at" => nil, "correct" => nil, "move" => nil }
  end

  def score_calls(calls, quotes, now)
    calls.each do |c|
      next unless c["evaluated_at"].nil? && parse_time(c["due_at"]) && parse_time(c["due_at"]) <= now
      price = quotes.dig(c["ticker"], "price") or next
      c["price_end"] = price
      c["move"] = ((price - c["price_at"]) / c["price_at"] * 100).round(2)
      c["correct"] = (c["direction"] == "up") == (price > c["price_at"])
      c["evaluated_at"] = iso(now)
    end
  end

  # ---------------------------------------------------------------- summary

  def mood(items, now)
    recent = items.select { |i| now - parse_time(i["published"]) < 86_400 }
    recent = items.first(60) if recent.empty?
    weight = recent.sum { |i| strength(i) }
    score = weight.zero? ? 0 : (recent.sum { |i| i["sentiment"] * strength(i) } / weight * 100).round
    label = if score >= 35 then "risk-on"
            elsif score >= 10 then "leaning bullish"
            elsif score > -10 then "mixed"
            elsif score > -35 then "leaning bearish"
            else "risk-off"
            end
    [ { "score" => score, "label" => label, "stories" => recent.size }, recent ]
  end

  def sector_pressure(recent)
    sectors.filter_map do |s|
      list = recent.select { |i| i["sectors"].include?(s) }
      next if list.empty?
      weight = list.sum { |i| strength(i) }
      score = weight.zero? ? 0 : list.sum { |i| i["sentiment"] * strength(i) } / weight
      { "name" => s, "score" => score.round(2), "count" => list.size }
    end.sort_by { |s| -s["score"] }
  end

  def scorecard(calls)
    scored = calls.reject { |c| c["evaluated_at"].nil? }
    hits = scored.count { |c| c["correct"] }
    by_type = scored.group_by { |c| c["event_type"] }.map { |t, l| { "type" => t, "total" => l.size, "hits" => l.count { |c| c["correct"] } } }
    { "open" => calls.size - scored.size, "scored" => scored.size, "hits" => hits,
      "hit_rate" => scored.empty? ? nil : (hits * 100.0 / scored.size).round(1),
      "by_type" => by_type.sort_by { |t| -t["total"] } }
  end

  def curated_events
    Array(config["events"]).map do |e|
      { "name" => e["name"], "kind" => e["kind"], "starts_on" => e["starts_on"].to_s, "ends_on" => e["ends_on"]&.to_s,
        "ticker" => e["ticker"], "importance" => e["importance"] || 2, "details" => e["details"] }.compact
    end
  end

  # ---------------------------------------------------------------- run

  def run(now: Time.now.utc)
    prev = load_previous
    unless ENV["FINNHUB_API_KEY"].to_s != "" && ENV["ANTHROPIC_API_KEY"].to_s != ""
      warn "markets: FINNHUB_API_KEY / ANTHROPIC_API_KEY not set, keeping the last _data/markets.json"
      return prev
    end

    items = Array(prev["items"])
    calls = Array(prev["calls"])
    quotes = prev["quotes"] || {}
    pending = Array(prev["pending"])
    events = Array(prev["events"]).select { |e| e["kind"] == "earnings" }
    finnhub_ok = true

    begin
      fresh = fetch_headlines
      quotes = fetch_quotes.then { |q| q.empty? ? quotes : q }
      events = fetch_earnings
      known = (items + pending).map { |i| i["id"] }
      pending += fresh.reject { |h| known.include?(h["id"]) }.uniq { |h| h["id"] }
      warn "markets: #{fresh.size} headlines, #{quotes.size} quotes, #{events.size} earnings dates"
    rescue StandardError => e
      finnhub_ok = false
      warn "markets: Finnhub failed (#{e.message[0, 80]}); keeping the last headlines and quotes"
    end

    pending = pending.select { |h| (t = parse_time(h["published"])) && now - t < PENDING_MAX_AGE }
                     .sort_by { |h| h["published"] }.reverse.first(PENDING_MAX)
    cards, pending, skipped = analyze(pending)
    items = (cards + items).uniq { |i| i["id"] }
                           .select { |i| (t = parse_time(i["published"])) && now - t < ITEM_MAX_AGE }
                           .sort_by { |i| i["published"] }.reverse.first(ITEM_MAX)

    make_calls(calls, items, quotes, now)
    score_calls(calls, quotes, now)
    calls = calls.select { |c| c["evaluated_at"].nil? || now - parse_time(c["evaluated_at"]) < CALL_HISTORY }
                 .sort_by { |c| c["predicted_at"] }.reverse

    mood_now, recent = mood(items, now)
    upcoming = (curated_events + events).select { |e| (d = Date.parse(e["ends_on"] || e["starts_on"]) rescue nil) && d >= Date.today }
                                        .sort_by { |e| [ e["starts_on"], -e["importance"].to_i ] }.first(12)
    {
      "generated_at" => iso(now),
      "status" => { "finnhub" => finnhub_ok, "analyzed" => cards.size, "skipped" => skipped, "queued" => pending.size },
      "mood" => mood_now,
      "quotes" => quotes,
      "sectors" => sector_pressure(recent),
      "scorecard" => scorecard(calls),
      "events" => upcoming,
      "items" => items,
      "calls" => calls,
      "pending" => pending
    }
  end
end

if $PROGRAM_NAME == __FILE__
  out = Markets.run
  json = JSON.pretty_generate(out) + "\n"
  if ARGV.include?("--dry-run")
    puts json
  elsif out.any?
    File.write(Markets::OUT, json)
    s = out["status"] || {}
    warn "wrote #{Array(out['items']).size} catalysts, #{Array(out['calls']).count { |c| c['evaluated_at'].nil? }} open calls " \
         "(analyzed #{s['analyzed']}, queued #{s['queued']}) to _data/markets.json"
  end
end
