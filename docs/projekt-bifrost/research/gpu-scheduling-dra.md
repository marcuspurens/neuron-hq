# GPU-schemaläggning: DRA (Dynamic Resource Allocation)

> Sökt 2026-04-12

## Status
- **DRA är GA** i Kubernetes 1.34 och OpenShift 4.21
- Ersätter device plugins för GPU-hantering
- NVIDIA donerade sin DRA-driver till CNCF vid KubeCon EU 2026

## Vad DRA ger
- Attributbaserad GPU-matchning (produktnamn, VRAM, compute capability, MIG-profil)
- Pods begär GPU:er baserat på egenskaper, inte bara antal
- MIG-partitionering utan manuella labels
- Bättre bin-packing och delning

## MIG (Multi-Instance GPU)
- NVIDIA H100 kan partitioneras i isolerade instanser
- Varje instans har eget minne och compute
- Kombinerat med DRA: dynamisk provisionering och bindning via resource claims

## Cloud-adoption
- Alla tre stora cloud providers (AWS, Azure, GCP) accelererar DRA-adoption
- Microsoft AKS: DRA-backed NVIDIA vGPU support
- Skiftet från statiska device plugins till DRA driven av topology-aware GPU-schemaläggning

## Källor
- [Kubernetes DRA docs](https://kubernetes.io/docs/concepts/scheduling-eviction/dynamic-resource-allocation/)
- [Red Hat: DRA GA i OpenShift 4.21](https://developers.redhat.com/articles/2026/03/25/dynamic-resource-allocation-goes-ga-red-hat-openshift-421-smarter-gpu)
- [Spheron: K8s GPU Orchestration 2026](https://www.spheron.network/blog/kubernetes-gpu-orchestration-2026/)
- [AKS: DRA with vGPUs](https://blog.aks.azure.com/2026/03/06/dra-with-vGPUs-on-aks)
- [AKS: MIG with DRA](https://blog.aks.azure.com/2026/03/03/multi-instance-gpu-with-dra-on-aks)
