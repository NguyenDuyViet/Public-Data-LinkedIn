# 🚀 LinkedIn Posts Scraper (Pro Actor)

Extract LinkedIn posts at scale using keyword search and authenticated sessions (`li_at` cookie).

---

## ⚡ Overview

**LinkedIn Posts Scraper** is a high-performance Apify Actor designed to extract structured LinkedIn post data using keyword-based search with authenticated sessions.

It is built for:

- 📊 Data analysts  
- 🧲 Growth hackers  
- 👨‍💼 Recruiters  
- 🧠 AI / LLM researchers  
- 📈 Market intelligence teams  

---

## ✨ Key Features

- 🔎 Keyword-based LinkedIn post search  
- 🔐 Secure session authentication via `li_at` cookie  
- 👤 Rich author profiling (name, headline, profile, bio)  
- 💬 Full post content extraction  
- 📊 Engagement metrics (likes, comments, reactions)  
- 🖼️ Media extraction (images)  
- 📦 Structured JSON / CSV output  
- ⚡ Built with Playwright + Crawlee for stability and scale  

---

## 🚀 Why This Actor?

Unlike basic scrapers, this actor is optimized for production use:

- High-quality structured datasets ready for AI/analytics pipelines  
- Stable crawling logic with session handling  
- Adapted to real-world LinkedIn DOM changes  
- Reduced detection footprint for better reliability  
- Scalable execution on Apify infrastructure  

---

## ⚙️ Input Schema

```json
{
  "keyword": "AI",
  "maxPosts": 20,
  "linkedinCookie": "YOUR_li_at_COOKIE"
}
