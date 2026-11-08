---
# HOW TO PUBLISH: fill in the brackets, rename to _posts/YYYY-MM-DD-short-title.md, push.
# Keep it anonymised: no client or hospital names, no patient data, no internal URLs.
title: "[Case study: e.g. Cutting FHIR sync time from hours to minutes]"
pr: 2
tags: [case-study, rails, healthcare, "[fhir / billing / performance]"]
commits: 5
case:
  context: "[e.g. Hospital network, ~40 clinics, Rails monolith + Sidekiq]"
  role: "[e.g. Lead backend engineer; designed and shipped the sync pipeline]"
  duration: "[e.g. 3 months, 2 engineers]"
  stack: [Ruby on Rails, PostgreSQL, Sidekiq, Redis, HL7 FHIR]
  impact:
    - { value: "[e.g. 6h → 12 min]", label: "[nightly patient sync]" }
    - { value: "[e.g. −80%]", label: "[failed jobs per week]" }
    - { value: "[e.g. 0]", label: "[duplicate records after launch]" }
---

## The problem
[2–4 sentences: what was broken or slow, who felt it, why it mattered. Numbers if you have them.]

## Constraints
- [e.g. couldn't take the system offline during clinic hours]
- [e.g. the external FHIR server rate-limited us to N requests/min]
- [e.g. legacy data with inconsistent identifiers]

## What I did
1. [Step: e.g. measured first: added timing per stage and found 70% of time in one N+1 query]
2. [Step: e.g. moved the sync to batched Sidekiq jobs with idempotency keys]
3. [Step: e.g. added a reconciliation job and alerts]

```ruby
# [optional: a small, generic code sample that shows the idea, nothing proprietary]
```

## Result
[What changed, with the numbers from the summary card. One line on what users/staff noticed.]

## What I'd do differently
[1–3 honest lessons.]
