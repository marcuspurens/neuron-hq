import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


async def main():
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    server_params = StdioServerParameters(
        command=sys.executable,
        args=[os.path.join(os.path.dirname(__file__), "mcp_server.py")],
        env={
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
        },
    )

    print("Starting MCP server ...", file=sys.stderr)

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("Server initialized", file=sys.stderr)

            tools = await session.list_tools()
            print(f"\nTools available: {len(tools.tools)}", file=sys.stderr)
            for t in tools.tools:
                print(f"  - {t.name}", file=sys.stderr)

            if len(sys.argv) > 1:
                audio_path = sys.argv[1]
                language = sys.argv[2] if len(sys.argv) > 2 else None

                print(f"\nTranscribing: {audio_path}", file=sys.stderr)
                args = {"audio_path": audio_path}
                if language:
                    args["language"] = language

                result = await session.call_tool("transcribe_audio", args)

                for content in result.content:
                    if hasattr(content, "text"):
                        data = json.loads(content.text)
                        print(json.dumps(data, indent=2, ensure_ascii=False))
                        meta = data.get("metadata", {})
                        print(f"\n--- Summary ---", file=sys.stderr)
                        print(f"Model: {meta.get('model_used')}", file=sys.stderr)
                        print(f"Language: {meta.get('language')}", file=sys.stderr)
                        print(f"Segments: {meta.get('segment_count')}", file=sys.stderr)
                        print(f"Aligned: {meta.get('aligned')}", file=sys.stderr)
                        text = data.get("text", "")
                        words = text.split()
                        print(f"Words: {len(words)}", file=sys.stderr)
                        print(f"First 200 chars: {text[:200]}", file=sys.stderr)
            else:
                print("\nNo audio path provided. Pass a path as argument to test transcription.", file=sys.stderr)
                print("Usage: python test_mcp_server.py /path/to/audio.wav [language]", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
