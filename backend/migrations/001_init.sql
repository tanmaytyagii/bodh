-- Core schema: corpus records, search indexes, embeddings, feedback.
--
-- Corpus records are stored as JSONB documents (the processed corpus written by
-- the ingestion pipeline is the source of truth) alongside the columns needed
-- for filtering and search.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS sources (
    id          text PRIMARY KEY,
    sort_order  integer NOT NULL DEFAULT 0,
    data        jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS editions (
    id          text PRIMARY KEY,
    source_id   text NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
    data        jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS passages (
    id                 text PRIMARY KEY,
    source_id          text NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
    kind               text NOT NULL,
    division           text,
    position           integer NOT NULL,
    speaker            text,
    provenance_status  text NOT NULL,
    data               jsonb NOT NULL,
    -- English search text (ASCII-folded): the translation itself, and
    -- lower-weighted notes, chapter title and editorial concept vocabulary.
    search_primary     text NOT NULL DEFAULT '',
    search_secondary   text NOT NULL DEFAULT '',
    search_tsv         tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', search_primary), 'A') ||
        setweight(to_tsvector('english', search_secondary), 'B')
    ) STORED,
    -- Loose romanization of the Sanskrit for fuzzy matching of typed verses.
    roman_key          text NOT NULL DEFAULT '',
    content_hash       text NOT NULL,
    updated_at         timestamptz NOT NULL DEFAULT now(),
    -- Deferrable so a reload can renumber passages inside one transaction.
    CONSTRAINT passages_source_position_key UNIQUE (source_id, position)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS passages_search_tsv_idx ON passages USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS passages_roman_key_trgm_idx ON passages USING gin (roman_key gin_trgm_ops);
CREATE INDEX IF NOT EXISTS passages_division_idx ON passages (source_id, division, position);

-- One row per passage per embedding model, so models can be switched or
-- compared without dropping data. `text_hash` detects when the embedded text
-- changed and the vector must be recomputed. Exact (sequential) search is fast
-- at this corpus size; add a per-model HNSW expression index when it grows, e.g.
--   CREATE INDEX ON passage_embeddings
--     USING hnsw ((embedding::vector(384)) vector_cosine_ops)
--     WHERE model = 'intfloat/multilingual-e5-small';
CREATE TABLE IF NOT EXISTS passage_embeddings (
    passage_id  text NOT NULL REFERENCES passages (id) ON DELETE CASCADE,
    model       text NOT NULL,
    text_hash   text NOT NULL,
    embedding   vector NOT NULL,
    PRIMARY KEY (passage_id, model)
);

CREATE TABLE IF NOT EXISTS concepts (
    id    text PRIMARY KEY,
    data  jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS concept_passages (
    concept_id  text NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
    passage_id  text NOT NULL REFERENCES passages (id) ON DELETE CASCADE,
    rank        integer NOT NULL,
    PRIMARY KEY (concept_id, passage_id)
);

CREATE TABLE IF NOT EXISTS concept_embeddings (
    concept_id  text NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
    model       text NOT NULL,
    text_hash   text NOT NULL,
    embedding   vector NOT NULL,
    PRIMARY KEY (concept_id, model)
);

CREATE TABLE IF NOT EXISTS stories (
    id         text PRIMARY KEY,
    source_id  text NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
    data       jsonb NOT NULL
);

-- User reports about citations, passages, interpretations or advice. The
-- user's question is stored only if they explicitly chose to include it.
CREATE TABLE IF NOT EXISTS feedback (
    id          bigserial PRIMARY KEY,
    created_at  timestamptz NOT NULL DEFAULT now(),
    kind        text NOT NULL CHECK (kind IN (
                    'incorrect_citation', 'irrelevant_passage', 'inaccurate_interpretation',
                    'unhelpful_advice', 'safety_concern', 'helpful', 'other')),
    passage_id  text,
    answer_id   text,
    comment     text CHECK (char_length(comment) <= 2000),
    context     jsonb,
    status      text NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
