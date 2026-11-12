# Logic tests for scripts/fetch_markets.rb (no network: Finnhub and Claude are stubbed)
#   bundle exec ruby tests/fetch_markets_test.rb
require "minitest/autorun"
load File.expand_path("../scripts/fetch_markets.rb", __dir__)
require "anthropic"

class MarketsTest < Minitest::Test
  NOW = Time.utc(2026, 11, 12, 18)
  Q = { "XOM" => { "price" => 100.0 }, "BA" => { "price" => 200.0 }, "NVDA" => { "price" => 150.0 } }

  def head(n, t = NOW) = { "id" => "h#{n}", "title" => "Headline #{n}", "url" => "https://x.test/#{n}", "source" => "T", "published" => Markets.iso(t) }
  def answer(tickers, impact: 4, conf: 0.7, dir: "bullish")
    { "headline_summary" => "s", "event_type" => "geopolitics", "direction" => dir, "sentiment" => 0.5, "impact" => impact,
      "confidence" => conf, "tickers" => tickers.map { |s, d| { "symbol" => s, "direction" => d } }, "sectors" => [ "Energy", "Nope" ],
      "rationale" => "r", "invalidation" => "i" }
  end
  def stub_claude(&blk)
    t = self
    Markets.define_singleton_method(:classify) { |h| t.instance_exec(h, &blk) }
  end

  def test_split_story_makes_opposite_calls_and_skips_neutral_and_unknown
    stub_claude { |_| answer({ "XOM" => "bullish", "BA" => "bearish", "NVDA" => "neutral", "ZZZ" => "bullish", "xom" => "bearish" }) }
    cards, rest, skipped = Markets.analyze([ head(1) ])
    assert_equal [ 1, 0, 0 ], [ cards.size, rest.size, skipped ]
    assert_equal %w[XOM BA NVDA ZZZ], cards[0]["tickers"].map { |t| t["symbol"] }, "duplicate symbol dropped, first kept"
    assert_equal [ "Energy" ], cards[0]["sectors"]
    calls = Markets.make_calls([], cards, Q, NOW)
    assert_equal({ "XOM" => "up", "BA" => "down" }, calls.to_h { |c| [ c["ticker"], c["direction"] ] })
  end

  def test_merging_weaker_opposing_and_takeover
    stub_claude { |h| h["id"] == "h3" ? answer({ "XOM" => "bearish" }, impact: 5, conf: 0.9) : h["id"] == "h2" ? answer({ "XOM" => "bearish" }, impact: 3, conf: 0.5) : answer({ "XOM" => "bullish" }) }
    a = Markets.analyze([ head(1) ]).first
    calls = Markets.make_calls([], a, Q, NOW)
    b = Markets.analyze([ head(2) ]).first
    Markets.make_calls(calls, a + b, Q, NOW)
    assert_equal 1, calls.size
    assert_equal [ "up", [ "h2" ] ], [ calls[0]["direction"], calls[0]["overruled"] ], "weaker opposing story is recorded, call kept"
    c = Markets.analyze([ head(3) ]).first
    Markets.make_calls(calls, a + b + c, Q, NOW)
    assert_equal 1, calls.size
    assert_equal [ "down", "h3" ], [ calls[0]["direction"], calls[0]["story"] ], "stronger opposing story takes over"
    assert_includes calls[0]["overruled"], "h1"
    Markets.make_calls(calls, a + b + c, Q, NOW)
    assert_equal 1, calls.size, "re-running never adds calls"
  end

  def test_scoring_and_no_second_call_after_scoring
    stub_claude { |_| answer({ "NVDA" => "bearish" }) }
    cards = Markets.analyze([ head(1) ]).first
    calls = Markets.make_calls([], cards, Q, NOW)
    later = NOW + 4 * 86_400
    Markets.score_calls(calls, { "NVDA" => { "price" => 141.0 } }, later)
    assert_equal [ true, -6.0 ], [ calls[0]["correct"], calls[0]["move"] ]
    Markets.make_calls(calls, cards, Q, later)
    assert_equal 1, calls.size
    assert_equal 100.0, Markets.scorecard(calls)["hit_rate"]
  end

  def test_claude_outage_keeps_the_queue
    n = 0
    stub_claude { |_| (n += 1) == 2 ? raise(Anthropic::Errors::APIConnectionError.new(url: nil, request: nil)) : answer({}) }
    cards, rest, = Markets.analyze([ head(1, NOW), head(2, NOW - 60), head(3, NOW - 120) ])
    assert_equal [ 1, 2 ], [ cards.size, rest.size ]
  end

  def test_refusal_is_skipped_not_retried
    stub_claude { |_| raise Markets::Refused, "no" }
    cards, rest, skipped = Markets.analyze([ head(1) ])
    assert_equal [ 0, 0, 1 ], [ cards.size, rest.size, skipped ]
  end

  def test_without_keys_nothing_changes
    saved = ENV.to_h.slice("FINNHUB_API_KEY", "ANTHROPIC_API_KEY")
    ENV.delete("FINNHUB_API_KEY"); ENV.delete("ANTHROPIC_API_KEY")
    assert_equal Markets.load_previous, Markets.run
  ensure
    saved.each { |k, v| ENV[k] = v }
  end

  def test_mood_label
    items = [ { "published" => Markets.iso(NOW), "sentiment" => -0.8, "impact" => 5, "confidence" => 1.0 } ]
    assert_equal "risk-off", Markets.mood(items, NOW).first["label"]
  end
end
