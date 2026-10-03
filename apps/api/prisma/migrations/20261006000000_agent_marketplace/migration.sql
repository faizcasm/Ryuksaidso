CREATE TABLE "MarketplaceCreator" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCreator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceAgent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "logoIcon" TEXT NOT NULL DEFAULT 'sparkles',
    "logoColor" TEXT NOT NULL DEFAULT '#7c5cff',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "pricing" TEXT NOT NULL DEFAULT 'FREE',
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "pricePeriod" TEXT NOT NULL DEFAULT 'MONTHLY',
    "pricePerRun" INTEGER NOT NULL DEFAULT 0,
    "avgCostMicros" INTEGER NOT NULL DEFAULT 0,
    "creatorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "latestVersion" INTEGER NOT NULL DEFAULT 1,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "changelog" TEXT NOT NULL DEFAULT '',
    "requiredIntegrations" TEXT[],
    "requiredModels" TEXT[],
    "permissions" TEXT[],
    "forkedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceAgentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "changelog" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceAgentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceInstall" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installedAgentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'INSTALL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceInstall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceCreator_handle_key" ON "MarketplaceCreator"("handle");

CREATE INDEX "MarketplaceCreator_userId_idx" ON "MarketplaceCreator"("userId");

CREATE UNIQUE INDEX "MarketplaceAgent_slug_key" ON "MarketplaceAgent"("slug");

CREATE INDEX "MarketplaceAgent_status_visibility_createdAt_idx" ON "MarketplaceAgent"("status", "visibility", "createdAt");

CREATE INDEX "MarketplaceAgent_organizationId_status_idx" ON "MarketplaceAgent"("organizationId", "status");

CREATE INDEX "MarketplaceAgent_creatorId_idx" ON "MarketplaceAgent"("creatorId");

CREATE INDEX "MarketplaceAgent_category_pricing_idx" ON "MarketplaceAgent"("category", "pricing");

CREATE UNIQUE INDEX "MarketplaceAgentVersion_agentId_version_key" ON "MarketplaceAgentVersion"("agentId", "version");

CREATE INDEX "MarketplaceAgentVersion_agentId_createdAt_idx" ON "MarketplaceAgentVersion"("agentId", "createdAt");

CREATE UNIQUE INDEX "MarketplaceReview_agentId_userId_key" ON "MarketplaceReview"("agentId", "userId");

CREATE INDEX "MarketplaceReview_agentId_createdAt_idx" ON "MarketplaceReview"("agentId", "createdAt");

CREATE INDEX "MarketplaceInstall_organizationId_status_createdAt_idx" ON "MarketplaceInstall"("organizationId", "status", "createdAt");

CREATE INDEX "MarketplaceInstall_agentId_organizationId_idx" ON "MarketplaceInstall"("agentId", "organizationId");

CREATE INDEX "MarketplaceInstall_installedAgentId_idx" ON "MarketplaceInstall"("installedAgentId");

INSERT INTO "MarketplaceCreator" ("id", "userId", "handle", "displayName", "bio", "website", "verified", "createdAt", "updatedAt")
VALUES ('mk_sys_ryuksaidso', NULL, 'ryuksaidso', 'Ryuksaidso', 'Official agents maintained by the Ryuksaidso team and reviewed before every release.', 'https://ryuksaidso.faizcasm.me', true, '2026-10-01 09:00:00', '2026-10-01 09:00:00');

INSERT INTO "MarketplaceAgent" ("id", "slug", "name", "summary", "description", "category", "logoIcon", "logoColor", "visibility", "status", "pricing", "priceAmount", "pricePeriod", "pricePerRun", "avgCostMicros", "creatorId", "organizationId", "currentVersion", "latestVersion", "verified", "featured", "installs", "tries", "ratingAvg", "ratingCount", "config", "changelog", "requiredIntegrations", "requiredModels", "permissions", "createdAt", "updatedAt")
VALUES ('mk_agent_inbox_triage', 'inbox-triage', 'Inbox Triage', 'Reads new email, drafts replies, and opens tickets for anything that needs a human.', 'Inbox Triage watches the connected Gmail or Outlook inbox, summarises every new message, and proposes the next action: a drafted reply, a filed ticket, or nothing at all. It never sends email on its own — replies wait for your approval when the workspace policy requires one. Pair it with the ticket tools so anything unresolved lands in your queue with full context.', 'support', 'mail', '#f59e0b', 'PUBLIC', 'PUBLISHED', 'FREE', 0, 'MONTHLY', 0, 42000, 'mk_sys_ryuksaidso', 'org_official', 1, 1, true, true, 0, 0, 0, 0, '{"instructions":"You are an inbox triage assistant. For each new message produce a two line summary, classify it as reply, ticket, or ignore, and draft the reply text when a reply is the right next step. Never send email without an explicit confirmation. Open a ticket with add_ticket_message when a request needs a human owner.","systemPrompt":"Be concise. Use short bullet points. Never invent email content that is not in the retrieved messages.","tools":["search_email","read_email","reply_email","get_ticket","add_ticket_message"]}', 'First public release with reply drafting and ticket hand-off.', ARRAY['gmail','outlook']::text[], ARRAY['chat']::text[], ARRAY['email:read','email:send','ticket:write']::text[], '2026-10-01 09:00:00', '2026-10-01 09:00:00');

