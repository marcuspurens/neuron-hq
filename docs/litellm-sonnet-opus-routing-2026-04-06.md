# LiteLLM Configuration for Sonnet/Opus Agent Routing - Session 13 Setup

## Current Problem
Agent tasks fail with `BadRequestError: Unknown parameter: 'reasoningSummary'`. This happens because LiteLLM sends unsupported parameters to Azure models (`gpt-5.2`, `gpt-5-nano`). Direct tools work, but background agents (`task(run_in_background=true)`) and sync agents don't.

## Solution: Route Agents to Anthropic Models
We'll keep your Azure models for main usage (Sisyphus responses) but route all agent tasks (Oracle, Librarian, Explore) to Anthropic Sonnet/Opus, which don't have this parameter issue.

## Step 1: Verify Your Current LiteLLM Config
First, find your LiteLLM config file. It's usually one of these locations:

```bash
# Check common locations
ls ~/.litellm.yaml
ls /Users/mpmac/.litellm.yaml
ls /Users/mpmac/Documents/VS\ Code/neuron-hq/.litellm.yaml
ls /opt/anaconda3/etc/litellm.yaml  # if using conda

# Or check if it's in environment variables
echo $LITELLM_CONFIG_FILE
```

If no config file exists, LiteLLM uses environment variables. Check:

```bash
# Check environment
env | grep LITELLM
env | grep ANTHROPIC
env | grep AZURE
```

## Step 2: Create/Update .litellm.yaml
Create or edit `~/.litellm.yaml` (or in your project root):

```yaml
# ~/.litellm.yaml or .litellm.yaml in project root

model_list:
  # Azure models for main usage (Sisyphus, direct responses)
  - model_name: gpt-5.2
    litellm_params:
      model: azure/gpt-5.2
      api_key: $AZURE_OPENAI_API_KEY
      api_base: "https://your-azure-instance.openai.azure.com/"  # Update with your endpoint
      api_version: "2024-02-01"  # or your version
      # Explicitly disable problematic params:
      extra_body:
        reasoningSummary: null
        # Add other unsupported params here if needed

  # Anthropic Sonnet for most agent tasks (fast, reliable)
  - model_name: sonnet
    litellm_params:
      model: anthropic/claude-3.5-sonnet-20240620
      api_key: $ANTHROPIC_API_KEY

  # Anthropic Opus for complex tasks (Oracle, deep thinking)
  - model_name: opus
    litellm_params:
      model: anthropic/claude-3-opus-20240229
      api_key: $ANTHROPIC_API_KEY

# Global settings
litellm_settings:
  # Disable default parameters that cause issues
  default_params: {}
  # Or explicitly set safe defaults
  # default_params:
  #   temperature: 0.1
  #   max_tokens: 4096

# Agent-specific routing (if LiteLLM supports it)
# This routes specific agent types to specific models
routing:
  oracle: "opus"           # Complex reasoning → Opus
  librarian: "sonnet"      # Research → Sonnet  
  explore: "sonnet"        # Codebase search → Sonnet
  sisyphus: "gpt-5.2"      # Main responses → Azure

# Success/failure callbacks (optional, for debugging)
success_callback: ["langfuse"]  # or your monitoring tool
failure_callback: ["langfuse"]
```

## Step 3: Set Environment Variables
Make sure you have API keys set:

```bash
# Azure (for main model)
export AZURE_OPENAI_API_KEY="your-azure-key"
export AZURE_OPENAI_ENDPOINT="https://your-instance.openai.azure.com/"

# Anthropic (for agents)
export ANTHROPIC_API_KEY="your-anthropic-key"

# Tell LiteLLM where config is
export LITELLM_CONFIG_FILE="$HOME/.litellm.yaml"  # or project path
```

## Step 4: Test the Config
Test LiteLLM directly before OpenCode:

```bash
# Test Azure model (should work for main usage)
curl http://localhost:4000/chat/completions \
  -H "Authorization: Bearer $AZURE_OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.2",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Test Sonnet model (should work for agents)
curl http://localhost:4000/chat/completions \
  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "Test agent routing"}]
  }'
```

Both should return 200 OK responses.

## Step 5: Start OpenCode with New Config
```bash
# Make sure LiteLLM is running with new config
# (Your existing LiteLLM server command, but with updated .litellm.yaml)

# Start new OpenCode session
npx opencode
```

## Step 6: Verify Agent Routing in OpenCode
In the new session, test a simple agent task:

**Expected success:** Background tasks should complete without `reasoningSummary` errors.

**If still failing:** Check LiteLLM logs for the exact parameter being sent. You may need to add more `extra_body: null` entries for other unsupported params.

## Alternative: Quick Environment Variable Fix
If config file is tricky, try environment override:

```bash
# Disable all default params that might cause issues
export LITELLM_DEFAULT_PARAMS='{}'
export LITELLM_DISABLE_DEFAULT_PARAMS=1

# Route specific models
export LITELLM_ROUTING='{"oracle": "sonnet", "librarian": "opus"}'

# Start OpenCode
npx opencode
```

## Monitoring
After fix, watch LiteLLM logs for:
- `model: sonnet` / `model: opus` when agent tasks run
- No more `reasoningSummary` errors
- Response times under 30s for sync tasks

## Next After Fix
Once agents work:
1. Install `pnpm add -D schema-dts`
2. Implement `AuroraDocument` interface  
3. Update PDF pipeline for Schema.org metadata
4. Build page classifier

Låt mig veta när du testat konfigen så startar vi session 13!