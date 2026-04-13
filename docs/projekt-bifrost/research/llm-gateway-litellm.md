# LLM Gateway: LiteLLM

> Sökt 2026-04-12

## Vad LiteLLM är
- Python-baserad open-source LLM proxy
- 100+ providers via unified OpenAI-kompatibelt API
- Unified gateway för LLMs, agents och MCP

## Routing & Fallback
- Order-baserad routing: order=1 → order=2 → order=3
- Vid 429 (rate limit): deployment på cooldown direkt
- Model-level fallbacks efter alla order-nivåer
- Per-key och per-team router settings

## Rate Limiting & Budget
- RPM/TPM-limits per deployment
- Budget och rate limits per team/user
- Kostnadsspårning per key, team, user, provider

## Multi-Tenant
- Organizations → Teams → Virtual Keys (enterprise)
- Open source: Teams + Virtual Keys
- Varje API-anrop spåras med org/team/user/key kontext

## Enterprise
- SSO/SAML, audit logs
- Avancerad säkerhet
- Guardrails integration

## Alternativ (2026)
1. Bifrost (ej samma som vårt projekt — gateway-produkt)
2. Kong AI Gateway
3. Cloudflare AI Gateway
4. OpenRouter
5. LiteLLM

## Källor
- [LiteLLM docs](https://docs.litellm.ai/docs/simple_proxy)
- [LiteLLM routing](https://docs.litellm.ai/docs/routing-load-balancing)
- [LiteLLM multi-tenant](https://docs.litellm.ai/docs/proxy/multi_tenant_architecture)
- [Top 5 Enterprise LLM Gateways 2026](https://www.getmaxim.ai/articles/top-5-enterprise-llm-gateways-in-2026/)
