# Buildkite pipelines

This directory contains two pipeline definitions:

- `pipeline.yml` builds the frontend and API images and publishes them to
  Buildkite Packages.
- `pipeline.test.yml` validates the Helm chart, deploys the published images to
  Kubernetes, and runs black-box tests against the deployment.
- `agent-stack-values.yaml` keeps the non-secret Kubernetes Agent Stack
  configuration consistent across installs and upgrades.

Commands that load stored credentials use 1Password CLI secret references in
the form `op://Vault/Item/field`. Replace each example reference with the value
from **Copy Secret Reference** in 1Password and sign in with `op signin` first.
A `https://share.1password.com/...` share link is not an `op read` reference.

## Image publishing pipeline

Configure the image-publishing pipeline to upload `.buildkite/pipeline.yml`.
Its active step:

1. Builds `app/Dockerfile` and `server/Dockerfile` with the `latest` tag.
2. Requests a five-minute OIDC token for the
   `tam-sandbox/ao-bk-playground` package registry.
3. Logs Docker into the registry and pushes both images.

The agent running this pipeline needs Docker daemon access and a recent
Buildkite Agent with the `oidc request-token` command. The package registry must
have an OIDC policy allowing jobs from this pipeline to publish images.

The additional Docker, Compose, and smoke-test steps in `pipeline.yml` are
currently commented out and do not run.

## Kubernetes test pipeline

Configure a separate pipeline to upload `.buildkite/pipeline.test.yml`. Its
steps run sequentially:

1. `validate-chart` lints and renders the chart.
2. `deploy-published-images` installs or upgrades the `nasa-image` release and
   waits for it to become ready. `--atomic` rolls the release back on failure.
3. `test-published-images` runs `tests/wait_for_services.py` and the Python
   black-box test suite against the in-cluster Services.

All steps target the agent queue named `kubernetes`. Deployment concurrency is
limited to one job in the `nasa-image-test` group so two builds cannot mutate
the same Helm release simultaneously.

### Install the Kubernetes agent stack

Kubernetes creates a `default` ServiceAccount automatically, but the Buildkite
jobs should use a dedicated account with namespace-scoped deployment access.
Create the namespaces and ServiceAccount first:

```bash
kubectl create namespace buildkite
kubectl create namespace nasa-image
kubectl create serviceaccount buildkite-agent --namespace buildkite
```

Grant that account permission to deploy the application chart:

```bash
kubectl create role buildkite-nasa-image-deployer \
  --namespace nasa-image \
  --verb=get,list,watch,create,update,patch,delete \
  --resource=configmaps,secrets,services,deployments.apps,replicasets.apps,ingresses.networking.k8s.io

kubectl create rolebinding buildkite-nasa-image-deployer \
  --namespace nasa-image \
  --role=buildkite-nasa-image-deployer \
  --serviceaccount=buildkite:buildkite-agent
```

Store the Buildkite cluster agent token in 1Password and copy its secret
reference. Create a Kubernetes Secret from that reference:

```bash
kubectl create secret generic buildkite-agent-stack \
  --namespace buildkite \
  --from-literal=BUILDKITE_AGENT_TOKEN="$(op read 'op://Private/Buildkite Agent/credential')"
```

To replace an existing token, resolve the same 1Password reference and replace
the Kubernetes Secret:

```bash
kubectl create secret generic buildkite-agent-stack \
  --namespace buildkite \
  --from-literal=BUILDKITE_AGENT_TOKEN="$(op read 'op://Private/Buildkite Agent/credential')" \
  --dry-run=client \
  --output=yaml \
  | kubectl replace -f -
```

For a private GitHub repository checked out over HTTPS, create a second Secret
containing Git credentials. Replace the example with your GitHub token's
1Password secret reference:

```bash
printf 'https://x-access-token:%s@github.com\n' \
  "$(op read 'op://Private/GitHub Buildkite/token')" \
  | kubectl create secret generic github-git-credentials \
      --namespace buildkite \
      --from-file=.git-credentials=/dev/stdin
```

To update those credentials later:

```bash
printf 'https://x-access-token:%s@github.com\n' \
  "$(op read 'op://Private/GitHub Buildkite/token')" \
  | kubectl create secret generic github-git-credentials \
      --namespace buildkite \
      --from-file=.git-credentials=/dev/stdin \
      --dry-run=client \
      --output=yaml \
  | kubectl replace -f -
```

Install or upgrade the Agent Stack with the checked-in values file. Pinning the
chart version and using this file ensures each upgrade applies the same queue,
ServiceAccount, and Git checkout configuration. The file contains only
Kubernetes Secret names, not token values:

```bash
helm upgrade --install agent-stack-k8s \
  oci://ghcr.io/buildkite/helm/agent-stack-k8s \
  --version 0.49.0 \
  --namespace buildkite \
  --create-namespace \
  --values .buildkite/agent-stack-values.yaml
```

The Agent Stack chart schema requires `containers` to be present whenever
`config.pod-spec-patch` is defined. Use an empty array when only setting the
ServiceAccount. Omitting it produces this validation error:

```text
at '/config/pod-spec-patch': missing property 'containers'
```

Verify the release and permissions:

```bash
helm status agent-stack-k8s --namespace buildkite
kubectl get deployments,pods,serviceaccounts --namespace buildkite

kubectl auth can-i create deployments.apps \
  --namespace nasa-image \
  --as system:serviceaccount:buildkite:buildkite-agent

kubectl auth can-i create secrets \
  --namespace nasa-image \
  --as system:serviceaccount:buildkite:buildkite-agent
```

Both authorization checks should return `yes`.

### Required Kubernetes setup

Before running the test pipeline:

1. Confirm that the `nasa-image` namespace exists.
2. Confirm that the `kubernetes` queue's service account can manage the
   chart's Deployments, Services, ConfigMaps, Secrets, and Helm release data in
   that namespace.
3. Create a `nasa-api-token` Secret in the namespace with an `API_TOKEN` key.
   The 1Password Kubernetes Operator may manage this Secret; Helm only needs
   its Kubernetes name and never receives the secret value.
4. If the package registry requires authenticated image pulls, create a
   `kubernetes.io/dockerconfigjson` pull Secret and set
   `REGISTRY_PULL_SECRET` in `pipeline.test.yml` to its name.

The namespace, release, secret, queue, and internal service URLs are declared
in the test pipeline's top-level `env` block and can be changed together.

## Security and release behavior

Do not store NASA credentials, registry passwords, kubeconfigs, or 1Password
share links in either pipeline file. Use short-lived OIDC for publishing and
Kubernetes Secrets for runtime credentials.

The values file makes the Kubernetes configuration repeatable, but the
publishing pipeline currently pushes `latest`, and the test pipeline deploys
that mutable tag. Consequently, the container image contents can still change
between runs. There is no automatic trigger connecting the two pipeline
definitions, so run the publishing pipeline before the Kubernetes test
pipeline. Commit-specific tags or image digests and an explicit pipeline
trigger are the next step for fully reproducible releases.