INSERT INTO "MarketplaceAgent" ("id", "slug", "name", "summary", "description", "category", "logoIcon", "logoColor", "visibility", "status", "pricing", "priceAmount", "pricePeriod", "pricePerRun", "avgCostMicros", "creatorId", "organizationId", "currentVersion", "latestVersion", "verified", "featured", "installs", "tries", "ratingAvg", "ratingCount", "config", "changelog", "requiredIntegrations", "requiredModels", "permissions", "createdAt", "updatedAt")
VALUES ('mk_agent_meeting_brief', 'meeting-brief', 'Meeting Brief', 'Turns todays calendar into a one page brief with context from your workspace docs.', 'Meeting Brief reads the connected calendar, finds the meetings ahead, and prepares a one page brief for each one: attendees, agenda, linked documents, and the open tickets that relate to the topic. It pulls context from Google Drive, Notion, and workspace knowledge so you walk in already caught up.', 'productivity', 'calendar', '#7c5cff', 'PUBLIC', 'PUBLISHED', 'FREE', 0, 'MONTHLY', 0, 68000, 'mk_sys_ryuksaidso', 'org_official', 1, 1, true, false, 0, 0, 0, 0, '{"instructions":"You are a meeting preparation assistant. Given a calendar window, list every upcoming meeting and write a compact brief for each one covering attendees, purpose, linked documents, and relevant open tickets. Keep each brief under 150 words. Ask before creating or changing any calendar event.","systemPrompt":"Prefer short sections with bold labels. Cite document titles exactly as retrieved.","tools":["calendar_list_events","search_knowledge","search_email","drive_search"]}', 'First public release with Drive and workspace knowledge context.', ARRAY['google_drive','notion']::text[], ARRAY['chat']::text[], ARRAY['calendar:read','documents:read']::text[], '2026-10-01 09:05:00', '2026-10-01 09:05:00');

INSERT INTO "MarketplaceAgent" ("id", "slug", "name", "summary", "description", "category", "logoIcon", "logoColor", "visibility", "status", "pricing", "priceAmount", "pricePeriod", "pricePerRun", "avgCostMicros", "creatorId", "organizationId", "currentVersion", "latestVersion", "verified", "featured", "installs", "tries", "ratingAvg", "ratingCount", "config", "changelog", "requiredIntegrations", "requiredModels", "permissions", "createdAt", "updatedAt")
VALUES ('mk_agent_research_radar', 'research-radar', 'Research Radar', 'Watches the web for topics you care about and delivers a cited weekly digest.', 'Research Radar scans news and web sources for the topics you define, deduplicates overlapping stories, and writes a weekly digest where every claim carries a link back to its source. Use it to track competitors, regulations, or a technology beat without drowning in tabs.', 'research', 'radar', '#10b981', 'PUBLIC', 'PUBLISHED', 'PAID', 49900, 'MONTHLY', 0, 150000, 'mk_sys_ryuksaidso', 'org_official', 1, 1, true, true, 0, 0, 0, 0, '{"instructions":"You are a research assistant. Given a set of topics, search the web and news sources, remove duplicates, and produce a digest where every bullet ends with the source URL. Separate signal from noise and mark anything uncertain as unconfirmed. Never quote a source you did not retrieve in this session.","systemPrompt":"Write like a sharp analyst. Short bullets, no filler, always cite.","tools":["news","fetch_page","search_knowledge","dictionary"]}', 'First public release with cited digests and duplicate collapsing.', ARRAY[]::text[], ARRAY['chat','tools']::text[], ARRAY['web:read']::text[], '2026-10-01 09:10:00', '2026-10-01 09:10:00');

