# LiteLLM Configuration Update - Session 13

## Problem

Agent routing fails with `litellm.BadRequestError: Unknown parameter: 'reasoningSummary'`. This parameter is sent by default but not supported by Azure models (`gpt-5.2`, `gpt-5-nano`).

## Solution Options

### Option 1: Remove `reasoningSummary` from LiteLLM config (Recommended)
Edit your LiteLLM configuration to exclude unsupported parameters:

```yaml
# In your LiteLLM config file (likely .litellm.yaml or similar)
model_list:
  - model_name: "gpt-5.2"
    litellm_params:
      model: "azure/gpt-5.2"
      api_key: $AZURE_API_KEY
      api_base: "https://your-azure-endpoint.openai.azure.com/"
      # Explicitly exclude problematic params:
      extra_params:
        reasoningSummary: null  # Disable this
        # Or remove entirely from default params
  - model_name: "claude-sonnet-3.5"
    litellm_params:
      model: "anthropic/claude-3.5-sonnet-20240620"
      api_key: $ANTHROPIC_API_KEY
  - model_name: "claude-opus"
    litellm_params:
      model: "anthropic/claude-3-opus-20240229"
      api_key: $ANTHROPIC_API_KEY

# Global defaults (remove reasoningSummary if present)
litellm_settings:
  default_params:
    temperature: 0.1
    # reasoningSummary: null  # Comment out or remove
```

### Option 2: Route agents to Anthropic models (Sonnet/Opus)
If you prefer to keep Azure for main model but use Anthropic for agents:

```yaml
# litellm.yaml
model_list:
  # Azure for main usage
  - model_name: "gpt-5.2"
    litellm_params:
      model: "azure/gpt-5.2"
      api_key: $AZURE_API_KEY
      api_base: "https://your-azure-endpoint.openai.azure.com/"
  
  # Anthropic for agent tasks (no reasoningSummary issues)
  - model_name: "sonnet"
    litellm_params:
      model: "anthropic/claude-3.5-sonnet-20240620"
      api_key: $ANTHROPIC_API_KEY
  - model_name: "opus"
    litellm_params:
      model: "anthropic/claude-3-opus-20240229"
      api_key: $ANTHROPIC_API_KEY

# Route agent tasks to Anthropic
agent_routing:
  oracle: "sonnet"
  librarian: "sonnet"
  explore: "opus"
  # Keep main model as Azure
  sisyphus: "gpt-5.2"
```

### Option 3: Environment variable override
Quick fix without config changes:

```bash
# Export before running OpenCode
export LITELLM_DEFAULT_PARAMS='{"reasoningSummary": null}'
# Or completely disable
export LITELLM_DISABLE_DEFAULT_PARAMS=1

# Then start OpenCode
npx opencode
```

## Verification Steps

After updating config, test agent routing:

```bash
# Test background task
# Should succeed without reasoningSummary error

# Test sync task
# Should respond within 30s
```

## Recommended Approach

**Option 1** — remove `reasoningSummary` globally. It's a config bug, not a model issue. Anthropic models (Sonnet/Opus) are more expensive but you get them anyway. Keep Azure for main model, fix the param issue.

**Why not just switch all to Sonnet/Opus?**
- Azure (`gpt-5.2`) is billigare per token
- Du har redan investerat i Azure-setup
- Sonnet/Opus har högre latency (viktigt för real-time)
- Fixa buggen så du kan använda alla modeller

## Next Steps

1. **Update LiteLLM config** — remove `reasoningSummary`
2. **Restart OpenCode** — new session with working agents
3. **Test agent routing** — confirm background tasks work
4. **Implement Schema.org** — `AuroraDocument` with `schema-dts`

Låt mig veta när du uppdaterat konfigen så startar vi session 13!