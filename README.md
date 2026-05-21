# LinkedIn Public Data Scraper

Extract public LinkedIn post data by direct post URL or by LinkedIn post search using queries, filters, and hashtags.

---

## Overview

**LinkedIn Public Data Scraper** is an Apify Actor for collecting structured public data from LinkedIn posts with an authenticated LinkedIn session (`li_at` cookie).

It is useful for:

- Data analysis
- Market research
- Lead research
- Recruiting research
- Social listening
- AI / LLM datasets

---

## Key Features

- Crawl one specific LinkedIn post by URL
- Search public LinkedIn posts by keyword query
- Add hashtag-based search terms
- Filter by date posted
- Sort search results by relevance or latest
- Optional member, company, and author industry filters
- Extract post content and detected hashtags
- Extract author name and profile URL
- Extract engagement metrics when visible
- Extract post media image URLs
- Export structured JSON / CSV from Apify Dataset
- Built with Playwright + Crawlee

---

## Input Schema

You can use either `linkPost` for one post, or `searchQuery` / `hashtags` for search mode.

### Search mode example

```json
{
  "searchQuery": "AI hiring",
  "hashtags": ["AI", "MachineLearning", "Recruitment"],
  "maxPosts": 20,
  "sortBy": "date_posted",
  "datePosted": "past-week",
  "linkedinCookie": "YOUR_li_at_COOKIE"
}
```

### Direct post mode example

```json
{
  "linkPost": "https://www.linkedin.com/feed/update/urn:li:activity:123456789/",
  "linkedinCookie": "li_at=YOUR_li_at_COOKIE; JSESSIONID=ajax:123456789; bcookie=..."
}
```

---

## Input Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `linkedinCookie` | string | Yes | Raw `li_at` value or full LinkedIn cookie string used for authenticated browsing. |
| `linkPost` | string | No | Direct LinkedIn post URL. When provided, the Actor crawls this post only. |
| `searchQuery` | string | No | Keyword query for LinkedIn post search. |
| `hashtags` | string[] | No | Hashtags to include in search. Values can be written with or without `#`. |
| `maxPosts` | number | No | Maximum number of posts to extract. Default: `20`. |
| `sortBy` | string | No | `relevance` or `date_posted`. |
| `datePosted` | string | No | `anytime`, `past-24h`, `past-week`, or `past-month`. |
| `fromMember` | string[] | No | Optional LinkedIn member IDs for author filtering. |
| `fromCompany` | string[] | No | Optional LinkedIn company IDs for company filtering. |
| `authorIndustry` | string[] | No | Optional LinkedIn industry IDs for author industry filtering. |

At least one of `linkPost`, `searchQuery`, or `hashtags` should be provided.

---

## Output Example

```json
{
  "query": {
    "searchQuery": "AI hiring",
    "hashtags": ["AI", "Recruitment"],
    "filters": {
      "sortBy": "date_posted",
      "datePosted": "past-week",
      "fromMember": [],
      "fromCompany": [],
      "authorIndustry": []
    }
  },
  "post": {
    "content": "Example LinkedIn post content...",
    "hashtags": ["AI", "Recruitment"],
    "linkedinUrl": "https://www.linkedin.com/feed/update/urn:li:activity:123456789/",
    "urn": "urn:li:activity:123456789"
  },
  "author": {
    "name": "Example Author",
    "profileUrl": "https://www.linkedin.com/in/example-author"
  },
  "engagement": {
    "likes": "120",
    "comments": "14",
    "reposts": "3"
  },
  "media": {
    "images": ["https://media.licdn.com/..."]
  }
}
```

---

## Notes

- LinkedIn pages change often, so selectors may need maintenance over time.
- Some filters require LinkedIn internal IDs, not display names.
- The Actor only extracts data visible to the authenticated LinkedIn account.
- The `li_at` cookie can expire, so refresh it when login fails or LinkedIn redirects too many times.
- If a direct post URL keeps redirecting, paste the full `Cookie` request header from LinkedIn instead of only the `li_at` value.
