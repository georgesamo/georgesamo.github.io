# Samuka · news + video fetcher for /news/ and /watch/
#
# Reads the feeds in _data/news_sources.yml (RSS 2.0 or Atom), keeps the last few days of
# stories and writes _data/news.json, which Jekyll turns into /news/ and /news/news.json.
# Only the headline, a one-line teaser and the link are kept: every story links back to its source.
# Then reads the YouTube channel feeds in _data/video_sources.yml and writes _data/videos.json
# (video id, title, channel, trailer/review, date, views) for /watch/.
#
#   bundle exec ruby scripts/fetch_news.rb            # refresh _data/news.json
#   bundle exec ruby scripts/fetch_news.rb --dry-run  # print what would be written
#
# Stories and videos from earlier runs are kept until they age out, so a feed that fails (timeout,
# bad XML) never empties a section. Runs in CI before every build and on a schedule (pages.yml),
# which keeps the last run's _data/news.json + videos.json in the Actions cache.
require "cgi"
require "json"
require "net/http"
require "rexml/document"
require "time"
require "uri"
require "yaml"

ROOT = File.expand_path("..", __dir__)
SOURCES = File.join(ROOT, "_data/news_sources.yml")
OUT = File.join(ROOT, "_data/news.json")
VIDEO_SOURCES = File.join(ROOT, "_data/video_sources.yml")
VIDEO_OUT = File.join(ROOT, "_data/videos.json")
VIDEO_MAX_AGE = 30 * 24 * 3600
VIDEO_MAX = 120
VIDEO_PER_CHANNEL = 10
REVIEW = /\breview\b/i
NOT_REVIEW = /\b(df direct|podcast|q\s*\+\s*a|discussion|reacts?|livestream|weekly|news)\b/i   # shows that only mention reviews
TRAILER = /trailer|teaser|reveal|announce|launch|gameplay|showcase|direct|state of play|premiere|first look|overview/i
MAX_AGE = 10 * 24 * 3600   # seconds; older stories drop off
MAX_ITEMS = 200
PER_SOURCE = 20            # newest stories kept per feed
TEASER = 180               # characters
AGENT = "SamukaNewsBot/1.0 (+https://georgesamo.github.io/news/)"

def get(url, hops = 4)
  uri = URI(url)
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 10, read_timeout: 15) do |http|
    http.get(uri.request_uri, "User-Agent" => AGENT, "Accept" => "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5")
  end
  case res
  when Net::HTTPRedirection
    raise "too many redirects" if hops.zero?
    get(URI.join(url, res["location"]).to_s, hops - 1)
  when Net::HTTPSuccess then res.body.to_s.dup.force_encoding("UTF-8").scrub
  else raise "HTTP #{res.code}"
  end
end

# first direct child with one of these local names (REXML's #name drops the namespace prefix)
def child(el, *names)
  el.each_element { |c| return c if names.include?(c.name) }
  nil
end

def text_of(el)
  return nil unless el
  el.texts.map(&:value).join   # REXML::CData is a Text too, so this already includes CDATA
end

