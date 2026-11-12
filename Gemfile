source "https://rubygems.org"

gem "jekyll", "~> 4.3.4"   # Windows preview pins the same (scripts/windows-preview)

group :jekyll_plugins do
  gem "jekyll-seo-tag", "~> 2.8"
  gem "jekyll-sitemap", "~> 1.4"
end

# Windows needs bundled timezone data
platforms :windows do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

gem "webrick", "~> 1.8"

# Claude API client for scripts/fetch_markets.rb (the /news/ markets tab); not used by Jekyll
gem "anthropic", "~> 2.8", require: false

# logic tests for scripts/fetch_markets.rb (bundle exec ruby tests/fetch_markets_test.rb)
group :test do
  gem "minitest", "~> 5.25"
end
