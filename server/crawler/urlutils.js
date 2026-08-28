const SCHEMES = new Set(['http:', 'https:']);

/** Normalizuje URL: lowercase host, odstran hash, koncov lomtko (krom koene), vchoz porty. */
export function normalizeUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let u;
    try {
        u = new URL(raw.trim());
    } catch {
        return null;
    }
    if (!SCHEMES.has(u.protocol)) return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if (u.port === '80' && u.protocol === 'http:') u.port = '';
    if (u.port === '443' && u.protocol === 'https:') u.port = '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    if (u.username || u.password) return null;
    return u.toString();
}

/** Vrt domnu (ppadn subdomnu) bez www. */
export function getDomain(urlRaw) {
    const u = new URL(normalizeUrl(urlRaw) || urlRaw);
    let host = u.host.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
}

/** Je odkaz intern vi domn? */
export function isInternal(urlTarget, domainFrom) {
    const u1 = new URL(urlTarget);
    let host1 = u1.host.toLowerCase();
    if (host1.startsWith('www.')) host1 = host1.slice(4);
    return host1 === domainFrom;
}

/** Absolutizuje odkaz vi strnce. */
export function toAbsolute(href, baseUrlString) {
    try {
        return normalizeUrl(new URL(href, baseUrlString).toString());
    } catch {
        return null;
    }
}
