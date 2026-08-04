# Portable agent documentation design

## Goal

Make Sentinel understandable and usable by any capable coding or CLI agent, without requiring a vendor-specific skill directory or extension. The package must teach an agent how Sentinel models work, how to inspect activity and planning, and how to mutate data safely through API v1.

## Documentation surfaces

The root `SKILL.md` remains the compact, vendor-neutral operating guide. It uses standard Markdown and YAML front matter so tools that recognize skills can load it, while agents that do not can receive the file directly as context. It provides the essential setup, domain vocabulary, intent-to-workflow mapping, response conventions, safety rules, and a link to the fuller reference.

Public `/docs` becomes the full human and agent reference. It adds a Sentinel mental model, record lifecycles, identity and ownership rules, canonical read-before-write workflows, request/response field conventions, error recovery, and portable installation instructions. Endpoint tables and curl snippets remain the source of truth for API calls.

## Domain model and workflows

The documentation defines the durable relationships:

- Projects organize work and may form a three-level hierarchy.
- Tasks are either in the backlog (`period_start: null`) or scheduled for a local calendar day; completion is recorded by `completed_at`.
- Notes are scoped to a day, week, or long-term context.
- Planned sessions group selected scheduled tasks into an estimated focus block. Starting one creates the live session and consumes the plan.
- Sessions record actual work; an active session has no `ended_at`.

Agents are instructed to fetch authoritative state before proposing changes, treat dates as local calendar keys rather than UTC slices, and rely on mutation responses rather than inventing data. They use read-only calls for review and ask before destructive operations such as deletion or token revocation.

## Portable installation

The docs include a universal setup process: download or copy the raw `SKILL.md` into the agent project or its configured instruction location, provide `SENTINEL_BASE_URL` and `SENTINEL_API_TOKEN` as environment variables or an approved secret store, and ensure the agent reads the skill before acting. Claude Code, Codex, Cursor, and custom agents all work because the source file is ordinary Markdown rather than a proprietary package.

The documentation never instructs users to commit tokens or paste them into a skill file. It includes the raw GitHub URL for the canonical skill and notes that agents without automatic skill discovery should attach the file directly to their system/project instructions.

## Verification

Add a focused documentation test only if the repository has an appropriate rendered-page test seam; otherwise verify the public page in the running Next.js application, typecheck, lint, and production build. Confirm that the raw skill is accessible from the default branch after the documentation commit is pushed.
