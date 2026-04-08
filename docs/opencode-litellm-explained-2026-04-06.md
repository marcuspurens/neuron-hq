# Förklaring: Hur OpenCode och LiteLLM fungerar tillsammans

## Din fråga är helt rimlig — låt mig förklara arkitekturen

### Hur det HANGAR SAMMAN

**OpenCode** (det du kör med `npx opencode`) är en **frontend/applikation** som:
- Tar dina prompts
- Kallar på AI-modeller för svar
- Hanterar agent-systemet (Sisyphus, Oracle, Librarian)
- Kör verktyg (read, grep, bash)

**LiteLLM** är en **separat server** (proxy) som:
- Route:ar OpenCode:s modell-förfrågningar till olika providers (Azure, Anthropic, xAI/Grok, OpenAI)
- Översätter OpenCode:s "model: 'opus'" till "anthropic/claude-3-opus-20240229"
- Hanterar API-nycklar och rate limits centralt

**Arkitekturen:**
```
Dina prompts → OpenCode → LiteLLM (localhost:4000) → Modell-provider (Anthropic, Azure, etc.) → Svar tillbaka
```

### Varför jag (Sisyphus) inte kan "växla modell"

1. **Jag är en instans av OpenCode** — när du skriver till mig körs jag genom OpenCode:s nuvarande konfiguration
2. **Min modell är fastsat** — jag är konfigurerad som `grok-4` (xAI), och det fungerar för huvud-svar
3. **Agenterna (Oracle, Librarian) är separata instanser** — de route:as genom LiteLLM, som har Azure-problemet
4. **LiteLLM-servern är din lokala** — jag kan inte starta eller konfigurera den. Den måste köras på din maskin

### Exempel på problemet

När jag försöker köra en agent:
```
Sisyphus (grok-4, fungerar) → Agent task → OpenCode → LiteLLM → Azure GPT-5.2 → FEGL (reasoningSummary)
```

**Lösningen:** Konfigurera LiteLLM att route:a agent-tasks till Anthropic istället:
```
Sisyphus (grok-4, fungerar) → Agent task → OpenCode → LiteLLM → Anthropic Sonnet/Opus → Fungerar!
```

### Vad du behöver göra (minimalt)

Du behöver inte "installera" något nytt — du behöver bara **starta LiteLLM-servern med rätt konfig**.

#### Snabbtest: Har du Anthropic-nyckel?
```bash
echo $ANTHROPIC_API_KEY
# Om tom: Gå till https://console.anthropic.com/settings/keys → Create Key → Kopiera "sk-ant-..."
export ANTHROPIC_API_KEY="sk-ant-din-nyckel-här"
```

#### Skapa minimal .litellm.yaml
```bash
cd /Users/mpmac/Documents/VS\ Code/neuron-hq
cat > .litellm.yaml << 'EOF'
model_list:
  # Din befintliga Azure-konfig (huvudsvar)
  - model_name: gpt-5.2
    litellm_params:
      model: azure/gpt-5.2
      api_key: $AZURE_OPENAI_API_KEY
      api_base: $AZURE_OPENAI_ENDPOINT
      api_version: "2024-02-01"
      extra_body:
        reasoningSummary: null  # Fixar Azure-fel

  # Anthropic för alla agents
  - model_name: sonnet
    litellm_params:
      model: anthropic/claude-3.5-sonnet-20240620
      api_key: $ANTHROPIC_API_KEY

# Inga default-params som orsakar fel
litellm_settings:
  default_params: {}
EOF
```

#### Starta LiteLLM
```bash
# Starta servern med konfigen
litellm --config .litellm.yaml --port 4000 &

# Verifiera
curl http://localhost:4000/health
# Borde visa: {"status": "healthy"}
```

#### Testa agent-routing
I **nästa OpenCode-session** (starta ny med `npx opencode --new-session`):
- Testa en enkel agent-task
- Om den fungerar utan `reasoningSummary`-fel: Success!

### Varför detta löser det

- **Huvud-svar (mig)**: Fortsätter använda Grok-4/Azure (fungerar redan)
- **Agents (Oracle, Librarian)**: Route:as till Sonnet (inga parameter-fel)
- **Ingen config-kirurgi**: Bara lägg till Anthropic-modellen och starta servern

### Om du inte vill fixa LiteLLM just nu

Vi kan fortsätta denna session med **direkta verktyg bara** (read, write, grep, websearch) — långsammare men fungerar. Schema.org-implementationen kan byggas manuellt.

**Vilket föredrar du?**
1. **Fix LiteLLM (5 min)** — kopiera kommandona ovan, få fungerande agents
2. **Fortsätt utan agents** — bygg Schema.org manuellt denna session

Säg till så guidar jag dig genom det du väljer!