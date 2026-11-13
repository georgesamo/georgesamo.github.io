# Tests for scripts/fetch_markets.rb and scripts/markets_rules.rb (no network)
#   bundle exec ruby tests/fetch_markets_test.rb
require "minitest/autorun"
load File.expand_path("../scripts/fetch_markets.rb", __dir__)

# The free headline rules, on real headlines from the first days of the tab.
class MarketRulesTest < Minitest::Test
  def read(title, summary = "", related = "") = MarketRules.analyze({ "title" => title, "summary" => summary, "related" => related }, Markets.config)
  def calls(out) = out["tickers"].to_h { |t| [ t["symbol"], t["direction"] ] }

  def test_split_story_reads_each_company_its_own_way
    out = read("AMD Soars 6%, Broadcom Up 6% as Nvidia CEO Jensen Huang Exits")
    assert_equal({ "AMD" => "bullish", "AVGO" => "bullish", "NVDA" => "bearish" }, calls(out))
    assert_operator out["impact"], :>=, 3
    assert_match "sharp rise", out["rationale"]
  end

  def test_guidance_cut_is_strongly_bearish
    out = read("Boeing cuts full-year delivery guidance after supplier defect")
    assert_equal({ "BA" => "bearish" }, calls(out))
    assert_equal "guidance", out["event_type"]
    assert_operator out["impact"], :>=, 4
  end

  def test_negation_flips_the_phrase
    out = read("Tesla fails to beat delivery estimates")
    assert_equal "bearish", calls(out)["TSLA"]
    assert_match "not beat expectations", out["rationale"]
  end

  def test_opinion_and_list_pieces_make_no_calls
    [ "Should You Buy Nvidia Stock Before Earnings?",
      "3 Unstoppable Dow Stocks to Buy in November",
      "Michael Burry Warned About This AI Risk a Year Ago. Microsoft May Have Just Proved His Point" ].each do |t|
      out = read(t)
      assert_equal 1, out["impact"], t
      assert out["tickers"].all? { |c| c["direction"] == "neutral" }, t
    end
  end

  def test_company_only_in_the_summary_does_not_inherit_the_headline_tone
    out = read("Archer Aviation Slides 6% Despite Cathie Wood's Buying", "Boeing has a stake in a rival air-taxi maker.")
    assert_equal "neutral", calls(out)["BA"]
  end

  def test_tickers_found_by_symbol_name_alias_and_finnhub_tag
    assert_equal %w[NVDA], calls(read("Jensen Huang to keynote GTC")).keys
    assert_equal %w[TSM], calls(read("Chip foundry (TSM) expands Arizona plant")).keys
    assert_equal %w[LLY], calls(read("Zepbound supply shortage eases")).keys
    assert_includes calls(read("Shares jump on strong demand", "", "WMT")).keys, "WMT"
  end

  def test_no_signal_is_neutral_low_impact
    out = read("Apple to hold its annual shareholder meeting in March")
    assert_equal "neutral", out["direction"]
    assert_operator out["impact"], :<=, 2
    assert_operator out["confidence"], :<, Markets::MIN_CONFIDENCE
  end
end

# Calls, merging and scoring, with the analysis stubbed so each case is exact.
class MarketsTest < Minitest::Test
  NOW = Time.utc(2026, 11, 12, 18)
  Q = { "XOM" => { "price" => 100.0 }, "BA" => { "price" => 200.0 }, "NVDA" => { "price" => 150.0 } }

  def head(n, t = NOW) = { "id" => "h#{n}", "title" => "Headline #{n}", "url" => "https://x.test/#{n}", "source" => "T", "published" => Markets.iso(t) }
  def answer(tickers, impact: 4, conf: 0.7, dir: "bullish")
    { "headline_summary" => "s", "event_type" => "geopolitics", "direction" => dir, "sentiment" => 0.5, "impact" => impact,
      "confidence" => conf, "tickers" => tickers.map { |s, d| { "symbol" => s, "direction" => d } }, "sectors" => [ "Energy", "Nope" ],
      "rationale" => "r", "invalidation" => "i" }
  end
  def stub_analysis(&blk)
    t = self
    Markets.define_singleton_method(:classify) { |h| t.instance_exec(h, &blk) }
  end

  def teardown
    Markets.singleton_class.send(:remove_method, :classify) if Markets.singleton_methods(false).include?(:classify) && Markets.method(:classify).source_location&.first == __FILE__
  end

  def test_split_story_makes_opposite_calls_and_skips_neutral_and_unknown
    stub_analysis { |_| answer({ "XOM" => "bullish", "BA" => "bearish", "NVDA" => "neutral", "ZZZ" => "bullish", "xom" => "bearish" }) }
    cards, rest, skipped = Markets.analyze([ head(1) ])
    assert_equal [ 1, 0, 0 ], [ cards.size, rest.size, skipped ]
    assert_equal %w[XOM BA NVDA ZZZ], cards[0]["tickers"].map { |t| t["symbol"] }, "duplicate symbol dropped, first kept"
    assert_equal [ "Energy" ], cards[0]["sectors"]
    calls = Markets.make_calls([], cards, Q, NOW)
    assert_equal({ "XOM" => "up", "BA" => "down" }, calls.to_h { |c| [ c["ticker"], c["direction"] ] })
  end

  def test_merging_weaker_opposing_and_takeover
    stub_analysis { |h| h["id"] == "h3" ? answer({ "XOM" => "bearish" }, impact: 5, conf: 0.9) : h["id"] == "h2" ? answer({ "XOM" => "bearish" }, impact: 3, conf: 0.5) : answer({ "XOM" => "bullish" }) }
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
    stub_analysis { |_| answer({ "NVDA" => "bearish" }) }
    cards = Markets.analyze([ head(1) ]).first
    calls = Markets.make_calls([], cards, Q, NOW)
    later = NOW + 4 * 86_400
    Markets.score_calls(calls, { "NVDA" => { "price" => 141.0 } }, later)
    assert_equal [ true, -6.0 ], [ calls[0]["correct"], calls[0]["move"] ]
    Markets.make_calls(calls, cards, Q, later)
    assert_equal 1, calls.size
    assert_equal 100.0, Markets.scorecard(calls)["hit_rate"]
  end

  def test_one_bad_headline_never_stops_the_run
    stub_analysis { |h| h["id"] == "h2" ? raise("odd input") : answer({}) }
    cards, rest, skipped = Markets.analyze([ head(1, NOW), head(2, NOW - 60), head(3, NOW - 120) ])
    assert_equal [ 2, 0, 1 ], [ cards.size, rest.size, skipped ]
  end

  def test_without_the_finnhub_key_nothing_changes
    saved = ENV["FINNHUB_API_KEY"]
    ENV.delete("FINNHUB_API_KEY")
    assert_nil Markets.run, "no key: nothing to write"
  ensure
    ENV["FINNHUB_API_KEY"] = saved if saved
  end

  def test_mood_label
    items = [ { "published" => Markets.iso(NOW), "sentiment" => -0.8, "impact" => 5, "confidence" => 1.0 } ]
    assert_equal "risk-off", Markets.mood(items, NOW).first["label"]
  end
end
