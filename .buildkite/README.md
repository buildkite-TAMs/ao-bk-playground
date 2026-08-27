# Buildkite pipelines

This directory contains two pipeline definitions:

- `pipeline.yml` builds the frontend and API images and publishes them to
  Buildkite Packages.
- `pipeline.test.yml` validates the Helm chart, deploys the published images to
  Kubernetes, and runs black-box tests against the deployment.

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

### Required Kubernetes setup

Before running the test pipeline:

1. Create the `nasa-image` namespace.
2. Give the `kubernetes` queue's service account permission to manage the
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

The publishing pipeline currently pushes `latest`, and the test pipeline
deploys that tag. There is no automatic trigger connecting the two pipeline
definitions, so run the publishing pipeline before the Kubernetes test
pipeline. Commit-specific tags and an explicit pipeline trigger would be the
next step for immutable releases.
