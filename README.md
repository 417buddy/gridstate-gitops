# GridState

A small multi-service system: an API, a background worker, and a shared
Redis queue. Built as Product B for the Expadox Portfolio DevOps track,
covering Projects 4 to 6: GitOps with Drift Auto-Remediation, Full
Region Evacuation Drill, and Ephemeral Full-Stack Preview Environments.

---

## What it is
- `POST /jobs` queues a job
- `GET /jobs/:id` checks its result
- `GET /status` reports queue depth and whether Redis is reachable, the
  real signal Project 4's drift detection and Project 5's region drill
  both depend on
- A worker pool that consumes the queue and writes results back

Three small pieces, one dependency between them (Redis), kept
deliberately simple so the DevOps work around the system is what
carries the complexity, not the app itself.

---

## Tech stack
Node.js/Express (API), Node.js worker, Redis, two local k3d clusters
(`gridstate-region-a` and `gridstate-region-b`), ArgoCD for GitOps,
Headlamp and k9s for cluster visibility, SOPS for encrypting secrets
that live in the same repo ArgoCD watches, Chaos Mesh and Velero for
Project 5, Portainer/Coolify/Dokploy for Project 6. Everything free,
everything self-hosted or open source.

---

## Local setup

### 1. Two clusters
```bash
k3d cluster create gridstate-region-a --agents 2
k3d cluster create gridstate-region-b --agents 2
```

### 2. Build and load images (region A)
```bash
kubectl config use-context k3d-gridstate-region-a

docker build -t gridstate-api:0.1.0 -f api/Dockerfile api
docker build -t gridstate-worker:0.1.0 -f worker/Dockerfile worker
k3d image import gridstate-api:0.1.0 gridstate-worker:0.1.0 -c gridstate-region-a
```

### 3. Install ArgoCD
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 4. Point ArgoCD at this repo
Push this repo to your own Git remote, update `source.repoURL` in
`argocd/application.yaml` to point at it, then:
```bash
kubectl apply -f argocd/application.yaml
```
ArgoCD will apply everything under `k8s/region-a/` and, because
`selfHeal: true` is set, will revert any manual change made directly
against the live cluster, this is the actual mechanic Project 4 studies.

### 5. Verify
```bash
kubectl get pods -n gridstate
kubectl port-forward -n gridstate svc/gridstate-api 3000:80
curl -X POST localhost:3000/jobs -H 'Content-Type: application/json' -d '{"type":"demo"}'
curl localhost:3000/status
```

### 6. Cluster visibility tooling
```bash
# Headlamp
kubectl apply -f https://raw.githubusercontent.com/headlamp-k8s/headlamp/main/kubernetes-headlamp.yaml

# k9s (local binary, not cluster-installed)
brew install k9s   # or the equivalent for your OS
k9s --context k3d-gridstate-region-a
```

### 7. Secrets with SOPS
```bash
brew install sops age
age-keygen -o key.txt   # keep key.txt private, never commit it
# put the public key (age1...) into .sops.yaml, replacing the placeholder
sops --encrypt k8s/region-a/redis-secret.template.yaml > k8s/region-a/redis-secret.enc.yaml
```
Only the `.enc.yaml` file is safe to commit and let ArgoCD watch.

---

## What each project pulls from this repo
- **Project 4 (GitOps with Drift Auto-Remediation):** the ArgoCD
  `Application` in `argocd/application.yaml`, a deliberate manual drift
  introduced against the live cluster and auto-corrected, Headlamp and
  k9s used to observe it, SOPS protecting the secrets ArgoCD needs
- **Project 5 (Full Region Evacuation Drill):** `gridstate-region-b`,
  currently empty on purpose, is where failover gets built and drilled,
  using Chaos Mesh to fail region A and Velero to prove the state is
  actually recoverable
- **Project 6 (Ephemeral Full-Stack Preview Environments):** Portainer,
  Coolify, and Dokploy, none of which are set up in this repo yet,
  compared directly as three ways to spin up a full, isolated GridState
  environment per pull request

## Known simplifications
- Redis runs with `emptyDir` storage in the base manifest, meaning a pod
  restart loses all queued and cached data right now, called out
  explicitly rather than hidden. Project 5's Velero work is where this
  gets addressed for real.
- `gridstate-region-b` has no manifests applied to it yet at the start
  of this product, that is Project 5's actual work, not something to
  pre-solve here.
- The `.sops.yaml` age key is a placeholder. Generate and use your own,
  never reuse an example key from documentation for anything real.
