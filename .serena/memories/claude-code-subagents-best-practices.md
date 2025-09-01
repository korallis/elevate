# Claude Code Sub-Agents Best Practices

## Key Architecture Principles

### 1. Sub-Agent Design Philosophy

- **Single Responsibility**: Each sub-agent should have ONE clear, focused task
- **Tool Minimization**: Grant only the tools absolutely necessary for the task
- **Isolation**: Sub-agents operate with their own context window and system prompt
- **Autonomy**: Give sub-agents freedom to determine best approach within constraints

### 2. Important Limitations

**CRITICAL**: Sub-agents spawned via the Task tool CANNOT access MCP tools. This is a system architecture limitation that cannot be fixed at code level.

### Workaround Strategy:

1. Main agent performs MCP operations (Perplexity searches, VisionCraft queries, Serena operations)
2. Pass results to sub-agents in their prompts
3. Sub-agents use built-in tools only (Read, Write, Edit, Bash, etc.)

## Recommended Sub-Agent Types

### Core Sub-Agents for Elev8 Platform:

1. **design-system-auditor** (Read-only)
   - Analyzes UI for consistency issues
   - Reports on component standardization needs
   - Tools: Read, Playwright (for visual testing)

2. **component-builder** (Edit-capable)
   - Creates reusable React components
   - Implements design system patterns
   - Tools: Write, Edit, Read, limited to components/ directory

3. **style-optimizer** (Edit-capable)
   - Optimizes CSS/Tailwind classes
   - Ensures consistent styling patterns
   - Tools: Edit, Read, limited to styles and component files

4. **typescript-guardian** (Read-only)
   - Identifies type violations
   - Suggests type improvements
   - Tools: Read, Bash (for typecheck)

5. **test-writer** (Edit-capable)
   - Writes unit and integration tests
   - Tools: Write, Edit, limited to test files

6. **performance-analyzer** (Read-only)
   - Analyzes bundle sizes
   - Identifies performance bottlenecks
   - Tools: Read, Bash (for build analysis)

## Implementation Patterns

### Sequential Workflow

```
1. Main agent uses MCP tools for research
2. design-system-auditor identifies issues
3. component-builder creates solutions
4. style-optimizer ensures consistency
5. typescript-guardian validates types
6. test-writer adds coverage
```

### Parallel Validation

```
- Run multiple sub-agents concurrently for validation
- typescript-guardian + performance-analyzer + test-writer
- Aggregate results before proceeding
```

## Best Practices for Task Tool Usage

1. **Detailed Prompts**: Include ALL context the sub-agent needs
2. **Clear Success Criteria**: Define exactly what constitutes completion
3. **Tool Restrictions**: Explicitly list allowed tools
4. **Directory Limits**: Restrict file access to relevant directories
5. **Output Format**: Specify expected return format

## Example Task Tool Invocation

```typescript
{
  subagent_type: "general-purpose",
  description: "Design System Audit",
  prompt: `
    You are a UI/UX specialist. Analyze [specific files] for:
    - Button consistency
    - Spacing patterns
    - Color usage

    Use only Read and Playwright tools.
    Return a JSON report with findings.

    Context from MCP research: [include results here]
  `
}
```

## Version Control Integration

- Store sub-agent configurations in `.claude/agents/` (project-level)
- Track changes through Git
- Evolve sub-agents through pull requests
- Document sub-agent capabilities in README

## Monitoring and Improvement

1. Track sub-agent performance metrics
2. Identify repetitive tasks for new sub-agents
3. Refine prompts based on output quality
4. Consolidate overlapping sub-agents
5. Remove unused sub-agents regularly
