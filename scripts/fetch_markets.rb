# Samuka · markets fetcher for the /news/ "markets" tab
#
# Pulls market headlines and quotes from Finnhub (free tier), turns each new headline into a
# catalyst card with the free finance rules in scripts/markets_rules.rb (which tickers it moves,
# which way, how hard, why, what would prove it wrong), turns strong cards into tracked calls
# and scores them against the real price after 3 days. No paid API anywhere.
# Writes _data/markets.json, which Jekyll renders into the markets tab on /news/.
#
#   FINNHUB_API_KEY=... bundle exec ruby scripts/fetch_markets.rb
#   bundle exec ruby scripts/fetch_markets.rb --dry-run   # print what would be written
#
# Like fetch_news.rb, every run starts from the last run's file (CI restores it from the
# Actions cache, and the committed copy is the fallback), so headlines, calls and the scorecard
# carry over between builds. Without the Finnhub key it changes nothing and exits cleanly, so
# local and fork builds still work. Research for fun, not financial advice.
require_relative "markets_rules"
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

  ITEM_MAX_AGE = 4 * 86_400     # analyzed stories kept this long
  ITEM_MAX = 150
  PENDING_MAX_AGE = 2 * 86_400  # headlines not analyzed by then are dropped
  PENDING_MAX = 150
  ANALYZE_PER_RUN = ENV.fetch("MARKETS_ANALYZE_LIMIT", 300).to_i # rules are free: effectively all
  CALL_HISTORY = 120 * 86_400   # scored calls kept for the scorecard
  MIN_IMPACT = 3
  MIN_CONFIDENCE = 0.5
  HORIZON_DAYS = 3
  DIRECTIONS = %w[bullish bearish neutral].freeze
  EVENT_TYPES = %w[
    earnings guidance macro_data central_bank policy_regulation geopolitics product_launch
    conference mergers_acquisitions analyst_rating legal supply_chain management_change other
  ].freeze

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

  # ---------------------------------------------------------------- analysis

  # free finance rules (scripts/markets_rules.rb); returns the fields card() expects
  def classify(h) = MarketRules.analyze(h, config)

  # the analysis + the headline => the stored catalyst card
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
    todo.each do |h|
      cards << card(h, classify(h))
      warn format("  ✓ %-60s %s", h["title"][0, 60], cards.last["tickers"].map { |t| "#{t['symbol']}:#{t['direction'][0, 4]}" }.join(" "))
    rescue StandardError => e
      # one odd headline never stops the run
      skipped += 1
      warn "  ✗ skipped #{h['title'].to_s[0, 60]} (#{e.class})"
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

  # The new markets.json contents, or nil when the API keys are missing (keep the last file).
  def run(now: Time.now.utc)
    prev = load_previous
    if ENV["FINNHUB_API_KEY"].to_s.empty?
      warn "markets: FINNHUB_API_KEY not set, keeping the last _data/markets.json"
      return nil
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
  out = Markets.run or exit # no keys: the last file stays as it is
  json = JSON.pretty_generate(out) + "\n"
  if ARGV.include?("--dry-run")
    puts json
  else
    File.write(Markets::OUT, json)
    s = out["status"] || {}
    warn "wrote #{Array(out['items']).size} catalysts, #{Array(out['calls']).count { |c| c['evaluated_at'].nil? }} open calls " \
         "(analyzed #{s['analyzed']}, queued #{s['queued']}) to _data/markets.json"
  end
end
