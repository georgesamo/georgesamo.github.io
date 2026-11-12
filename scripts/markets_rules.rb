# Samuka · free headline analyzer for the /news/ markets tab
#
# Reads one market headline (+ its summary) with finance phrase rules instead of an AI model:
# no API, no key, no cost. Returns the same fields scripts/fetch_markets.rb used to get from
# Claude, so cards, calls and scoring don't care which one produced them.
#
#   which way:  finance phrases score +/- ("raises guidance" +3, "misses estimates" -2, ...),
#               flipped after a negation ("fails to beat"), scored per clause so
#               "AMD soars as Nvidia's CEO exits" reads AMD up and NVDA down
#   which stocks: Finnhub's tagged symbol, $TICKER / (TICKER) / NASDAQ: TICKER, and the company
#               names + aliases in _data/markets_sources.yml
#   how hard:   the kind of event (guidance > earnings > a listicle) and how strong the phrases are
#   why:        the phrases that matched, so every call can be checked by eye
#
# Cruder than a language model: it doesn't understand irony or long chains of cause and effect,
# so impact and confidence stay modest unless several clear signals agree.
module MarketRules
  # [pattern, weight, label]. Patterns run on lowercased text.
  SIGNALS = [
    [ /\b(?:raises?|raised|raising|lifts?|lifted|boosts?|boosted|ups) (?:[\w-]+ ){0,2}(?:guidance|outlook|forecast)/, 3, "raised guidance" ],
    [ /\b(?:cuts?|cutting|lowers?|lowered|slashes?|slashed|trims?|trimmed) (?:[\w-]+ ){0,2}(?:guidance|outlook|forecast)/, -3, "cut guidance" ],
    [ /\b(?:beats?|beating|tops?|topped|exceeds?|exceeded|crushes|crushed) (?:\w+ ){0,3}(?:estimates|expectations|forecasts|views|consensus)|\bbetter[- ]than[- ]expected\b/, 2, "beat expectations" ],
    [ /\bmiss(?:es|ed)? (?:\w+ ){0,3}(?:estimates|expectations|forecasts|views|consensus)|\bworse[- ]than[- ]expected\b|\bfalls? short\b/, -2, "missed expectations" ],
    [ /\brecord (?:revenue|profit|sales|quarter|earnings|deliveries)\b|\ball[- ]time highs?\b|\brecord highs?\b/, 2, "record high/results" ],
    [ /\bstrong (?:demand|growth|sales|results|quarter|orders)\b|\bdemand (?:surges|booms|soars)\b/, 2, "strong demand" ],
    [ /\bweak(?:er|ening)? (?:demand|growth|sales|results|quarter|orders|guidance)\b|\bdemand (?:slumps|slows|weakens)\b/, -2, "weak demand" ],
    [ /\b(?:upgrades?|upgraded)\b|\boutperform rating\b|\bto buy\b(?= from)|\bbuy rating\b/, 1, "analyst upgrade" ],
    [ /\b(?:downgrades?|downgraded)\b|\bunderperform rating\b|\bsell rating\b/, -1, "analyst downgrade" ],
    [ /\b(?:raises?|raised|hikes?|hiked|lifts?|lifted|boosts?) (?:\w+ )?price target\b/, 1, "price target raised" ],
    [ /\b(?:cuts?|lowers?|lowered|slashes?|slashed) (?:\w+ )?price target\b/, -1, "price target cut" ],
    [ /\b(?:soar|surge|skyrocket|rocket|jump|spike|zoom|leap)(?:s|ed|ing)?\b/, 2, "sharp rise" ],
    [ /\b(?:rises?|rose|rising|gains?|gained|climbs?|climbed|rall(?:y|ies|ied)|advances?|advanced|edges? higher|higher)\b|\bup \d/, 1, "rising" ],
    [ /\b(?:plunge|plummet|crash|tank|tumble|sink|crater|nosedive)(?:s|d|ed|ing)?\b|\bsank\b|\bsunk\b/, -2, "sharp drop" ],
    [ /\b(?:falls?|fell|falling|drops?|dropped|slides?|slid|declines?|declined|slips?|slipped|lower|edges? lower|retreats?)\b|\bdown \d/, -1, "falling" ],
    [ /\b(?:fda|regulatory|eu|fcc|ftc) (?:approv\w*|clears|cleared|nod)\b|\bapproval (?:for|of)\b|\bwins? approval\b/, 2, "approval" ],
    [ /\b(?:wins?|won|awarded|secures?|secured|lands?|landed|signs?|signed) (?:a |an |\$?[\d.,]+ ?(?:billion|million|bn|m)? ?)?(?:\w+ )?(?:contract|deal|order|partnership)\b/, 2, "new contract/deal" ],
    [ /\b(?:buybacks?|share repurchase|repurchase program|dividend (?:hike|increase|raise)|raises? (?:its )?dividend)\b/, 1, "returns cash to shareholders" ],
    [ /\b(?:layoffs?|job cuts|cuts? (?:\d[\d,]* )?jobs|to cut \d)\b/, -1, "layoffs" ],
    [ /\b(?:lawsuit|sues|sued|probe[sd]?|investigation|investigates|investigating|subpoena\w*|antitrust|fined|penalt\w+|indicted|charged|smuggling)\b/, -2, "legal/regulatory risk" ],
    [ /\brecalls?\b|\brecalled\b/, -2, "recall" ],
    [ /\b(?:delays?|delayed|postpones?|postponed|halts?|halted|suspends?|suspended|pauses?|paused)\b/, -1, "delay/halt" ],
    [ /\b(?:bankrupt\w*|chapter 11|defaults?|defaulted|insolven\w+|going concern)\b/, -3, "bankruptcy risk" ],
    [ /\b(?:fraud|accounting irregularit\w+|restat(?:es|ed|ement))\b/, -3, "fraud/accounting" ],
    [ /\b(?:resigns?|resigned|resignation|steps? down|stepped down|ousted|fired|departs?|departure|exits?|exited)\b/, -2, "leadership exit" ],
    [ /\b(?:warns?|warned|warning|profit warning)\b/, -2, "warning" ],
    [ /\b(?:sell-?off|rout|turmoil|panic|wipeout|bloodbath)\b/, -2, "selloff" ],
    [ /\b(?:tariffs?|sanctions?|export (?:ban|controls?|curbs?|restrictions?)|trade war)\b/, -1, "trade restrictions" ],
    [ /\b(?:war|attacks?|attacked|explosions?|missiles?|airstrikes?|struck|hostilities)\b/, -1, "geopolitical risk" ],
    [ /\b(?:rate cuts?|cuts? (?:interest )?rates|dovish|easing)\b/, 1, "easier central-bank policy" ],
    [ /\b(?:rate hikes?|hikes? (?:interest )?rates|raises? (?:interest )?rates|hawkish|tightening)\b/, -1, "tighter central-bank policy" ],
    [ /\b(?:hot|hotter|higher[- ]than[- ]expected|sticky|rising) (?:inflation|cpi|prices)\b/, -2, "hot inflation" ],
    [ /\b(?:cool(?:ing|s|ed|er)?|lower[- ]than[- ]expected|easing) (?:inflation|cpi)\b/, 2, "cooling inflation" ],
    [ /\b(?:drops?|dropped|abandons?|abandoned|scraps?|scrapped|walks? away from|ends?|ended|terminates?) (?:\w+ ){0,4}(?:takeover|deal|bid|merger|pursuit|acquisition)\b/, -2, "deal collapsed" ],
    [ /\b(?:game[- ]changer|windfall|tailwinds?|big winners?|clear winners?|benefits? from|stands? to (?:benefit|gain)|boosts? (?:sales|demand|shares))\b/, 2, "beneficiary" ],
    [ /\b(?:headwinds?|big losers?|under pressure|pressures? (?:margins|sales|shares))\b/, -2, "headwind" ],
    [ /\bbullish\b/, 1, "bullish view" ],
    [ /\bbearish\b/, -1, "bearish view" ]
  ].freeze

  # a negation right before the phrase (at most one word between: "fails to beat", "won't raise")
  NEGATION = /\b(?:not|no|never|fails? to|failed to|without|won't|didn't|doesn't|isn't|wasn't|unlikely to)\b(?:\W+\w+)?\W*\z/
  OPINION = /\?\s*\z|\bshould you\b|\bis it time\b|\bstocks? to (?:buy|watch|own|hold)\b|\b\d+ (?:\w+ )?(?:stocks|reasons|things|ways)\b|\bbetter buy\b|\bmy (?:top|favorite)\b|\bcould (?:soar|double|triple)\b|\bwhat(?:'s| is) going on\b|\bhere'?s (?:why|what|how)\b|\bprediction:|\bbillionaire\b|\bwarren buffett\b|\bmillionaire\b|\bforever\b|\bjim cramer\b|\bcramer'?s?\b|\bmichael burry\b|\bcathie wood\b|\btom lee\b|\bdan ives\b|\bcommentary\b|\bopinion\b|\bexplainer\b|\bwhat to (?:know|expect)\b|\bhow (?:high|low|much|that|this|it)\b|\bmay have just\b|\bexperts? weigh\b/

  EVENTS = [
    [ "guidance", /\b(?:raises?|raised|cuts?|lowers?|lowered|lifts?|lifted|boosts?|slashes?|slashed|reaffirms?|reiterates?|issues?|withdraws?|trims?) (?:\w+ ){0,3}(?:guidance|outlook|forecasts?)\b|\bguidance\b/ ],
    [ "earnings", /\bearnings\b|\bquarterly (?:results|profit|revenue|sales)\b|\bq[1-4]\b|\beps\b|\bresults\b|\brevenue (?:beat|miss|rose|fell)\b/ ],
    [ "mergers_acquisitions", /\bacqui\w+|\bmergers?\b|\btakeover\b|\bbuyout\b|\bdeal to buy\b|\bbids? for\b|\bto buy\b/ ],
    [ "central_bank", /\bfed\b|\bfomc\b|\bfederal reserve\b|\bpowell\b|\brate (?:cut|hike|decision)s?\b|\becb\b|\bbank of (?:japan|england)\b|\binterest rates?\b/ ],
    [ "macro_data", /\bcpi\b|\binflation\b|\bjobs report\b|\bpayrolls\b|\bunemployment\b|\bgdp\b|\bretail sales\b|\bpmi\b|\bconsumer (?:confidence|sentiment)\b/ ],
    [ "analyst_rating", /\bupgrade\w*|\bdowngrade\w*|\bprice target\b|\boutperform\b|\bunderperform\b|\banalysts?\b/ ],
    [ "legal", /\blawsuit\b|\bsues?d?\b|\bprobe\b|\binvestigat\w+|\bdoj\b|\bsec\b|\bantitrust\b|\bcourt\b|\bsubpoena\b|\bsettle\w*/ ],
    [ "management_change", /\bceo\b|\bcfo\b|\bchief executive\b|\bresign\w*|\bsteps? down\b|\bappoint\w*|\bsuccession\b|\bsuccessor\b/ ],
    [ "geopolitics", /\bwar\b|\biran\b|\brussia\b|\bukraine\b|\bisrael\b|\bsanctions?\b|\bmissiles?\b|\battacks?\b|\bstrait\b|\bmilitary\b|\bopec\b|\btankers?\b/ ],
    [ "policy_regulation", /\btariffs?\b|\bregulat\w+|\bcongress\b|\bsenate\b|\bbill\b|\bwhite house\b|\bexecutive order\b|\bban\b/ ],
    [ "product_launch", /\blaunch\w*|\bunveil\w*|\bintroduc\w+|\bdebut\w*|\bnew (?:model|chip|phone|product)\b/ ],
    [ "conference", /\bconference\b|\bsummit\b|\bkeynote\b|\bces\b|\bgtc\b|\bwwdc\b|\bdeveloper event\b|\binvestor day\b/ ],
    [ "supply_chain", /\bsupply\b|\bshortages?\b|\bsuppliers?\b|\bfactory\b|\bproduction\b/ ]
  ].freeze

  BASE_IMPACT = {
    "guidance" => 4, "earnings" => 3, "mergers_acquisitions" => 3, "central_bank" => 3, "macro_data" => 3,
    "management_change" => 3, "geopolitics" => 3, "legal" => 2, "analyst_rating" => 2, "policy_regulation" => 2,
    "product_launch" => 2, "conference" => 2, "supply_chain" => 2, "other" => 1
  }.freeze

  WRONG_IF = {
    "guidance" => "the stock moves the other way within two sessions, or the guidance is revised again",
    "earnings" => "the post-earnings move reverses as investors focus on guidance or margins",
    "mergers_acquisitions" => "the deal terms change, regulators object, or the deal falls apart",
    "central_bank" => "the next inflation or jobs data shifts rate expectations the other way",
    "macro_data" => "revisions or the next release contradict this reading",
    "analyst_rating" => "other analysts disagree and the rating change doesn't move the price",
    "legal" => "the case is dismissed or settled cheaply",
    "management_change" => "a strong successor is named quickly and the market looks through the change",
    "geopolitics" => "the situation de-escalates quickly",
    "policy_regulation" => "the measure is watered down, delayed or blocked",
    "product_launch" => "early reviews and demand signals disappoint",
    "conference" => "announcements were already expected and the move fades",
    "supply_chain" => "the disruption is resolved faster than feared",
    "other" => "follow-up news contradicts the headline"
  }.freeze

  SECTOR_WORDS = [
    [ "Energy", /\b(?:oil|crude|opec|natural gas|brent|refiner\w*|tankers?)\b/ ],
    [ "Financials", /\b(?:banks?|lenders?|brokers?|insurers?|payments?)\b/ ],
    [ "Semiconductors", /\b(?:chips?|chipmakers?|semiconductors?|gpus?|foundry)\b/ ],
    [ "Technology", /\b(?:software|cloud|ai|artificial intelligence|data cent(?:er|re)s?|smartphones?)\b/ ],
    [ "Healthcare", /\b(?:drugs?|fda|pharma\w*|biotech|vaccines?|weight[- ]loss|glp-1|hospitals?)\b/ ],
    [ "Index", /\b(?:s&p 500|s&p|nasdaq|dow|wall street|stock market|stocks|equities|fed|inflation|cpi)\b/ ],
    [ "Crypto", /\b(?:bitcoin|crypto\w*|ethereum|stablecoins?)\b/ ],
    [ "Consumer Discretionary", /\b(?:retail(?:ers)?|evs?|electric vehicles?|automakers?|cars?|airlines?)\b/ ],
    [ "Industrials", /\b(?:aerospace|defen[cs]e|planes?|aircraft|railroads?|machinery)\b/ ],
    [ "Communication", /\b(?:streaming|social media|advertising|telecom)\b/ ]
  ].freeze

  CLAUSE_SPLIT = /[.;!?]\s+|,\s+|\s+(?:as|while|but|whereas|after|amid|even as|though|although|despite)\s+/

  module_function

  # => same shape Claude returned: headline_summary, event_type, direction, sentiment, impact,
  #    confidence, tickers [{symbol, direction}], sectors, rationale, invalidation
  def analyze(headline, config)
    title = headline["title"].to_s
    summary = headline["summary"].to_s
    t = title.downcase
    text = "#{t}. #{summary.downcase}"

    title_hits = signals(t)
    body_hits = signals(summary.downcase)
    score = title_hits.sum { |h| h[:weight] } * 2 + body_hits.sum { |h| h[:weight] }
    opinion = t.match?(OPINION)
    event = EVENTS.find { |_, re| t.match?(re) }&.first || EVENTS.find { |_, re| text.match?(re) }&.first || "other"

    entities = entities(title, summary, headline["related"].to_s, config)
    calls = entities.map do |sym, names|
      s = clause_score(t, names) * 2 + clause_score(summary.downcase, names)
      # the only company named, and named in the headline: the story is about it
      s = score if s.zero? && entities.size == 1 && names.any? { |n| t.match?(n) }
      dir = opinion ? "neutral" : s >= 2 ? "bullish" : s <= -2 ? "bearish" : "neutral"
      { "symbol" => sym, "direction" => dir }
    end

    sentiment = opinion ? 0.0 : Math.tanh(score / 6.0).round(2)
    direction = sentiment >= 0.15 ? "bullish" : sentiment <= -0.15 ? "bearish" : "neutral"
    strong = title_hits.any? { |h| h[:weight].abs >= 3 }
    impact = BASE_IMPACT.fetch(event)
    impact += 1 if score.abs >= 6 || strong
    impact = [ impact, 2 ].min if title_hits.empty?
    impact = 1 if opinion
    hits = (title_hits + body_hits).map { |h| h[:label] }.uniq
    confidence = opinion || hits.empty? ? 0.3 : [ 0.3 + 0.1 * title_hits.size + 0.05 * body_hits.size + (calls.any? ? 0.1 : 0), 0.85 ].min

    {
      "headline_summary" => title,
      "event_type" => event,
      "direction" => direction,
      "sentiment" => sentiment,
      "impact" => impact.clamp(1, 5),
      "confidence" => confidence.round(2),
      "tickers" => calls,
      "sectors" => sectors(text, entities.keys, config),
      "rationale" => rationale(hits, calls, opinion, event),
      "invalidation" => "Wrong if #{WRONG_IF.fetch(event)}."
    }
  end

  # every signal in the text, with negations flipping the sign
  def signals(text)
    SIGNALS.flat_map do |re, weight, label|
      text.to_enum(:scan, re).map do
        m = Regexp.last_match
        negated = text[[ m.begin(0) - 30, 0 ].max...m.begin(0)].match?(NEGATION)
        { weight: negated ? -weight : weight, label: negated ? "not #{label}" : label }
      end
    end
  end

  def clause_score(text, names)
    text.split(CLAUSE_SPLIT).select { |c| names.any? { |n| c.match?(n) } }.sum { |c| signals(c).sum { |h| h[:weight] } }
  end

  # { "NVDA" => [regexes for its symbol and names] }, in the order they first appear
  def entities(title, summary, related, config)
    text = "#{title} #{summary}"
    found = {}
    config.fetch("tickers").each do |sym, meta|
      names = [ meta["name"], *Array(meta["aliases"]) ].compact.map { |n| /\b#{Regexp.escape(n.downcase)}(?:'s)?\b/ }
      sym_re = /(?:\$|\(|nasdaq:\s?|nyse:\s?)#{Regexp.escape(sym.downcase)}\b/
      sym_plain = sym.length >= 3 ? /\b#{Regexp.escape(sym.downcase)}\b/ : nil
      pos = [ *names, sym_re, sym_plain ].compact.filter_map { |re| text.downcase =~ re }.min
      pos = text.length if pos.nil? && related.split(",").map(&:strip).include?(sym)
      next if pos.nil?
      found[sym] = [ pos, [ *names, sym_re, sym_plain ].compact ]
    end
    found.sort_by { |_, (pos, _)| pos }.first(6).to_h { |sym, (_, res)| [ sym, res ] }
  end

  def sectors(text, symbols, config)
    from_tickers = symbols.map { |s| config.dig("tickers", s, "sector") }
    from_words = SECTOR_WORDS.select { |_, re| text.match?(re) }.map(&:first)
    ((from_tickers + from_words).compact.uniq & config.fetch("sectors")).first(4)
  end

  def rationale(hits, calls, opinion, event)
    return "Opinion, explainer or list piece rather than new information, so the rules give it low impact." if opinion
    return "No clear market-moving phrases in the headline, so the rules read it as neutral." if hits.empty?
    up = calls.select { |c| c["direction"] == "bullish" }.map { |c| c["symbol"] }
    down = calls.select { |c| c["direction"] == "bearish" }.map { |c| c["symbol"] }
    read = [ up.any? && "up for #{up.join(', ')}", down.any? && "down for #{down.join(', ')}" ].select { |x| x }
    "Signals: #{hits.first(4).join(', ')} (#{event.tr('_', ' ')})." + (read.any? ? " Reads #{read.join('; ')}." : "")
  end
end
