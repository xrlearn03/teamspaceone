CREATE INDEX "search_documents_content_fts_idx"
ON "search_documents"
USING GIN (to_tsvector('english', "content"));