def plain(html)
  return "" if html.nil?
  s = html.gsub(%r{<(script|style)\b.*?</\1>}im, " ").gsub(/<[^>]+>/, " ")
  CGI.unescapeHTML(s).gsub(/&#?\w+;/, " ").delete("\u200B\u200C\u200D\uFEFF").gsub(/\s+/, " ").strip
end

def teaser(html, title)
  s = plain(html)
  s = s.sub(/\A#{Regexp.escape(title)}\s*/i, "") unless title.empty?
  s = s.sub(/\s*(The post|Continue reading|Read more|Read the full).*\z/i, "")
  return nil if s.length < 30
  return s if s.length <= TEASER
  s[0, TEASER].sub(/\s+\S*\z/, "").sub(/[,;:\-–—\s]+\z/, "") + "…"
end

def time_of(s)
  return nil if s.nil? || s.strip.empty?
  Time.rfc2822(s.strip) rescue Time.iso8601(s.strip) rescue Time.parse(s.strip) rescue nil
end

def clean_url(u)
  uri = URI(u.strip)
  if uri.query
    q = URI.decode_www_form(uri.query).reject { |k, _| k.start_with?("utm_") || %w[ref source].include?(k) }
    uri.query = q.empty? ? nil : URI.encode_www_form(q)
  end
  uri.to_s
rescue URI::Error
  u.strip
end

def parse(xml, src)
  doc = REXML::Document.new(xml)
  root = doc.root or raise "empty document"
  entries = []
  root.each_recursive { |e| entries << e if %w[item entry].include?(e.name) }
  entries.first((src["limit"] || 10).to_i).filter_map do |e|
    title = plain(text_of(child(e, "title")))
    link = if e.name == "entry"
             l = e.get_elements("link").find { |x| [nil, "alternate"].include?(x.attributes["rel"]) }
             l && l.attributes["href"]
           else
             text_of(child(e, "link"))
           end
    next if title.empty? || link.nil? || link.strip.empty?
    at = time_of(text_of(child(e, "pubDate", "published", "updated", "date")))
    body = text_of(child(e, "description", "summary")) || text_of(child(e, "encoded", "content"))
    item = { "title" => title, "url" => clean_url(link), "source" => src["name"], "section" => src["section"],
             "published" => (at || Time.now).utc.iso8601 }
    if src["home"].to_s.include?("ycombinator")   # Hacker News: the description is only points + links
      item["discussion"] = text_of(child(e, "comments"))&.strip
      item["points"] = body.to_s[/Points:\s*(\d+)/, 1]&.to_i
      item["comments"] = body.to_s[/Comments:\s*(\d+)/, 1]&.to_i
    elsif src["teaser"] != false
      t = teaser(body, title)
      item["teaser"] = t if t
    end
    item.compact
  end
end

# YouTube channel feed (Atom + yt: / media: namespaces) → videos, classified as trailers or reviews
def parse_videos(xml, src)
  doc = REXML::Document.new(xml)
  root = doc.root or raise "empty document"
  entries = []
  root.each_element { |e| entries << e if e.name == "entry" }
  entries.filter_map do |e|
    id = text_of(child(e, "videoId")).to_s.strip
    title = plain(text_of(child(e, "title")))
    link = e.get_elements("link").map { |l| l.attributes["href"] }.compact.first.to_s
    next if id.empty? || title.empty? || link.include?("/shorts/") || title =~ /#(shorts|sponsored|ad)\b/i
    kind = case src["kind"]
           when "trailers" then "trailers"
           when "reviews" then title =~ REVIEW && title !~ NOT_REVIEW ? "reviews" : nil
           else title =~ REVIEW ? (title =~ NOT_REVIEW ? nil : "reviews") : title =~ TRAILER ? "trailers" : nil
           end
    next unless kind
    views = nil
    e.each_recursive { |x| views = x.attributes["views"].to_i if x.name == "statistics" && x.attributes["views"] }
    at = time_of(text_of(child(e, "published")))
    { "id" => id, "title" => title, "channel" => src["name"], "kind" => kind,
      "published" => (at || Time.now).utc.iso8601, "views" => views }.compact
  end.first(VIDEO_PER_CHANNEL)
end

def fetch_videos(now)
  return unless File.exist?(VIDEO_SOURCES)
  sources = YAML.safe_load(File.read(VIDEO_SOURCES))
  previous = (JSON.parse(File.read(VIDEO_OUT)) rescue {})
  # feeds only list the last 15 uploads: earlier runs' videos stay (deduped, until they age out)
  videos = (previous["videos"] || []).select { |v| sources.any? { |s| s["name"] == v["channel"] } }
  report = sources.map do |src|
    q = src["playlist"] ? "playlist_id=#{src['playlist']}" : "channel_id=#{src['channel']}"
    page = src["playlist"] ? "https://www.youtube.com/playlist?list=#{src['playlist']}" : "https://www.youtube.com/channel/#{src['channel']}"
    got = parse_videos(get("https://www.youtube.com/feeds/videos.xml?#{q}"), src)
    videos = got + videos   # fresh copies first, so dedupe keeps their newer view counts
    warn format("  ▶ %-20s %2d", src["name"], got.size)
    { "name" => src["name"], "kind" => src["kind"], "url" => page, "ok" => true, "count" => got.size }
  rescue StandardError, REXML::ParseException => e
    warn format("  ✗ %-20s %s (keeping earlier videos)", src["name"], e.message.lines.first.to_s.strip[0, 80])
    { "name" => src["name"], "kind" => src["kind"], "url" => page, "ok" => false, "count" => 0 }
  end
  report = report.group_by { |r| r["name"] }.map { |_, rs| rs.first.merge("ok" => rs.all? { |r| r["ok"] }) }   # one row per channel
  seen = {}
  videos = videos.select { |v| now - Time.iso8601(v["published"]) < VIDEO_MAX_AGE }
                 .select { |v| seen[v["id"]] ? false : (seen[v["id"]] = true) }
                 .sort_by { |v| v["published"] }.reverse
                 .first(VIDEO_MAX)
  out = JSON.pretty_generate({ "generated_at" => now.iso8601, "channels" => report, "videos" => videos }) + "\n"
  if ARGV.include?("--dry-run") then puts out
  else
    File.write(VIDEO_OUT, out)
    warn "wrote #{videos.size} videos from #{report.count { |r| r['ok'] }}/#{report.size} channels to _data/videos.json"
  end
end

sources = YAML.safe_load(File.read(SOURCES))
previous = (JSON.parse(File.read(OUT)) rescue {})
now = Time.now.utc
# earlier runs' stories stay until they age out (CI restores the last run's file), so a busy feed's
# short window doesn't hide what it published this morning; a failed feed just adds nothing new
items = (previous["items"] || []).select { |i| sources.any? { |s| s["name"] == i["source"] } }
report = sources.map do |src|
  got = parse(get(src["feed"]), src)
  items = got + items
  warn format("  ✓ %-16s %2d", src["name"], got.size)
  { "name" => src["name"], "section" => src["section"], "home" => src["home"], "ok" => true, "count" => got.size }
rescue StandardError, REXML::ParseException => e
  warn format("  ✗ %-16s %s (keeping earlier stories)", src["name"], e.message.lines.first.to_s.strip[0, 80])
  { "name" => src["name"], "section" => src["section"], "home" => src["home"], "ok" => false, "count" => 0 }
end

seen = {}
per_source = Hash.new(0)
items = items.select { |i| seen[i["url"]] ? false : (seen[i["url"]] = true) }
             .select { |i| now - Time.iso8601(i["published"]) < MAX_AGE }
             .map { |i| i["published"] = [Time.iso8601(i["published"]), now].min.utc.iso8601; i }   # no stories "from the future"
             .sort_by { |i| i["published"] }.reverse
             .select { |i| (per_source[i["source"]] += 1) <= PER_SOURCE }
             .first(MAX_ITEMS)

out = { "generated_at" => now.iso8601, "sources" => report, "items" => items }
json = JSON.pretty_generate(out) + "\n"
if ARGV.include?("--dry-run")
  puts json
else
  File.write(OUT, json)
  warn "wrote #{items.size} stories from #{report.count { |r| r['ok'] }}/#{report.size} feeds to _data/news.json"
end

fetch_videos(now)
