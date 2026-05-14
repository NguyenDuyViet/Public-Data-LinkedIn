✨ Features
🔎 Search LinkedIn posts by keyword
🔐 Require li_at session cookie
👤 Extract author info (name, profile, bio)
💬 Get post content
👍 Collect likes & comments
🖼️ Extract images/media
📦 Export JSON / CSV via Apify Dataset
⚙️ Input
{
  "keyword": "AI",
  "maxPosts": 20,
  "linkedinCookie": "YOUR_li_at_COOKIE"
}
📥 Fields
keyword (optional): search keyword
maxPosts (optional): number of posts
linkedinCookie (required): LinkedIn session cookie
📤 Output
{
  "post": {
    "content": "...",
    "linkedinUrl": "..."
  },
  "author": {
    "name": "John Doe",
    "profileUrl": "...",
    "info": "..."
  },
  "engagement": {
    "likes": 120,
    "comments": 15
  },
  "media": {
    "images": ["..."]
  }
}
🔐 How to get li_at

LinkedIn → DevTools (F12) → Application → Cookies → li_at

⚠️ Notes
Requires valid LinkedIn login cookie
May break if LinkedIn changes UI
Use delay to avoid detection
🧠 Tech Stack

Node.js • Playwright • Crawlee • Apify SDK

🚀 Use Cases
Trend monitoring
Lead research
Social analytics
Data pipelines
