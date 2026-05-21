import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();

const {
    linkPost,
    searchQuery,
    hashtags = [],
    maxPosts = 20,
    linkedinCookie,
    sortBy = 'relevance',
    datePosted = 'anytime',
    fromMember,
    fromCompany,
    authorIndustry,
} = input || {};

if (!linkedinCookie) {
    throw new Error('linkedinCookie is required');
}

const parseLinkedInCookies = (cookieInput) => {
    const value = String(cookieInput).trim().replace(/^cookie:\s*/i, '');
    const ignoredCookieAttributes = new Set([
        'domain',
        'expires',
        'httponly',
        'max-age',
        'path',
        'samesite',
        'secure',
    ]);

    if (value.startsWith('[') || value.startsWith('{')) {
        try {
            const parsed = JSON.parse(value);
            const cookies = Array.isArray(parsed) ? parsed : [parsed];

            return cookies
                .filter(cookie =>
                    cookie?.name &&
                    cookie?.value &&
                    String(cookie.domain || '').includes('linkedin.com')
                )
                .map(cookie => ({
                    name: String(cookie.name),
                    value: String(cookie.value),
                    domain: cookie.domain || '.linkedin.com',
                    path: cookie.path || '/',
                    secure: cookie.secure ?? true,
                }));
        } catch {
            throw new Error('linkedinCookie JSON is invalid');
        }
    }

    if (!value.includes('=')) {
        return [
            {
                name: 'li_at',
                value,
                domain: '.linkedin.com',
                path: '/',
                secure: true,
            },
        ];
    }

    return value
        .split(';')
        .map(cookie => cookie.trim())
        .filter(Boolean)
        .map(cookie => {
            const separatorIndex = cookie.indexOf('=');
            const name = cookie.slice(0, separatorIndex).trim();
            const cookieValue = cookie.slice(separatorIndex + 1).trim();

            if (ignoredCookieAttributes.has(name.toLowerCase())) {
                return null;
            }

            return {
                name,
                value: cookieValue,
                domain: '.linkedin.com',
                path: '/',
                secure: true,
            };
        })
        .filter(cookie => cookie?.name && cookie.value);
};

const normalizeList = (value) => {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value
            .map(item => String(item).trim())
            .filter(Boolean);
    }

    return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
};

