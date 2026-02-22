# Techniques — Externa forskningsrön

Relevanta rön från AI-forskning och Anthropic-dokumentation.
Uppdateras av Librarian-agenten.

---

## A-MEM: Agentic Memory System (NeurIPS 2025)
**Källa:** NeurIPS 2025
**Kärna:** Zettelkasten-inspirerat minnessystem för LLM-agenter. Varje minne är en nod med nyckelord, kontext och explicit länkning till relaterade minnen.
**Nyckelresultat:** 85–93% färre tokens jämfört med naiv full-context approach
**Relevans för Neuron HQ:** Inspirerade vår kategoriserade memory-struktur (runs/patterns/errors/techniques). Länkade minnen är nästa steg.

---

## MemGPT: OS-inspirerat RAM/disk-minne
**Källa:** MemGPT paper
**Kärna:** Behandlar LLM-kontext som RAM och extern lagring som disk. Agenten bestämmer själv vad som ska "swappas" till disk.
**Relevans för Neuron HQ:** Historian-agentens selektiva skrivning till rätt minnesfil (runs/patterns/errors) är en förenklad version av detta.

---

## Mem0: Grafbaserat produktionsminne
**Källa:** Mem0 projekt
**Kärna:** Grafbaserat minneslager optimerat för produktion. Hanterar entiteter och relationer mellan minnen.
**Relevans för Neuron HQ:** Möjlig framtida uppgradering om patterns.md och errors.md behöver korsreferenser.

---

## Anthropics råd om agentarkitektur
**Källa:** Anthropic agent best practices
**Kärna:** Initializer → incremental agents → handoffs. Varje agent har ett tydligt, avgränsat ansvar.
**Relevans för Neuron HQ:** Vår Manager → Researcher/Implementer/Reviewer/Tester/Merger/Historian-pipeline följer detta mönster exakt.

---
