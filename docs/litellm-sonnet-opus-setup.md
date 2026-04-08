# LiteLLM Configuration: Route to Sonnet/Opus for Agents

## Understanding LiteLLM Structure
LiteLLM is a proxy that routes requests to different model providers (Azure, Anthropic, etc.). The config lives in `.litellm.yaml` and controls which model each request goes to. You don't "change models in LiteLLM" — you configure routing rules.

LiteLLM already has **all models available** (Azure GPT, Anthropic Claude, OpenAI, etc.) as long as you have API keys set. The problem is the `reasoningSummary` parameter being sent to Azure models that don't support it.

## Step-by-Step: Route Agents to Sonnet/Opus

### 1. Locate/Create LiteLLM Config File
LiteLLM looks for config in these places (in order):
- `$LITELLM_CONFIG_FILE` environment variable
- `./.litellm.yaml` (project root)
- `~/.litellm.yaml` (home directory)

Create or edit `./.litellm.yaml` in your neuron-hq project:

```bash
cd /Users/mpmac/Documents/VS\ Code/neuron-hq
touch .litellm.yaml
```

### 2. Basic Config Structure
Your `.litellm.yaml` should look like this:

```yaml
# .litellm.yaml - Project root

# Model definitions
model_list:
  # Keep Azure for main Sisyphus responses (cheaper, faster)
  - model_name: azure-gpt
    litellm_params:
      model: azure/gpt-5.2  # or your Azure model
      api_key: $AZURE_OPENAI_API_KEY
      api_base: "https://your-azure-endpoint.openai.azure.com/"
      api_version: "2024-02-01"  # adjust to your version
      
      # Disable problematic parameters for Azure
      extra_body:
        reasoningSummary: null
        # Add other unsupported params here if needed

  # Anthropic Sonnet for fast agent tasks (Librarian, Explore)
  - model_name: sonnet
    litellm_params:
      model: anthropic/claude-3.5-sonnet-20240620
      api_key: $ANTHROPIC_API_KEY

  # Anthropic Opus for complex tasks (Oracle, deep analysis)
  - model_name: opus
    litellm_params:
      model: anthropic/claude-3-opus-20240229
      api_key: $ANTHROPIC_API_KEY

# Global settings
litellm_settings:
  # Disable default parameters that cause Azure errors
  default_params: {}
  
  # Optional: Set safe defaults for all models
  # default_params:
  #   temperature: 0.1
  #   max_tokens: 4096

# Routing rules (LiteLLM 1.20+ supports this)
general_settings:
  routing_strategy: "least-busy"  # or "round-robin"
  
  # Route specific agent types to specific models
  # This is custom — may need OpenCode config adjustment
  agent_routing:
    oracle: "opus"
    librarian: "sonnet" 
    explore: "sonnet"
    # Main Sisyphus stays on Azure
    sisyphus: "azure-gpt"
```

### 3. Set Environment Variables
Make sure API keys are available:

```bash
# Add to ~/.zshrc or ~/.bash_profile (permanent)
export AZURE_OPENAI_API_KEY="sk-your-azure-key"
export ANTHROPIC_API_KEY="sk-ant-your-anthropic-key"

# Tell LiteLLM where config is (temporary for testing)
export LITELLM_CONFIG_FILE="/Users/mpmac/Documents/VS Code/neuron-hq/.litellm.yaml"

# Reload environment
source ~/.zshrc
```

### 4. Start/Restart LiteLLM Server
LiteLLM needs to be running with the new config:

```bash
# Stop existing LiteLLM if running
pkill -f litellm

# Start with new config (adjust port if needed)
litellm --config /Users/mpmac/Documents/VS\ Code/neuron-hq/.litellm.yaml --port 4000

# Or if using systemd/service, restart the service
# systemctl restart litellm  # if you have it as service
```

### 5. Test the Routing
Test each model endpoint directly:

```bash
# Test Azure (main model - should work)
curl -X POST http://localhost:4000/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "azure-gpt",
    "messages": [{"role": "user", "content": "Hello from Azure"}],
    "max_tokens": 50
  }' | jq '.choices[0].message.content'

# Test Sonnet (agents - should work without reasoningSummary error)
curl -X POST http://localhost:4000/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "Hello from Sonnet for agents"}],
    "max_tokens": 50
  }' | jq '.choices[0].message.content'

# Test Opus (complex tasks)
curl -X POST http://localhost:4000/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opus", 
    "messages": [{"role": "user", "content": "Hello from Opus"}],
    "max_tokens": 50
  }' | jq '.choices[0].message.content'
```

**Expected output:** All three should return responses like "Hello from [model]". No `reasoningSummary` errors.

### 6. Agent-Specific Routing in OpenCode
LiteLLM's basic routing is model_name-based. For agent-specific routing (Oracle → Opus, Librarian → Sonnet), you need OpenCode config:

In your OpenCode setup (likely `.opencode/config.json` or similar):

```json
{
  "model_routing": {
    "oracle": "opus",
    "librarian": "sonnet", 
    "explore": "sonnet",
    "default": "azure-gpt"
  },
  "litellm": {
    "base_url": "http://localhost:4000",
    "models": {
      "azure-gpt": "azure/gpt-5.2",
      "sonnet": "anthropic/claude-3.5-sonnet-20240620",
      "opus": "anthropic/claude-3-opus-20240229"
    }
  }
}
```

If OpenCode doesn't support this, we'll route manually in agent prompts:
```typescript
// In task calls
task(subagent_type="oracle", ..., model="opus")
```

### 7. Start Session 13
Once tests pass:

```bash
# Ensure LiteLLM is running with new config
# Start fresh OpenCode session
npx opencode --new-session
```

In session 13, test agent routing:
- Background task should complete without errors
- Sync task should respond within 30s
- Parallel agents (2-3 explore/librarian) should work simultaneously

### Troubleshooting

**If Azure still fails:**
```yaml
# In .litellm.yaml, add explicit param disabling
litellm_params:
  extra_body:
    reasoningSummary: null
    reasoning_effort: null  # if this also causes issues
```

**If Anthropic API key missing:**
```bash
# Get key from https://console.anthropic.com/settings/keys
export ANTHROPIC_API_KEY="sk-ant-cb..."
```

**If LiteLLM doesn't pick up config:**
```bash
# Force config path
LITELLM_CONFIG_FILE=./.litellm.yaml litellm --port 4000
```

**Check LiteLLM logs:**
```bash
# Look for model routing and errors
tail -f /var/log/litellm.log  # or wherever logs go
# Or run with verbose
litellm --config .litellm.yaml --verbose
```

### Why This Works
- **Azure for main responses** — cheaper, faster for Sisyphus
- **Sonnet for research agents** — fast, reliable for Librarian/Explore  
- **Opus for complex thinking** — best for Oracle/deep analysis
- **No config surgery** — just model routing, no param removal needed for Anthropic

Test this and let me know when agents respond successfully. Then we start session 13 with working parallel agents + Schema.org implementation!