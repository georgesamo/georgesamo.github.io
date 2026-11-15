---
layout: post
title: "How a personal site became an arcade"
description: "Why my personal site turned into an arcade of four browser games, what each game taught me, and the engineering choices behind it: seeded runs, seamless navigation, offline play and a deep test in CI."
tags: [javascript, games, pwa, testing]
---
A week ago the first post on this blog described a résumé dressed up as a code editor, with two small games for signed-in visitors. If you open the site today you land in an arcade. The profile is still here, at [/samuka/](/samuka/), but the front door is a lobby with four games, a daily puzzle, leaderboards, live races and a soundtrack that keeps playing while you move around.

This post is about how that happened, what each game taught me, and a few engineering choices I think are worth sharing.

## From a résumé to a lobby

The first commit was "a résumé that boots like a Rails app". By the end of the same day it had Sidekiq Rush and Gem Match, optional accounts, leaderboards, a daily puzzle and 1v1. Then came the commit that moved the lobby to `/` and the creator profile to `/samuka/`.

Not every game made it. Schema Stack arrived together with Regex Golf, Regex Golf was replaced by Merge Conflict, and Merge Conflict was replaced by Pit Wall, all on that first day. Three of the four that stayed turn a piece of my day job into a game rule: Sidekiq Rush is background jobs, Gem Match is a Gemfile and Schema Stack is migrations. Pit Wall is the odd one out, a race strategy simulation with no Rails in it at all.

Everything is plain JavaScript, with no game engine and no framework. Jekyll builds the pages and GitHub Pages serves them, as before.

## What each game taught me

Each game has a short "how it's built" page now, for anyone who'd rather read than play. Each of those pages ends with a "looking back" line, and they are the honest summary of what I learned.

**[Sidekiq Rush](/games/sidekiq/about/)**: you route hospital jobs into the critical, default and mailers queues before Redis runs out of memory. Jobs raise, get retried twice and land in the DeadSet, the way Sidekiq treats them. The lesson: *seeding every run was the decision that paid off most*. The same seed gives fair live races, fair challenge links, and a bug I can replay exactly.

**[Gem Match](/games/gems/about/)**: a match-3 with gems from a Rails Gemfile and power-ups that set each other off. Finding runs of three on an 8×8 board is the easy part. The lesson: *the hard part of a match-3 is the order things happen in*. A power-up caught in another one's blast has to fire too, and treating those chain reactions as a queue, a breadth-first walk over the board, is what makes every combo resolve the same way every time.

**[Schema Stack](/games/schema/about/)**: falling blocks, except every piece is a migration. Change a table before its `create_table` lands and the change sits there pending, blocking its row, until the table exists. Then every pending change runs at once. The lesson: *the best game rule is one the player already knows*. Anyone who has run a migration too early gets the mechanic without a tutorial. And the game ends the way a Rails app does when you forget to migrate, with `ActiveRecord::PendingMigrationError`.

**[Pit Wall](/games/pitwall/about/)**: you are the race engineer for one of ten cars, calling pit stops, tyres and ERS while the race runs. Lap times come from pace, tyre wear (with a cliff), fuel, weather and driving mode, and nine computer cars plan their own strategies. The lesson: *keep the simulation apart from the drawing*. The simulation decides when each car will be where on this lap; the renderer only asks where every car is right now. That's what let me keep tuning the race model without cars ever jumping on screen.

## Engineering choices worth sharing

### One seed, the same game

Every run of every game has a seed, and most of the social features are built on that one idea. The daily Gem Match board is the same for everyone. A live 1v1 race sends a seed from the host, so both players get the same jobs, or the same circuit, grid, weather and incidents. A challenge link carries the seed of your run, so a friend plays the exact same board whenever they like. Nothing about the board has to be stored or synced.

The generator itself is small. It hashes the seed string into a 32-bit number and steps a fast PRNG from there:

```js
// seeded random numbers (daily puzzle, live races): same seed, same game
function seeded(seed) {
  var str = String(seed), h = 1779033703 ^ str.length;
  for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  var a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

The rule that makes it work is discipline, not cleverness: every random decision that shapes a run has to go through the seeded generator. One stray `Math.random()` in the wrong place and two players stop seeing the same board.

### Navigation that keeps the music playing

The arcade has a lo-fi soundtrack, and I wanted it to keep playing when you go from the lobby to the leaderboards. A normal page load would cut it off. So internal links don't load a new page. `nav.js` fetches the next page in the background, parses it, and swaps only the parts that change: the main area, the file tree, the tabs and the status bar. The frame, the music, the terminal, live presence and chat keep running.

The cost is that every script on the site has to cope with content that appears without a page load. The rule is simple: modules re-scan the new content when the `samuka:page` event fires. And anything unexpected (another origin, a PDF, a modified click, a failed fetch) falls back to a normal page load, so the worst case is the web's ordinary behaviour.

### An arcade you can install

The site is a PWA now. Add it to your home screen and it opens like an app, and the lobby, the games page, every game and the soundtrack stay on your device, so the games still play with no signal. Scores, leaderboards and live games still need a connection.

The part I cared about most was never serving a stale build. Pages are network-first and always revalidated, so a deploy is seen at once, and the cached copy is only used when the network fails. Scripts and stylesheets get content hashes at build time, so the same URL always means the same bytes and can safely be served from the cache first. Anything that talks to the backend, anything cross-origin and any request carrying an `Authorization` header is left to the network.

And because a broken service worker can keep serving a broken site long after you fix it, there is a kill switch in `_config.yml`:

```yaml
# Emergency kill switch: set to false and deploy. sw.js then deletes its
# caches and unregisters itself on every visitor's next page load.
service_worker: true
```

### A deep test before every deploy

There's no Node toolchain on the site itself, but CI has one. Every deploy runs the unit tests in headless Chrome, builds the site with Jekyll, minifies and hashes the assets, and then tests the exact files that will be deployed.

That last step, `tests/deep.mjs`, opens every page on a desktop and a phone viewport and looks for page errors, failed requests, horizontal overflow, broken links and images, and visual problems like an icon off-centre in its button or clipped text. Then it walks through the flows a player would: seamless navigation with back and forward, the theme toggle, opening, playing and closing every game, the command palette, the phone "more" sheet and the music dock. In CI it runs in strict mode, so even a warning blocks the deploy.

## What's next

The arcade keeps growing: challenges that tell you when a friend beats your score, a weekly recap, calm mode, a page for recruiters. Most of it is in [What's new](/whats-new/). If you want the short version of any game without playing it, every card on the [games page](/games/) has a "how it's built" link.

And if you find a bug, it has probably already reached me: JavaScript errors on players' devices now send a short anonymous note. The contact form still works too.
