// (no formal task ID)
// Re-crawl scheduler: podle priority planuje dalsi navstevu.
export function scheduleNextCrawl(page) {
    const now = Math.floor(Date.now() / 1000);
    let interval;

    if (page.priority >= 0.9) {
        interval = 24 * 3600;                 // 1 den
    } else if (page.priority >= 0.7) {
        interval = 3 * 24 * 3600;          // 3 dny
    } else if (page.priority >= 0.5) {
        interval = 7 * 24 * 3600;          // 1 tyden
    } else if (page.priority >= 0.3) {
        interval = 14 * 24 * 3600;         // 2 tydny
    } else {
        interval = 30 * 24 * 3600;          // 1 mesic
    }

    // Po chybe zkus drive (az 3x)
    if (page.crawl_status === 'error' && (page.retry_count || 0) < 3) {
        interval = Math.min(interval, 24 * 3600);
    }

    return now + interval;
}
