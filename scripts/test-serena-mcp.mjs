// Lightweight MCP handshake tester for a stdio server command.
// Usage:
//   SERENA_MCP_CMD="serena --stdio" pnpm mcp:test:serena
//   pnpm mcp:test:serena --cmd="serena --stdio"

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--cmd=')) out.cmd = a.slice('--cmd='.length);
  }
  return out;
}

async function main() {
  const { cmd: cmdArg } = parseArgs(process.argv);
  const cmdStr = cmdArg || process.env.SERENA_MCP_CMD || 'serena';
  const parts = cmdStr.split(/\s+/).filter(Boolean);
  const command = parts[0];
  const args = parts.slice(1);

  if (!command) {
    console.error(
      '[mcp:test] No command provided. Set SERENA_MCP_CMD or pass --cmd="<command> [args]"',
    );
    process.exit(2);
  }

  console.log(`[mcp:test] Spawning: ${command} ${args.join(' ')}`);

  const client = new Client({ name: 'elev8-mcp-tester', version: '0.1.0' });
  const transport = new StdioClientTransport({ command, args, env: process.env });

  try {
    await client.connect(transport);
    console.log('[mcp:test] Connected. Initialization OK.');

    try {
      const tools = await client.listTools();
      const count = tools.tools?.length ?? 0;
      console.log(`[mcp:test] listTools → ${count} tool(s)`);
      for (const t of tools.tools || []) {
        console.log(`  - ${t.name}${t.description ? `: ${t.description}` : ''}`);
      }
    } catch (e) {
      console.warn('[mcp:test] listTools failed:', e?.message || e);
    }

    try {
      const prompts = await client.listPrompts();
      const count = prompts.prompts?.length ?? 0;
      console.log(`[mcp:test] listPrompts → ${count} prompt(s)`);
      for (const p of prompts.prompts || []) {
        console.log(`  - ${p.name}`);
      }
    } catch (e) {
      console.warn('[mcp:test] listPrompts failed:', e?.message || e);
    }
  } catch (err) {
    console.error('[mcp:test] Failed to connect:', err?.message || err);
    process.exit(1);
  } finally {
    try {
      await client.close?.();
    } catch {}
  }
}

main();