INSERT INTO "MarketplaceAgent" ("id", "slug", "name", "summary", "description", "category", "logoIcon", "logoColor", "visibility", "status", "pricing", "priceAmount", "pricePeriod", "pricePerRun", "avgCostMicros", "creatorId", "organizationId", "currentVersion", "latestVersion", "verified", "featured", "installs", "tries", "ratingAvg", "ratingCount", "config", "changelog", "requiredIntegrations", "requiredModels", "permissions", "createdAt", "updatedAt")
VALUES ('mk_agent_bug_triage', 'bug-triage', 'Bug Triage', 'Labels incoming issues, links duplicates, and routes them to the right board.', 'Bug Triage reads incoming issues from GitHub, Jira, or Linear, applies consistent labels and severity, links duplicates, and routes each one to the right board with a suggested owner. Usage based pricing keeps it cheap for repositories with bursty traffic.', 'development', 'bug', '#fb7185', 'PUBLIC', 'PUBLISHED', 'USAGE', 0, 'MONTHLY', 250, 95000, 'mk_sys_ryuksaidso', 'org_official', 1, 1, true, false, 0, 0, 0, 0, '{"instructions":"You are a bug triage assistant. Read the issue, produce a severity from low to critical, apply the matching labels, search for duplicates, and recommend the board and owner that should take it. Output a short triage card with severity, labels, duplicates, and routing.","systemPrompt":"Be decisive. Never invent issue ids. If the tracker is not connected, say so.","tools":["github_search_repositories","jira_search_issues","linear_search_issues"]}', 'First public release with severity scoring and duplicate linking.', ARRAY['github','jira','linear']::text[], ARRAY['chat','tools']::text[], ARRAY['issues:read','issues:write']::text[], '2026-10-01 09:15:00', '2026-10-01 09:15:00');

INSERT INTO "MarketplaceAgent" ("id", "slug", "name", "summary", "description", "category", "logoIcon", "logoColor", "visibility", "status", "pricing", "priceAmount", "pricePeriod", "pricePerRun", "avgCostMicros", "creatorId", "organizationId", "currentVersion", "latestVersion", "verified", "featured", "installs", "tries", "ratingAvg", "ratingCount", "config", "changelog", "requiredIntegrations", "requiredModels", "permissions", "createdAt", "updatedAt")
VALUES ('mk_agent_lead_followup', 'lead-followup', 'Lead Follow-up', 'Drafts follow up email for every new CRM contact while the conversation is warm.', 'Lead Follow-up watches the HubSpot contact list, reads the last conversation, and drafts a personalised follow up email while the thread is still warm. Drafts wait for your review, and sent replies are logged back against the contact so the pipeline stays clean.', 'sales', 'users', '#fbbf24', 'PUBLIC', 'PUBLISHED', 'FREE', 0, 'MONTHLY', 0, 74000, 'mk_sys_ryuksaidso', 'org_official', 1, 1, false, false, 0, 0, 0, 0, '{"instructions":"You are a sales follow up assistant. For each new or recently active contact, read the last exchange and draft a follow up email that references the specific conversation. Keep it under 120 words. Never send without confirmation and never promise pricing or dates that were not discussed.","systemPrompt":"Warm, direct, human. No corporate filler.","tools":["hubspot_search_contacts","search_email","gmail_send"]}', 'First public release with HubSpot context and review before send.', ARRAY['hubspot','gmail']::text[], ARRAY['chat']::text[], ARRAY['crm:read','email:send']::text[], '2026-10-01 09:20:00', '2026-10-01 09:20:00');

INSERT INTO "MarketplaceAgent" ("id", "slug", "name", "summary", "description", "category", "logoIcon", "logoColor", "visibility", "status", "pricing", "priceAmount", "pricePeriod", "pricePerRun", "avgCostMicros", "creatorId", "organizationId", "currentVersion", "latestVersion", "verified", "featured", "installs", "tries", "ratingAvg", "ratingCount", "config", "changelog", "requiredIntegrations", "requiredModels", "permissions", "createdAt", "updatedAt")
VALUES ('mk_agent_social_drafter', 'social-drafter', 'Social Drafter', 'Turns a rough idea into a week of on brand post drafts with source links.', 'Social Drafter takes one rough idea and expands it into a week of post drafts in your voice, each with the source material it came from. It keeps a consistent tone across the set and flags claims that still need a citation before you publish.', 'marketing', 'megaphone', '#38bdf8', 'PUBLIC', 'PUBLISHED', 'FREE', 0, 'MONTHLY', 0, 38000, 'mk_sys_ryuksaidso', 'org_official', 1, 1, false, false, 0, 0, 0, 0, '{"instructions":"You are a social content assistant. Take the idea you are given and draft a week of posts, each under 250 words, in a consistent voice. Include the source or document each post draws from and flag any claim that needs a citation before publishing.","systemPrompt":"Plain language. Concrete beats clever. No hashtag spam.","tools":["search_knowledge","fetch_page","notion_search"]}', 'First public release with source linked drafts.', ARRAY['notion']::text[], ARRAY['chat']::text[], ARRAY['documents:read']::text[], '2026-10-01 09:25:00', '2026-10-01 09:25:00');

