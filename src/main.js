import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();

const {
    keyword = 'AI',
    maxPosts = 20,
    linkedinCookie
} = input || {};

const searchUrl =
    `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}`;

const crawler = new PlaywrightCrawler({

    maxRequestsPerCrawl: 1,

    launchContext: {
        launchOptions: {
            headless: true,
        },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
    },

    // 🔥 FIX QUAN TRỌNG: set cookie TRƯỚC navigation
    preNavigationHooks: [
        async ({ page }) => {
        if (linkedinCookie) {
            await page.context().addCookies([
            {
                name: 'li_at',
                value: linkedinCookie,
                domain: '.linkedin.com',
                path: '/',
            }
            ]);
        }
        }
    ],

    async requestHandler({ page, request, log }) {

        try {

            log.info(`Opening ${request.url}`);

            await page.goto(request.url, {
                waitUntil: 'domcontentloaded',
                timeout: 120000,
            });

            // 🔥 CHECK LOGIN
            const url = page.url();
            log.info(`Current URL: ${url}`);

            if (url.includes('/uas/login')) {
                await page.screenshot({ path: 'login-failed.png', fullPage: true });
                throw new Error('❌ Not logged in - cookie invalid or expired');
            }

            // 🔥 wait feed load
            await page.waitForTimeout(5000);

            // 🔥 scroll to load posts
            for (let i = 0; i < 8; i++) {
                await page.mouse.wheel(0, 3000);
                await page.waitForTimeout(2000);
            }

            // 🔥 wait selector stable
            await page.waitForSelector('.feed-shared-update-v2', {
                timeout: 30000,
            });

            const exists = await page.locator('.feed-shared-update-v2').count();
            log.info(`Posts found: ${exists}`);

            if (!exists) {
                await page.screenshot({ path: 'no-posts.png', fullPage: true });
                throw new Error('No posts found (DOM empty or blocked)');
            }

            const posts = await page.$$eval(
                '.feed-shared-update-v2',
                (elements, maxPosts) => {

                    const clean = (text) =>
                        text?.replace(/\s+/g, ' ').trim() || null;

                    return elements.slice(0, maxPosts).map(el => {

                        const text = (selector) =>
                            clean(el.querySelector(selector)?.innerText);

                        const attr = (selector, attr) =>
                            el.querySelector(selector)?.getAttribute(attr) || null;

                        const postUrl =
                            attr('a[href*="/posts/"], a[href*="/feed/update/"], a[href*="/ugcPost/"]', 'href');

                        return {
                            post: {
                                content: text('.update-components-text'),
                                linkedinUrl: postUrl,
                            },

                            author: {
                                name: text('.update-components-actor__title'),
                                profileUrl: attr('.update-components-actor__meta-link', 'href'),
                                info: text('.update-components-actor__description'),
                            },

                            engagement: {
                                likes: text('.social-details-social-counts__reactions-count'),
                                comments: text('.social-details-social-counts__comments'),
                            },

                            media: {
                                images: Array.from(el.querySelectorAll('img'))
                                    .map(img => img.src)
                                    .filter(Boolean),
                            },
                        };
                    });
                },
                maxPosts
            );

            await Dataset.pushData(posts);

            log.info(`Saved ${posts.length} posts`);

        } catch (error) {

            log.error(error);

            await page.screenshot({
                path: 'error.png',
                fullPage: true,
            });

            throw error;
        }
    }
});

await crawler.run([{ url: searchUrl }]);

await Actor.exit();