const cleanHashtag = (value) => value.replace(/^#/, '').trim();

const postSelector = [
    '.feed-shared-update-v2',
    '.fie-impression-container',
    '.occludable-update',
    '[data-urn*="urn:li:activity"]',
    '[data-id*="urn:li:activity"]',
    '[data-view-name="feed-full-update"]',
    '[data-view-name="feed-shared-update-v2"]',
    '[data-test-id="main-feed-activity-card"]',
    '.reusable-search__result-container',
    'article',
    '[role="article"]',
].join(', ');

const normalizeLinkedInUrl = (url) => {
    const normalized = url.trim();

    if (/^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:\d+\/?$/.test(normalized)) {
        return normalized.endsWith('/') ? normalized : `${normalized}/`;
    }

    return normalized;
};

const buildSearchUrl = () => {
    const tags = normalizeList(hashtags)
        .map(cleanHashtag)
        .filter(Boolean);

    const keywordParts = [
        searchQuery?.trim(),
        ...tags.map(tag => `#${tag}`),
    ].filter(Boolean);

    if (!keywordParts.length) {
        throw new Error('Provide either linkPost, searchQuery, or hashtags');
    }

    const url = new URL('https://www.linkedin.com/search/results/content/');

    url.searchParams.set('keywords', keywordParts.join(' '));
    url.searchParams.set('origin', 'GLOBAL_SEARCH_HEADER');

    if (sortBy && sortBy !== 'relevance') {
        url.searchParams.set('sortBy', sortBy);
    }

    if (datePosted && datePosted !== 'anytime') {
        url.searchParams.set('datePosted', datePosted);
    }

    const memberFilters = normalizeList(fromMember);
    const companyFilters = normalizeList(fromCompany);
    const industryFilters = normalizeList(authorIndustry);

    if (memberFilters.length) {
        url.searchParams.set('fromMember', JSON.stringify(memberFilters));
    }

    if (companyFilters.length) {
        url.searchParams.set('fromCompany', JSON.stringify(companyFilters));
    }

    if (industryFilters.length) {
        url.searchParams.set('authorIndustry', JSON.stringify(industryFilters));
    }

    return url.toString();
};

let startUrl;
let crawlMode;

if (linkPost) {
    const normalizedLinkPost = normalizeLinkedInUrl(linkPost);

    if (!normalizedLinkPost.startsWith('https://www.linkedin.com/')) {
        throw new Error('linkPost must be a valid LinkedIn URL');
    }

    startUrl = normalizedLinkPost;
    crawlMode = 'post';
} else {
    startUrl = buildSearchUrl();
    crawlMode = 'search';
}

const ensureLoggedInUrl = async (page, url, screenshotPath = 'login-failed.png') => {
    if (
        url.includes('/uas/login') ||
        url.includes('/checkpoint/') ||
        url.includes('/login')
    ) {
        await page.screenshot({
            path: screenshotPath,
            fullPage: true,
        });

        throw new Error('Not logged in - LinkedIn cookie invalid, expired, or blocked by checkpoint');
    }
};

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 0,
    requestHandlerTimeoutSecs: 180,

    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
            ],
        },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
    },

    async requestHandler({ page, request, log }) {
        try {
            log.info(`Opening ${request.url}`);

            await page.route('**/*', (route) => {
                const type = route.request().resourceType();
                const url = route.request().url();

                if (
                    ['font', 'stylesheet'].includes(type) ||
                    url.includes('ads.linkedin.com') ||
                    url.includes('doubleclick') ||
                    url.includes('googleads')
                ) {
                    return route.abort();
                }

                return route.continue();
            });

            const cookies = parseLinkedInCookies(linkedinCookie);

            if (!cookies.some(cookie => cookie.name === 'li_at')) {
                throw new Error('linkedinCookie must include a valid li_at cookie');
            }

            log.info(`Using LinkedIn cookies: ${cookies.map(cookie => cookie.name).join(', ')}`);
            await page.context().addCookies(cookies);

            await page.goto('https://www.linkedin.com/feed/', {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            });

            const warmupUrl = page.url();
            log.info(`Warmup URL: ${warmupUrl}`);

            await ensureLoggedInUrl(page, warmupUrl);

            await page.goto(request.url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            });

            const currentUrl = page.url();
            log.info(`Current URL: ${currentUrl}`);

            await ensureLoggedInUrl(page, currentUrl);

            await page.waitForSelector('body', {
                timeout: 30000,
            });

            const targetPosts = Math.max(1, Number(maxPosts) || 20);

            if (crawlMode === 'search') {
                await page.waitForTimeout(5000);

                let previousHeight = 0;

                for (let i = 0; i < 20; i += 1) {
                    const postsCount = await page.locator('.feed-shared-update-v2, [data-urn*="urn:li:activity"], [data-id*="urn:li:activity"]').count();

                    if (postsCount >= targetPosts) break;

                    previousHeight = await page.evaluate(() => document.body.scrollHeight);
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await page.waitForTimeout(2500);

                    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
                    if (currentHeight === previousHeight) break;
                }
            } else {
                await page.waitForTimeout(8000);
                await page.mouse.wheel(0, 1200);
                await page.waitForTimeout(2000);
                await page.mouse.wheel(0, -1200);
                await page.waitForTimeout(2000);
            }

            log.info(`Title: ${await page.title()}`);
            log.info(`Final URL: ${page.url()}`);

            const selectorCounts = await page.evaluate((selector) => ({
                posts: document.querySelectorAll(selector).length,
                updateText: document.querySelectorAll('.update-components-text').length,
                breakWords: document.querySelectorAll('.break-words').length,
                articles: document.querySelectorAll('article, [role="article"]').length,
                bodyLength: document.body?.innerText?.length || 0,
            }), postSelector);

            log.info(`Selector counts: ${JSON.stringify(selectorCounts)}`);

            const posts = await page.evaluate(({ crawlMode, targetPosts, input, postSelector }) => {
                const clean = (text) => text?.replace(/\s+/g, ' ').trim() || null;

                const absoluteUrl = (href) => {
                    if (!href) return null;

                    try {
                        return new URL(href, window.location.origin).toString().split('?')[0];
                    } catch {
                        return null;
                    }
                };

                const normalizeText = (value) =>
                    clean(value)
                        ?.normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase() || '';

                const extractNumber = (value) => {
                    const match = value?.match(/[\d,.]+(?:\s*[KMB])?/i);
                    return match ? match[0].replace(/\s+/g, '') : null;
                };

                const extractHashtags = (value) => (
                    value?.match(/#[\p{L}\p{N}_-]+/gu) || []
                ).map(tag => tag.replace(/^#/, ''));

                const isVisible = (element) =>
                    Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);

                const isChromeElement = (element) =>
                    Boolean(element.closest('header, nav, aside, .global-nav, .msg-overlay-list-bubble, .artdeco-toast-item'));

                const isPostImage = (src) =>
                    src &&
                    src.includes('media.licdn.com') &&
                    !src.includes('profile-displayphoto') &&
                    !src.includes('profile-framedphoto') &&
                    !src.includes('company-logo') &&
                    !src.includes('ghost-') &&
                    (
                        src.includes('feedshare') ||
                        src.includes('ugc') ||
                        src.includes('article') ||
                        src.includes('digitalmedia')
                    );

                const uniqueElements = (elements) => [...new Set(elements)]
                    .filter(Boolean)
                    .filter(isVisible)
                    .filter(element => !isChromeElement(element));

                const activityId = window.location.href.match(/activity[:%3A]+(\d+)/i)?.[1] || null;
                const seedElements = [
                    ...Array.from(document.querySelectorAll(postSelector)),
                    ...Array.from(document.querySelectorAll('img')).filter(img => isPostImage(img.src)),
                    ...Array.from(document.querySelectorAll('.update-components-text, .break-words, [dir="ltr"]'))
                        .filter(element => /#[\p{L}\p{N}_-]+/u.test(element.innerText || '')),
                ];

                const getPostContainer = (element) => {
                    const closestPost = element.closest(postSelector);
                    if (closestPost && !isChromeElement(closestPost)) return closestPost;

                    let current = element.parentElement;

                    for (let i = 0; i < 8 && current && current !== document.body; i += 1) {
                        if (
                            current.querySelector('.update-components-text, .feed-shared-update-v2__commentary, [data-test-id="main-feed-activity-card__commentary"]') &&
                            current.querySelector('a[href*="/in/"], a[href*="/company/"], a[href*="/school/"]')
                        ) {
                            return current;
                        }

                        current = current.parentElement;
                    }

                    return element;
                };

                const postElements = uniqueElements(seedElements.map(getPostContainer));

                const scoreCandidate = (element) => {
                    const text = clean(element.innerText) || '';
                    const normalized = normalizeText(text);
                    const html = element.outerHTML || '';
                    const images = Array.from(element.querySelectorAll('img')).map(img => img.src);
                    const hasPostImage = images.some(isPostImage);
                    const hasUpdateText = Boolean(element.querySelector([
                        '.update-components-text',
                        '.feed-shared-inline-show-more-text',
                        '.feed-shared-update-v2__description-wrapper',
                        '.feed-shared-update-v2__commentary',
                        '[data-test-id="main-feed-activity-card__commentary"]',
                        '.break-words',
                    ].join(', ')));
                    const hasActivity = activityId && html.includes(activityId);
                    const navNoise = ['home', 'my network', 'jobs', 'messaging', 'notifications']
                        .filter(label => normalized.includes(label)).length;

                    let score = 0;

                    if (hasActivity) score += 80;
                    if (hasPostImage) score += 45;
                    if (hasUpdateText) score += 35;
                    if (/#[\p{L}\p{N}_-]+/u.test(text)) score += 30;
                    if (element.matches('.feed-shared-update-v2, .fie-impression-container, .occludable-update, article, [role="article"]')) score += 20;
                    if (/(reaction|like|comment|repost|share|binh luan|chia se|cam xuc)/i.test(normalized)) score += 10;
                    if (text.length > 80 && text.length < 5000) score += 8;
                    if (text.length >= 5000) score -= 30;
                    if (navNoise >= 3) score -= 60;

                    return score;
                };

                let candidates = postElements
                    .map(element => ({ element, score: scoreCandidate(element) }))
                    .filter(item => item.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .map(item => item.element);

                if (crawlMode === 'post') {
                    candidates = candidates.slice(0, 1);
                }

                if (crawlMode === 'post' && !candidates.length) {
                    const fallback = document.querySelector('main, [role="main"], .scaffold-layout__main');
                    candidates = fallback && !isChromeElement(fallback) ? [fallback] : [];
                }

                const viewerProfileUrls = new Set(
                    Array.from(document.querySelectorAll('header a[href*="/in/"], nav a[href*="/in/"], .global-nav a[href*="/in/"]'))
                        .map(a => absoluteUrl(a.getAttribute('href')))
                        .filter(Boolean)
                );

                const extractActivityUrn = (element) => {
                    const dataValue = [
                        element.getAttribute('data-urn'),
                        element.getAttribute('data-id'),
                        element.querySelector('[data-urn*="urn:li:activity"], [data-id*="urn:li:activity"]')?.getAttribute('data-urn'),
                        element.querySelector('[data-urn*="urn:li:activity"], [data-id*="urn:li:activity"]')?.getAttribute('data-id'),
                    ].find(value => value?.includes('urn:li:activity'));

                    if (dataValue) {
                        return dataValue.match(/urn:li:activity:\d+/)?.[0] || dataValue;
                    }

                    return (element.outerHTML || '').match(/urn:li:activity:\d+/)?.[0] || null;
                };

                const normalizeFingerprint = (value) => normalizeText(value).replace(/[^a-z0-9]+/g, '').slice(0, 240);
                const dedupePosts = (items) => {
                    const seen = new Set();

                    return items
                        .sort((a, b) => {
                            const aHasUrn = Number(Boolean(a.post.urn));
                            const bHasUrn = Number(Boolean(b.post.urn));
                            const aUrlIsSearch = Number(a.post.linkedinUrl === window.location.href);
                            const bUrlIsSearch = Number(b.post.linkedinUrl === window.location.href);

                            return bHasUrn - aHasUrn || aUrlIsSearch - bUrlIsSearch;
                        })
                        .filter(item => {
                            const fingerprintKey = [
                                    'fingerprint',
                                    normalizeFingerprint(item.author.profileUrl || item.author.name || ''),
                                    normalizeFingerprint(item.post.content || ''),
                                ].join(':');
                            const keys = [
                                item.post.urn ? `urn:${item.post.urn}` : null,
                                fingerprintKey,
                            ].filter(Boolean);

                            if (keys.some(key => seen.has(key))) return false;
                            keys.forEach(key => seen.add(key));
                            return true;
                        });
                };

                const isValidPostResult = (item) => {
                    const hasAuthor = Boolean(item.author.name && item.author.profileUrl);
                    const hasPostIdentity = Boolean(
                        item.post.urn ||
                        (item.post.linkedinUrl && !item.post.linkedinUrl.includes('/search/results/content/'))
                    );

                    if (crawlMode === 'post') {
                        return Boolean(item.post.content && (hasAuthor || hasPostIdentity));
                    }

                    return Boolean(item.post.content && hasAuthor && hasPostIdentity);
                };

                const posts = candidates.map((postEl) => {
                    const textBlocks = Array.from(postEl.querySelectorAll([
                        '.update-components-text',
                        '.feed-shared-inline-show-more-text',
                        '.feed-shared-update-v2__description-wrapper',
                        '.feed-shared-update-v2__commentary',
                        '[data-test-id="main-feed-activity-card__commentary"]',
                        '.break-words',
                        '[dir="ltr"]',
                        'p',
                    ].join(', ')))
                        .map(el => clean(el.innerText))
                        .filter(Boolean)
                        .filter(text =>
                            text.length > 20 &&
                            !/^(home|my network|jobs|messaging|notifications|search|profile|try premium)/i.test(text)
                        );

                    const allTexts = Array.from(postEl.querySelectorAll('span, div, button, a'))
                        .map(el => clean(el.innerText))
                        .filter(Boolean);
                    const socialItems = Array.from(postEl.querySelectorAll('button, a, span, div, li'))
                        .map(el => ({
                            text: clean(el.innerText),
                            aria: el.getAttribute('aria-label'),
                            title: el.getAttribute('title'),
                            className: el.className?.toString() || '',
                            role: el.getAttribute('role') || '',
                        }))
                        .filter(item => item.text || item.aria || item.title);

                    const metaContent = clean(
                        document.querySelector('meta[property="og:description"], meta[name="description"]')?.getAttribute('content')
                    );

                    const rawPageText = postEl.innerText || '';
                    const pageText = clean(rawPageText) || '';
                    const textLineContent = rawPageText
                        .split(/\n+/)
                        .map(line => clean(line))
                        .filter(Boolean)
                        .filter(line =>
                            line.length > 20 &&
                            !/^(home|my network|jobs|messaging|notifications|search|profile|try premium)/i.test(line)
                        )
                        .sort((a, b) => {
                            const hashtagDiff = Number(/#/.test(b)) - Number(/#/.test(a));
                            return hashtagDiff || b.length - a.length;
                        })[0] || null;

                    const content = textBlocks
                        .sort((a, b) => {
                            const hashtagDiff = Number(/#/.test(b)) - Number(/#/.test(a));
                            return hashtagDiff || b.length - a.length;
                        })[0] || textLineContent || metaContent || null;

                    const authorLink = Array.from(postEl.querySelectorAll([
                        '.update-components-actor__meta-link',
                        '.feed-shared-actor__container-link',
                        '.update-components-actor__title a',
                        'a[href*="/in/"]',
                        'a[href*="/company/"]',
                        'a[href*="/school/"]',
                    ].join(', ')))
                        .map(a => {
                            const rawText = a.innerText || '';
                            const firstLine = rawText
                                .split('\n')
                                .map(line => clean(line))
                                .find(Boolean);
                            const href = absoluteUrl(a.getAttribute('href'));
                            const closestClass = a.closest('[class]')?.className?.toString() || '';
                            const text = clean(firstLine || rawText)
                                ?.replace(/\s+View .* profile$/i, '')
                                ?.replace(/\s+Follow$/i, '');

                            let score = 0;
                            if (/actor|feed-shared|update-components/i.test(closestClass)) score += 20;
                            if (href?.includes('/in/') || href?.includes('/company/') || href?.includes('/school/')) score += 10;
                            if (text && text.length <= 80) score += 8;
                            if (href && viewerProfileUrls.has(href)) score -= 100;
                            if (isChromeElement(a)) score -= 100;

                            return { text, href, score };
                        })
                        .filter(item => item.href && item.text && item.score > -50)
                        .sort((a, b) => b.score - a.score)[0];

                    const urn = extractActivityUrn(postEl);
                    const urnPostUrl = urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;
                    const postUrl = Array.from(postEl.querySelectorAll('a[href*="/feed/update/"], a[href*="/posts/"], a[href*="urn:li:activity"]'))
                        .map(a => absoluteUrl(a.getAttribute('href')))
                        .find(url => url && !url.includes('/search/results/content/'));

                    const hasNumber = (value) => /[\d,.]+(?:\s*[KMB])?/i.test(value || '');
                    const socialRegionPattern = /(social|reaction|comment|repost|share|engagement|counts|analytics)/i;
                    const extractSocialNumber = (value, patterns) => {
                        const normalizedValue = normalizeText(value);
                        const labels = patterns
                            .map(pattern => normalizedValue.match(pattern))
                            .filter(Boolean)
                            .map(match => ({
                                index: match.index,
                                end: match.index + match[0].length,
                            }));
                        const numbers = [...normalizedValue.matchAll(/[\d,.]+(?:\s*[KMB])?/gi)];

                        if (!labels.length || !numbers.length) return null;

                        const ranked = numbers
                            .map(match => {
                                const index = match.index;
                                const end = index + match[0].length;
                                const distance = Math.min(...labels.map(label => {
                                    if (end <= label.index) return label.index - end;
                                    if (index >= label.end) return index - label.end;
                                    return 0;
                                }));

                                return {
                                    number: match[0].replace(/\s+/g, ''),
                                    distance,
                                };
                            })
                            .filter(item => item.distance <= 40)
                            .sort((a, b) => a.distance - b.distance);

                        return ranked[0]?.number || null;
                    };

                    const findSocialNumber = (patterns) => {
                        const matches = socialItems
                            .map(item => {
                                const rawValue = `${item.aria || ''} ${item.title || ''} ${item.text || ''}`;
                                const value = normalizeText(rawValue);
                                const patternMatched = patterns.some(pattern => pattern.test(value));
                                const numberMatched = hasNumber(rawValue);

                                if (!patternMatched || !numberMatched) return null;

                                let score = 0;
                                if (item.aria && patterns.some(pattern => pattern.test(normalizeText(item.aria)))) score += 20;
                                if (item.title && patterns.some(pattern => pattern.test(normalizeText(item.title)))) score += 10;
                                if (socialRegionPattern.test(item.className) || /button|link/i.test(item.role)) score += 8;
                                if (/^(like|comment|repost|share|binh luan|chia se)$/i.test(value)) score -= 50;
                                if (value.length > 120) score -= 12;

                                return {
                                    value: rawValue,
                                    number: extractSocialNumber(rawValue, patterns),
                                    score,
                                };
                            })
                            .filter(Boolean)
                            .sort((a, b) => b.score - a.score);

                        return matches[0]?.number || extractNumber(matches[0]?.value);
                    };

                    const likes = findSocialNumber([/(reaction|reactions|like|likes|luot thich|cam xuc)/i]);
                    const comments = findSocialNumber([/(comment|comments|binh luan)/i]);
                    const reposts = findSocialNumber([/(repost|reposts|share|shares|chia se)/i]);

                    const images = Array.from(postEl.querySelectorAll('img'))
                        .map(img => img.src)
                        .filter(isPostImage);

                    const linkedinUrl = postUrl || urnPostUrl || (crawlMode === 'post' ? window.location.href : null);

                    return {
                        query: {
                            searchQuery: input.searchQuery || null,
                            hashtags: input.hashtags || [],
                            filters: input.filters || {},
                        },
                        post: {
                            content,
                            hashtags: extractHashtags(pageText),
                            linkedinUrl,
                            urn,
                        },
                        author: {
                            name: authorLink?.text || null,
                            profileUrl: authorLink?.href || null,
                        },
                        engagement: {
                            likes,
                            comments,
                            reposts,
                        },
                        media: {
                            images: [...new Set(images)],
                        },
                    };
                }).filter(isValidPostResult);

                return dedupePosts(posts).slice(0, targetPosts);
            }, {
                crawlMode,
                targetPosts,
                postSelector,
                input: {
                    searchQuery: searchQuery || null,
                    hashtags: normalizeList(hashtags).map(cleanHashtag),
                    filters: {
                        sortBy,
                        datePosted,
                        fromMember: normalizeList(fromMember),
                        fromCompany: normalizeList(fromCompany),
                        authorIndustry: normalizeList(authorIndustry),
                    },
                },
            });

            if (!posts.length) {
                const pageSummary = await page.evaluate(() => ({
                    title: document.title,
                    url: window.location.href,
                    bodyText: document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 500) || '',
                }));

                log.info(`No posts page summary: ${JSON.stringify(pageSummary)}`);

                await page.screenshot({
                    path: 'no-posts-found.png',
                    fullPage: true,
                });

                throw new Error('No LinkedIn posts found on the page');
            }

            await Dataset.pushData(posts.slice(0, targetPosts));

            log.info(`Saved ${posts.length} post(s)`);
        } catch (error) {
            const message = error.message?.includes('ERR_TOO_MANY_REDIRECTS')
                ? 'LinkedIn returned too many redirects. Refresh your LinkedIn cookie and try pasting the full browser cookie string, not only li_at.'
                : error.message;

            log.error(message);

            await page.screenshot({
                path: 'error.png',
                fullPage: true,
            });

            throw new Error(message);
        }
    },
});

await crawler.run([{ url: startUrl, skipNavigation: true }]);

await Actor.exit();