INSERT INTO "MarketplaceAgentVersion" ("id", "agentId", "version", "config", "changelog", "createdBy", "createdAt")
VALUES ('mk_ver_inbox_triage_1', 'mk_agent_inbox_triage', 1, '{"instructions":"You are an inbox triage assistant. For each new message produce a two line summary, classify it as reply, ticket, or ignore, and draft the reply text when a reply is the right next step. Never send email without an explicit confirmation. Open a ticket with add_ticket_message when a request needs a human owner.","systemPrompt":"Be concise. Use short bullet points. Never invent email content that is not in the retrieved messages.","tools":["search_email","read_email","reply_email","get_ticket","add_ticket_message"]}', 'First public release with reply drafting and ticket hand-off.', 'mk_sys_ryuksaidso', '2026-10-01 09:00:00');

INSERT INTO "MarketplaceAgentVersion" ("id", "agentId", "version", "config", "changelog", "createdBy", "createdAt")
VALUES ('mk_ver_meeting_brief_1', 'mk_agent_meeting_brief', 1, '{"instructions":"You are a meeting preparation assistant. Given a calendar window, list every upcoming meeting and write a compact brief for each one covering attendees, purpose, linked documents, and relevant open tickets. Keep each brief under 150 words. Ask before creating or changing any calendar event.","systemPrompt":"Prefer short sections with bold labels. Cite document titles exactly as retrieved.","tools":["calendar_list_events","search_knowledge","search_email","drive_search"]}', 'First public release with Drive and workspace knowledge context.', 'mk_sys_ryuksaidso', '2026-10-01 09:05:00');

INSERT INTO "MarketplaceAgentVersion" ("id", "agentId", "version", "config", "changelog", "createdBy", "createdAt")
VALUES ('mk_ver_research_radar_1', 'mk_agent_research_radar', 1, '{"instructions":"You are a research assistant. Given a set of topics, search the web and news sources, remove duplicates, and produce a digest where every bullet ends with the source URL. Separate signal from noise and mark anything uncertain as unconfirmed. Never quote a source you did not retrieve in this session.","systemPrompt":"Write like a sharp analyst. Short bullets, no filler, always cite.","tools":["news","fetch_page","search_knowledge","dictionary"]}', 'First public release with cited digests and duplicate collapsing.', 'mk_sys_ryuksaidso', '2026-10-01 09:10:00');

INSERT INTO "MarketplaceAgentVersion" ("id", "agentId", "version", "config", "changelog", "createdBy", "createdAt")
VALUES ('mk_ver_bug_triage_1', 'mk_agent_bug_triage', 1, '{"instructions":"You are a bug triage assistant. Read the issue, produce a severity from low to critical, apply the matching labels, search for duplicates, and recommend the board and owner that should take it. Output a short triage card with severity, labels, duplicates, and routing.","systemPrompt":"Be decisive. Never invent issue ids. If the tracker is not connected, say so.","tools":["github_search_repositories","jira_search_issues","linear_search_issues"]}', 'First public release with severity scoring and duplicate linking.', 'mk_sys_ryuksaidso', '2026-10-01 09:15:00');

INSERT INTO "MarketplaceAgentVersion" ("id", "agentId", "version", "config", "changelog", "createdBy", "createdAt")
VALUES ('mk_ver_lead_followup_1', 'mk_agent_lead_followup', 1, '{"instructions":"You are a sales follow up assistant. For each new or recently active contact, read the last exchange and draft a follow up email that references the specific conversation. Keep it under 120 words. Never send without confirmation and never promise pricing or dates that were not discussed.","systemPrompt":"Warm, direct, human. No corporate filler.","tools":["hubspot_search_contacts","search_email","gmail_send"]}', 'First public release with HubSpot context and review before send.', 'mk_sys_ryuksaidso', '2026-10-01 09:20:00');

INSERT INTO "MarketplaceAgentVersion" ("id", "agentId", "version", "config", "changelog", "createdBy", "createdAt")
VALUES ('mk_ver_social_drafter_1', 'mk_agent_social_drafter', 1, '{"instructions":"You are a social content assistant. Take the idea you are given and draft a week of posts, each under 250 words, in a consistent voice. Include the source or document each post draws from and flag any claim that needs a citation before publishing.","systemPrompt":"Plain language. Concrete beats clever. No hashtag spam.","tools":["search_knowledge","fetch_page","notion_search"]}', 'First public release with source linked drafts.', 'mk_sys_ryuksaidso', '2026-10-01 09:25:00');
