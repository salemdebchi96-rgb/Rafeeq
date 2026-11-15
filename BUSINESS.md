# Business plan: path to $10,000/month (honest version)

No product can guarantee income. This is the math and the levers; your results depend on
marketing, retention and costs you must measure.

## The math
Assumptions (replace with your real numbers from `/api/admin/stats` and your API bill):
- Price $9.99/month (or $79/year ≈ $6.60/month)
- Payment + tax fees: Lemon Squeezy lists ≈ 5% + $0.50 per transaction (check current pricing) ≈ $1.00 per $9.99 charge
- AI cost per paying user ≈ $1.50–$3.00/month (heavy users cost more; the daily cap limits this)
- Net per subscriber ≈ $6.50–$8.00

| Goal | Paying subscribers needed |
|------|---------------------------|
| $10,000 net profit/month | ≈ 1,250–1,550 (before hosting, tools, ads) |
| $10,000 revenue/month | ≈ 1,000 |

With 3–5% free→paid conversion you need roughly 25,000–50,000 registered users.
With 8–12% monthly churn, you must add ≈ 100–180 new paying users every month just to stand still.
Typical timeline for a solo founder: many months to a year or more; many projects never get there.

## Levers (in order of impact)
1. **Retention**: users stay when the product is genuinely helpful and warm. Do NOT use guilt, fake
   "I miss you" pressure, or manipulation — it harms users and is increasingly regulated.
2. **Acquisition**: short videos (TikTok/Reels/YouTube Shorts) showing real conversations,
   Arabic-language communities, SEO landing pages ("رفيق ذكاء اصطناعي", "صديق افتراضي"), influencer
   partnerships with a promo code (create discount codes in the Lemon Squeezy dashboard).
3. **Pricing**: offer the annual plan (cash up front, lower churn). Test $7.99 / $9.99 / $14.99.
4. **Cost control**: free users use the cheaper `FREE_MODEL`; `PREMIUM_DAILY_CAP` prevents loss-making
   heavy users; monitor cost per user weekly.
5. **Conversion**: show the upgrade prompt when the free limit is reached (already built).

## Risks to manage
- **Payments policy**: keep content non-sexual; payment providers and app stores restrict adult content.
- **Regulation**: companion chatbots are regulated in some places (e.g., California, New York). Get legal advice,
  keep the "this is an AI" disclosure, 18+ gate, and crisis handling.
- **Data**: you hold sensitive conversations. Use HTTPS, back up the DB, publish a real privacy policy.
- **Dependency**: you rely on the Anthropic API and Stripe; watch rate limits and pricing changes.

## First 90 days
- Weeks 1–2: deploy, add domain + SMTP + Stripe, test the full signup→pay→cancel flow.
- Weeks 3–6: 30 short videos, 5 communities, collect feedback from the first 100 users.
- Weeks 7–12: fix what users ask for, test pricing, aim for 100 paying users, then scale what works.
