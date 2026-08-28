# Claude Skills

Skills that teach Claude when and how to use the **Firecrawl** and **Tavily** native
connectors for web access. They exist because built-in web browsing on claude.ai can be
intermittently flaky; with these connectors attached and these skills installed, Claude
routes web work through the connectors' own infrastructure and falls back to them
automatically when built-in browsing fails, instead of giving up.

| Skill | Covers |
|---|---|
| `tavily/` | Web search, reading/extracting specific URLs, crawling & mapping sites, deep research reports |
| `firecrawl/` | Web + news search, developer/coding search (docs, issues, PRs), academic paper search & citation graph |

Each skill documents the connector's real tool parameters and response shapes (verified
against the live connectors), a routing table for choosing the right tool, and a
failure-recovery ladder.

## Installing for a claude.ai chat (e.g. a persona/project on the web app)

The corresponding connector must be enabled on claude.ai (Settings → Connectors), then
upload each skill under **Settings → Capabilities → Skills**. A skill upload is a zip
containing the skill folder (so `SKILL.md` sits at `tavily/SKILL.md` inside the zip):

```bash
cd .claude/skills
zip -r tavily.skill tavily/
zip -r firecrawl.skill firecrawl/
```

(A packaged `.skill` file is exactly this zip and uploads the same way.)

## In Claude Code

Nothing to install — skills in `.claude/skills/` load automatically for sessions in
this repository. They activate only when the matching connector's tools are available.
