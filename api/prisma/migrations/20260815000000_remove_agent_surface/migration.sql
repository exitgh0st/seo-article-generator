-- Removes the in-app agent's storage.
--
-- ChatSession/ChatMessage held the agent's conversation transcripts; FetchedPage
-- was the server-side page cache its research phase wrote to. Research now runs
-- in Claude Code, which writes fetched page text to a sidecar directory that the
-- importer loads into ResearchSource.rawContent.
--
-- ResearchSource is deliberately untouched: it carries the retained page text the
-- grounding gate checks CVE identifiers and indicators of compromise against, and
-- that data is the substrate the whole accuracy story rests on.

-- ChatMessage first — it holds the foreign key into ChatSession.
DROP TABLE IF EXISTS "ChatMessage";
DROP TABLE IF EXISTS "ChatSession";
DROP TABLE IF EXISTS "FetchedPage";
