# Data Plane: Vector DB, Knowledge Graph, Object Store

> Sökt 2026-04-12

## Tre representationer parallellt

Enterprise AI-system 2026 kör multipla kunskapsrepresentationer:
- Vector embeddings för semantisk sökning
- Knowledge graphs för relationsresonnering
- Hierarkiska index för kategorisk navigering

## Vector Databases — jämförelse

| DB | Språk | Styrka | Skala | Latency (p50) |
|----|-------|--------|-------|----------------|
| **Qdrant** | Rust | Filtrerad sökning, resurssnål | Miljoner-tiotals M | 8ms |
| **Milvus** | Go/C++ | Massiv skala, disaggregerad | Hundratals M - miljarder | 12ms |
| **Weaviate** | Go | Hybrid search, inbyggda vectorizers | Miljoner-tiotals M | 15ms |

### Qdrant (rekommendation för Bifrost)
- Lägst latency, lägst resursåtgång
- Bäst på metadata-filtrering (relevant för multi-tenant)
- Enkel K8s-deployment (single binary)
- Bra för recommendation, search, RAG

### Milvus (om skalan kräver det)
- Disaggregerad arkitektur (compute ↔ storage separat)
- Kräver Kafka, MinIO, etcd — komplexare ops
- Rätt val vid miljarder vektorer

## Knowledge Graph — Neo4j
- Industristandard för property graphs
- Helm chart finns, K8s-ready
- GraphRAG + HippoRAG bygger ovanpå grafdatabaser
- Cypher-query-språk

## Object Store — MinIO
- S3-kompatibelt, K8s-native
- Helm chart, operator
- Modellvikter, dokument, artifacts, backups
- Billigare än PV för stora filer

## Källor
- [Vector DB Comparison 2026](https://www.firecrawl.dev/blog/best-vector-databases)
- [Qdrant vs Milvus vs Weaviate](https://blog.elest.io/qdrant-vs-weaviate-vs-milvus-which-vector-database-for-your-rag-pipeline/)
- [Vector DB Comparison (dasroot)](https://dasroot.net/posts/2026/03/vector-databases-comparison-pinecone-weaviate-milvus/)
