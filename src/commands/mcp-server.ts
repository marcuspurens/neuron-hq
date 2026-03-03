export async function mcpServerCommand(): Promise<void> {
  // Stdout is used by MCP protocol — all logging goes to stderr
  const { startStdioServer } = await import('../mcp/server.js');
  await startStdioServer();
}
