---
layout: post
title: "Hello, world: how this site is built"
pr: 1
tags: [jekyll, javascript, supabase, design]
commits: 3
---
This is the first post on the blog, so it seems fair to start with the thing you are looking at.

The site is plain [Jekyll](https://jekyllrb.com/). The source lives in a public repository, and every push to `main` runs a GitHub Actions workflow that builds it and deploys it to GitHub Pages. There is no Node toolchain and no bundler: a handful of Liquid templates, one YAML file with my résumé data, some CSS and some vanilla JavaScript.

## An editor instead of a résumé

I spend most of my day in an editor, so the site pretends to be one. There is a file tree on the left, a tab bar and a status bar, and each section is a file you would find in a Rails app. My work experience is a `git log`; skills are a `Gemfile` grouped by area; education is a list of `db/migrate` files running in order. Even this blog follows the idea: every post is a merged pull request.

## The terminal

Press <kbd>Ctrl</kbd> + <kbd>K</kbd> and a small terminal opens. It is written in vanilla JS, keeps a command history, completes with Tab, and knows a few commands about me and the site. Type `help` to see what it can do.

## Two small games

Signed-in visitors get access to the arcade: **Sidekiq Rush**, where you route background jobs to the right queues before Redis overflows, and **Gem Match**, a match-three game built from the gems in my Gemfile. Both are plain JavaScript, no game engine.

## Optional accounts

Sign-in is optional and uses [Supabase](https://supabase.com/), either with a magic link sent by email or with GitHub. Nothing on the site needs it except the games and a few role-based easter eggs, which I won't spoil here.

## The colour

The theme is phthalo green with gold details, because phthalo green is my favourite colour. There is a light mode too, toggled from the sidebar.

That is the whole stack. If you spot a bug, the contact form on the homepage reaches me directly.
