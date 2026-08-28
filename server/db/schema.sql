-- Domény
CREATE TABLE IF NOT EXISTS domains (
    domain TEXT PRIMARY KEY,
    robots_txt TEXT,
    robots_txt_date INTEGER,
    sitemap_urls TEXT,          -- JSON array
    crawl_allowed INTEGER DEFAULT 1,  -- 0/1
    crawl_delay INTEGER DEFAULT 2,     -- sekundy
    last_crawled INTEGER,
    status TEXT DEFAULT 'active',            -- active, blocked, error
    created_at INTEGER DEFAULT (unixepoch())
);

-- Stránky
CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    domain TEXT NOT NULL,
    title TEXT,
    description TEXT,
    content_text TEXT,          -- vyextrahovaný čistý text
    content_hash TEXT,          -- SHA256 pro detekci změn
    og_data TEXT,               -- JSON
    schema_org TEXT,            -- JSON
    headings TEXT,              -- JSON [h1, h2, h3...]
    links_internal TEXT,        -- JSON array
    links_external TEXT,        -- JSON array
    word_count INTEGER,
    crawl_depth INTEGER DEFAULT 0,
    crawl_status TEXT DEFAULT 'queued',  -- queued, crawling, indexed, error
    priority REAL DEFAULT 0.5,  -- 0.1 - 1.0
    last_modified INTEGER,     -- z HTTP headeru
    last_crawled INTEGER,
    next_crawl INTEGER,         -- naplánováno na
    created_at INTEGER DEFAULT (unixepoch())
);

-- Fulltext index (external content table)
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    title,
    content_text,
    content='pages',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

-- Fronta
CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    source TEXT,                -- user_input, sitemap, discovery, recrawl
    priority REAL DEFAULT 0.5,
    status TEXT DEFAULT 'pending', -- pending, processing, done, failed
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    processed_at INTEGER
);

-- Graf vztahů (cache)
CREATE TABLE IF NOT EXISTS links_graph (
    source_url TEXT,
    target_url TEXT,
    link_type TEXT,             -- internal, external
    anchor_text TEXT,
    weight REAL DEFAULT 1.0,
    created_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (source_url, target_url)
);

-- Trigger: automatická aktualizace FTS
CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
    INSERT INTO pages_fts(rowid, title, content_text)
    VALUES (new.id, new.title, new.content_text);
END;

CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content_text)
    VALUES ('delete', old.id, old.title, old.content_text);
END;

CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content_text)
    VALUES ('delete', old.id, old.title, old.content_text);
    INSERT INTO pages_fts(rowid, title, content_text)
    VALUES (new.id, new.title, new.content_text);
END;

CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(crawl_status);
CREATE INDEX IF NOT EXISTS idx_pages_next_crawl ON pages(next_crawl);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_graph_target ON links_graph(target_url);

-- Log zablokovaných pokusů (etika)
CREATE TABLE IF NOT EXISTS blocked_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT,
    url TEXT,
    rule TEXT,
    created_at INTEGER DEFAULT (unixepoch())
);