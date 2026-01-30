# playbooks

Install agent skills, MCPs and docs into your coding agents from any git repository.

Find skills to add at [playbooks.com](https://playbooks.com).

Works with **OpenCode**, **Claude Code**, **Codex**, **Cursor**, plus [many more](#available-agents).

## Quick start

Launch the interactive menu:
```bash
npx playbooks
```

Find skills in the playbooks directory (Enter = fast search, Tab = semantic):
```bash
npx playbooks find skill
```

Install skills directly from a repo:
```bash
npx playbooks add skill anthropics/skills
```

Install a single skill:
```bash
npx playbooks add skill anthropics/skills --skill frontend-design
```
## What are agent skills?

Agent skills are reusable instructions that teach your agent how to do things. It's a universal format that most AI coding tools now support, defined in a `SKILL.md` file with YAML frontmatter containing a `name` and `description`.

Skills let your agents perform specialized tasks like:

- Generating release notes from git history
- Creating PRs following your team's conventions
- Integrating with external tools (Linear, Notion, etc.)

## Usage

Playbooks uses an action/type command structure:
- `npx playbooks add skill <source>`
- `npx playbooks find skill`
- `npx playbooks list skill`
- `npx playbooks manage skill`
- `npx playbooks update skill [skill-names...]`
- `npx playbooks get <url> [out <path>]`

### Fetch a URL as markdown

```bash
# Output markdown to stdout
npx playbooks get https://example.com

# Save markdown to a file
npx playbooks get https://example.com out notes.md

# Output JSON metadata instead of raw markdown
npx playbooks get https://example.com --json
```

### Source formats

The `<source>` argument accepts multiple formats:

- GitHub shorthand
```bash
npx playbooks add skill anthropics/skills
```

- Full GitHub URL
```bash
npx playbooks add skill https://github.com/anthropics/skills
```

- Direct path to a skill in a repo
```bash
npx playbooks add skill https://github.com/anthropics/skills/tree/main/skills/release-notes
```

- GitLab URL
```bash
npx playbooks add skill https://gitlab.com/org/repo
```

- Any git URL
```bash
npx playbooks add skill git@github.com:anthropics/skills.git
```

- Direct SKILL.md URL
```bash
npx playbooks add skill https://docs.example.com/skills/my-skill/SKILL.md
```

- Marketplace.json (path)
```bash
npx playbooks add skill ./path/to/.claude-plugin/marketplace.json
```

- Marketplace.json (URL)
```bash
npx playbooks add skill https://raw.githubusercontent.com/org/repo/main/.claude-plugin/marketplace.json
```

- Marketplace.json (owner/repo path)
```bash
npx playbooks add skill org/repo/.claude-plugin/marketplace.json
```

### Options (add skill)

| Option                    | Description                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-g, --global`            | Install to user directory instead of project                                                                                                       |
| `-a, --agent <agents...>` | <!-- agent-names:start -->Target specific agents (e.g., `claude-code`, `codex`). See [Available Agents](#available-agents)<!-- agent-names:end --> |
| `-s, --skill <skills...>` | Install specific skills by name                                                                                                                    |
| `-l, --list`              | List available skills without installing                                                                                                           |
| `-y, --yes`               | Skip all confirmation prompts                                                                                                                      |
| `-V, --version`           | Show version number                                                                                                                                |
| `-h, --help`              | Show help                                                                                                                                          |

### Examples

- List skills in a repository
```bash
npx playbooks add skill anthropics/skills --list
```

- Install multiple specific skills
```bash
npx playbooks add skill anthropics/skills --skill release-notes --skill incident-summary
```

- Install to specific agents
```bash
npx playbooks add skill anthropics/skills -a claude-code -a opencode
```

- Non-interactive installation (CI/CD friendly)
```bash
npx playbooks add skill anthropics/skills --skill release-notes -g -a claude-code -y
```

- Install all skills from a repo
```bash
npx playbooks add skill anthropics/skills -y -g
```

### Manage installed skills

- List installed skills (interactive)
```bash
npx playbooks list skill
```

- Update installed skills
```bash
npx playbooks update skill
```

- Remove skills (interactive)
```bash
npx playbooks manage skill
```

## Marketplace.json support

Playbooks can ingest a Claude-style `marketplace.json` and pull skills from the plugins it lists.

What it scans:
- The plugin root (if it contains `SKILL.md`)
- Standard folders inside each plugin: `skills/`, `commands/`, `agents/`, `hooks/`
- Any explicit overrides in `marketplace.json` such as `skills`, `commands`, `agents`, `hooks`
- If nothing is found in the standard locations, it falls back to a recursive search

Example `marketplace.json` plugin entry (minimal):

```json
{
  "plugins": [
    {
      "name": "acme",
      "description": "Acme tools",
      "source": "plugins/acme"
    }
  ]
}
```

Example with overrides:

```json
{
  "plugins": [
    {
      "name": "acme",
      "source": "plugins/acme",
      "skills": "skills",
      "commands": "commands"
    }
  ]
}
```

## Available agents

Skills can be installed to any of these supported agents. Use `-g, --global` to install to the global path instead of project-level.

<!-- available-agents:start -->
| Agent | `--agent` | Project Path | Global Path |
|-------|-----------|--------------|-------------|
| Amp | `amp` | `.agents/skills/` | `~/.config/agents/skills/` |
| Antigravity | `antigravity` | `.agent/skills/` | `~/.gemini/antigravity/global_skills/` |
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| Clawdbot | `clawdbot` | `skills/` | `~/.clawdbot/skills/` |
| Cline | `cline` | `.cline/skills/` | `~/.cline/skills/` |
| Codex | `codex` | `.codex/skills/` | `~/.codex/skills/` |
| Command Code | `command-code` | `.commandcode/skills/` | `~/.commandcode/skills/` |
| Continue | `continue` | `.continue/skills/` | `~/.continue/skills/` |
| Crush | `crush` | `.crush/skills/` | `~/.config/crush/skills/` |
| Cursor | `cursor` | `.cursor/skills/` | `~/.cursor/skills/` |
| Droid | `droid` | `.factory/skills/` | `~/.factory/skills/` |
| Gemini CLI | `gemini-cli` | `.gemini/skills/` | `~/.gemini/skills/` |
| GitHub Copilot | `github-copilot` | `.github/skills/` | `~/.copilot/skills/` |
| Goose | `goose` | `.goose/skills/` | `~/.config/goose/skills/` |
| Kilo Code | `kilo` | `.kilocode/skills/` | `~/.kilocode/skills/` |
| Kiro CLI | `kiro-cli` | `.kiro/skills/` | `~/.kiro/skills/` |
| MCPJam | `mcpjam` | `.mcpjam/skills/` | `~/.mcpjam/skills/` |
| OpenCode | `opencode` | `.opencode/skills/` | `~/.config/opencode/skills/` |
| OpenHands | `openhands` | `.openhands/skills/` | `~/.openhands/skills/` |
| Pi | `pi` | `.pi/skills/` | `~/.pi/agent/skills/` |
| Qoder | `qoder` | `.qoder/skills/` | `~/.qoder/skills/` |
| Qwen Code | `qwen-code` | `.qwen/skills/` | `~/.qwen/skills/` |
| Roo Code | `roo` | `.roo/skills/` | `~/.roo/skills/` |
| Trae | `trae` | `.trae/skills/` | `~/.trae/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| Zencoder | `zencoder` | `.zencoder/skills/` | `~/.zencoder/skills/` |
| Neovate | `neovate` | `.neovate/skills/` | `~/.neovate/skills/` |
<!-- available-agents:end -->

> [!NOTE]
> **Kiro CLI users:** After installing skills, you need to manually add them to your custom agent's `resources` in `.kiro/agents/<agent>.json`:
>
> ```json
> {
>   "resources": ["skill://.kiro/skills/**/SKILL.md"]
> }
> ```

## Agent detection

The CLI automatically detects which coding agents you have installed by checking for their configuration directories. If none are detected, you'll be prompted to select which agents to install to.

## Creating skills

Skills are directories containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does and when to use it
---

# My Skill

Instructions for the agent to follow when this skill is activated.

## When to Use

Describe the scenarios where this skill should be used.

## Steps

1. First, do this
2. Then, do that
```

### Required fields

- `name`: Unique identifier (lowercase, hyphens allowed)
- `description`: Brief explanation of what the skill does

### Skill discovery

The CLI searches for skills in these locations within a repository:

<!-- skill-discovery:start -->
- Root directory (if it contains `SKILL.md`)
- `skills/`
- `skills/.curated/`
- `skills/.experimental/`
- `skills/.system/`
- `.agents/skills/`
- `.agent/skills/`
- `.claude/skills/`
- `./skills/`
- `.cline/skills/`
- `.codex/skills/`
- `.commandcode/skills/`
- `.continue/skills/`
- `.crush/skills/`
- `.cursor/skills/`
- `.factory/skills/`
- `.gemini/skills/`
- `.github/skills/`
- `.goose/skills/`
- `.kilocode/skills/`
- `.kiro/skills/`
- `.mcpjam/skills/`
- `.opencode/skills/`
- `.openhands/skills/`
- `.pi/skills/`
- `.qoder/skills/`
- `.qwen/skills/`
- `.roo/skills/`
- `.trae/skills/`
- `.windsurf/skills/`
- `.zencoder/skills/`
- `.neovate/skills/`
<!-- skill-discovery:end -->

If no skills are found in standard locations, a recursive search is performed.

## Compatibility

## Linting

This repo uses Biome plus a max‑file‑length guard.

```bash
npm run lint      # Biome check + max 400 lines per file
npm run lint:fix  # Biome auto-fix
```

If you see a warning about Biome’s install script being skipped, run:

```bash
npm approve-builds
```

Skills are generally compatible across agents since they follow a shared [Agent Skills specification](https://agentskills.io). However, some features may be agent-specific:

| Feature         | OpenCode | OpenHands | Claude Code | Cline | Codex | Command Code | Kiro CLI | Cursor | Antigravity | Roo Code | Github Copilot | Amp | Clawdbot | Neovate | Pi  | Qoder | Zencoder |
| --------------- | -------- | --------- | ----------- | ----- | ----- | ------------ | -------- | ------ | ----------- | -------- | -------------- | --- | -------- | ------- | --- | ----- | -------- |
| Basic skills    | Yes      | Yes       | Yes         | Yes   | Yes   | Yes          | Yes      | Yes    | Yes         | Yes      | Yes            | Yes | Yes      | Yes     | Yes | Yes   | Yes      |
| `allowed-tools` | Yes      | Yes       | Yes         | Yes   | Yes   | Yes          | No       | Yes    | Yes         | Yes      | Yes            | Yes | Yes      | Yes     | Yes | Yes   | No       |
| `context: fork` | No       | No        | Yes         | No    | No    | No           | No       | No     | No          | No       | No             | No  | No       | No      | No  | No    | No       |
| Hooks           | No       | No        | Yes         | Yes   | No    | No           | No       | No     | No          | No       | No             | No  | No       | No      | No  | No    | No       |

## Troubleshooting

### "No skills found"

Ensure the repository contains valid `SKILL.md` files with both `name` and `description` in the frontmatter.

### Skill not loading in agent

- Verify the skill was installed to the correct path
- Check the agent's documentation for skill loading requirements
- Ensure the `SKILL.md` frontmatter is valid YAML

### Permission errors

Ensure you have write access to the target directory.

## Telemetry

This CLI collects anonymous usage data to help improve the tool. No personal information is collected.

To disable telemetry, set any of these environment variables:

```bash
DISABLE_TELEMETRY=1 npx playbooks add skill anthropics/skills
# or
DO_NOT_TRACK=1 npx playbooks add skill anthropics/skills
# or
PLAYBOOKS_DISABLE_TELEMETRY=1 npx playbooks add skill anthropics/skills
```

Telemetry is also automatically disabled in CI environments.

## Related links

- [Agent Skills Specification](https://agentskills.io)
- [Amp Skills Documentation](https://ampcode.com/manual#agent-skills)
- [Antigravity Skills Documentation](https://antigravity.google/docs/skills)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Clawdbot Skills Documentation](https://docs.clawd.bot/tools/skills)
- [Cline Skills Documentation](https://docs.cline.bot/features/skills)
- [Codex Skills Documentation](https://developers.openai.com/codex/skills)
- [Command Code Skills Documentation](https://commandcode.ai/docs/skills)
- [Crush Skills Documentation](https://github.com/charmbracelet/crush?tab=readme-ov-file#agent-skills)
- [Cursor Skills Documentation](https://cursor.com/docs/context/skills)
- [Gemini CLI Skills Documentation](https://geminicli.com/docs/cli/skills/)
- [GitHub Copilot Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [Kiro CLI Skills Documentation](https://kiro.dev/docs/cli/custom-agents/configuration-reference/#skill-resources)
- [OpenCode Skills Documentation](https://opencode.ai/docs/skills)
- [Qwen Code Skills Documentation](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/)
- [OpenHands Skills Documentation](https://docs.openhands.ai/modules/usage/how-to/using-skills)
- [Pi Skills Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
- [Qoder Skills Documentation](https://docs.qoder.com/cli/Skills)
- [Roo Code Skills Documentation](https://docs.roocode.com/features/skills)
- [Trae Skills Documentation](https://docs.trae.ai/ide/skills)
- [Vercel Agent Skills Repository](https://github.com/vercel-labs/agent-skills)

## License

MIT
