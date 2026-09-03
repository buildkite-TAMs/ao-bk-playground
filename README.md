# NASA Image Explorer

NASA Image Explorer is a small Docker Compose application that displays NASA's Astronomy Picture of the Day (APOD) and supports looking up an APOD by date.

The application has two services:

| Service | Technology | Host port | Purpose |
| --- | --- | --- | --- |
| `app` | Nginx | `8080` | Serves the static HTML, CSS, and browser-side JavaScript. |
| `server` | Node.js and Express | `3000` | Calls NASA's APOD API and exposes the application API. |

## Functionality

The web interface loads the current Astronomy Picture of the Day when the page opens. A visitor can:

- view either APOD images or embedded APOD videos;
- see the title, date, explanation, and attribution returned by NASA;
- open the high-resolution image or original video;
- select any valid date from June 16, 1995 through today; and
- retry a failed request.

The browser requests `GET /api/nasaimage` through Nginx. Nginx proxies the request to the Express server, which forwards it to NASA with the configured API key and normalizes the response for the UI.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Basic server response. |
| `GET` | `/api/nasaimage` | Fetch today's APOD. Pass `?date=YYYY-MM-DD` for another date. |

## Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose v2 (the `docker compose` command)
- A [NASA API key](https://api.nasa.gov/) stored in 1Password
- The 1Password CLI (`op`), signed in to the account containing the key
- For Kubernetes deployment: a running cluster, `kubectl`, and Helm

No local Node.js installation is needed when running the full stack with Docker Compose.

## Run the application

1. Clone the repository and enter it:

   ```bash
   git clone <repository-url>
   cd ao-bk-playground
   ```

2. In 1Password, open the NASA credential and copy the API key field's secret
   reference. It has this form; the placeholders are not literal names:

   ```text
   op://<vault>/<nasa-api-item>/<field>
   ```

3. Build and start both services, replacing the example reference with yours:

   ```bash
   API_TOKEN="$(op read 'op://<vault>/<nasa-api-item>/<field>')" \
     docker compose up --build
   ```

4. Open [http://localhost:8080](http://localhost:8080) in a browser.

The API is available separately at [http://localhost:3000](http://localhost:3000). For example:

```bash
curl --fail "http://localhost:3000/api/nasaimage?date=2024-01-01"
```

To run in the background, use `docker compose up --build --detach`. Useful follow-up commands are:

```bash
docker compose ps
docker compose logs --follow server
docker compose down
```

`docker compose down` stops and removes the containers and network.

### Configuration

Docker Compose accepts these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `API_TOKEN` | none | NASA API key. Required for APOD requests. |
| `PORT` | `3000` | Port used by Express inside the server container. The Compose host mapping remains `3000:3000`, so changing this alone also requires updating that mapping. |
| `APP_ENV` | `test` | Application environment value passed to the server. |
| `API_HOST` | `localhost` | Reserved server configuration value; the current code does not read it. |

The frontend calls `/api/nasaimage` on its own origin. Nginx proxies `/api/` requests to the server container in Compose and to the server Service in Kubernetes.

## Architecture and request flow

1. The browser opens port `8080`, where the `app` container's Nginx process serves `index.html`, `styles.css`, and `render.js`.
2. Browser-side JavaScript calls `/api/nasaimage` on the frontend's origin.
3. Nginx proxies `/api/` requests to Express over the private application network.
4. Express calls `https://api.nasa.gov/planetary/apod`, passing `API_TOKEN` as NASA's `api_key` and requesting video thumbnails.
5. Express converts NASA's response into a consistent object for image and video rendering.
6. The browser renders the media and metadata returned by Express.

Compose places both containers on the private `app-network`. Service-name DNS lets Nginx proxy requests to `server:3000`. The `server` source directory is bind-mounted into its container, and `nodemon` runs the API, so server-side edits made locally are reloaded during development.

## Repository layout

```text
.
├── app/                     # Static Nginx frontend
│   ├── Dockerfile
│   ├── index.html
│   ├── render.js
│   └── styles.css
├── server/                  # Express API
│   ├── controller.js
│   ├── Dockerfile
│   ├── index.js
│   ├── package.json
│   └── router-app.js
└── docker-compose.yml       # Local and CI service orchestration
```

## Current limitations

- The Node package's `npm test` command remains a placeholder; black-box tests live in `tests/`.
- Compose startup ordering checks that a dependency container has started, not that the API is ready.
- The server image uses Node.js 12, which is end-of-life and should be upgraded before production use.

This repository is a playground rather than a production deployment template.

## Helm deployment

The chart in `helm/` deploys the Nginx frontend and Node API. It does not
deploy MongoDB because the current application has no database dependency.

From the repository root, create the deployment namespace first:

```bash
kubectl create namespace nasa-image \
  --dry-run=client \
  --output=yaml \
  | kubectl apply -f -
```

Then create the NASA token Secret directly in that namespace, replacing the
example 1Password secret reference with yours:

```bash
kubectl create secret generic nasa-api-token \
  --namespace nasa-image \
  --from-literal=API_TOKEN="$(op read 'op://<vault>/<nasa-api-item>/<field>')"
```

If the Secret already exists and you need to replace its token, run:

```bash
kubectl create secret generic nasa-api-token \
  --namespace nasa-image \
  --from-literal=API_TOKEN="$(op read 'op://<vault>/<nasa-api-item>/<field>')" \
  --dry-run=client \
  --output=yaml \
  | kubectl replace -f -

kubectl rollout restart deployment/nasa-image-server \
  --namespace nasa-image

kubectl rollout status deployment/nasa-image-server \
  --namespace nasa-image
```

`kubectl replace` requires `nasa-api-token` to already exist. It avoids the
missing `kubectl.kubernetes.io/last-applied-configuration` warning that can
appear when `kubectl apply` updates a Secret originally created with
`kubectl create`.

Install or upgrade the release using that Secret:

```bash
helm upgrade --install nasa-image ./helm \
  --namespace nasa-image \
  --set-string secrets.existingSecret=nasa-api-token \
  --rollback-on-failure \
  --wait \
  --timeout 5m
```

Kubernetes Secrets are namespace-specific. A `nasa-api-token` Secret in the
`default` namespace is not available to this release. Verify the active
cluster, release, and deployment with:

```bash
kubectl config current-context
helm status nasa-image --namespace nasa-image
kubectl get pods,services --namespace nasa-image
```

Access the UI by keeping this command running in a terminal:

```bash
kubectl port-forward --namespace nasa-image \
  service/nasa-image-app 8080:80
```

Open [http://localhost:8080](http://localhost:8080). The port-forward process
must remain running. If the port is available but the page does not respond,
check the workload and Service endpoints:

```bash
kubectl get pods,services,endpoints --namespace nasa-image
kubectl logs deployment/nasa-image-app --namespace nasa-image
kubectl logs deployment/nasa-image-server --namespace nasa-image
```

Access the API by keeping this command running in a separate terminal:

```bash
kubectl port-forward --namespace nasa-image \
  service/nasa-image-server 3000:3000
```

For a shared environment, configure `ingress` in a separate values file.

If the 1Password Kubernetes Operator manages the credential, configure it to
create a Secret containing `API_TOKEN`, then set `secrets.existingSecret` to
that Secret's name. Helm does not resolve 1Password share links or `op://`
references on its own.
The commands above resolve `op://` references with `op read` before invoking
`kubectl` or Docker Compose.

### Repeat the Kubernetes deployment

For later runs, verify the context, update the Secret only if the NASA token
changed, and rerun the same Helm command:

```bash
kubectl config current-context

helm upgrade --install nasa-image ./helm \
  --namespace nasa-image \
  --set-string secrets.existingSecret=nasa-api-token \
  --rollback-on-failure \
  --wait \
  --timeout 5m
```

Helm reuses the existing release and applies changes from the chart and values.
The chart currently deploys the `latest` application image tags with
`imagePullPolicy: Always`, so publish the desired images before upgrading.

## Test locally

The black-box tests in `tests/` expect the frontend at
`http://localhost:8080` and the API at `http://localhost:3000` by default.

### Test with Docker Compose

Start the application from the repository root:

```bash
API_TOKEN="$(op read 'op://<vault>/<nasa-api-item>/<field>')" \
  docker compose up --build --detach
```

Wait for both services and run the tests:

```bash
python3 tests/wait_for_services.py
python3 -m unittest -v tests.test_application
```

The live NASA request test is skipped by default. Enable it with:

```bash
RUN_LIVE_NASA_TEST=1 python3 -m unittest -v tests.test_application
```

Open the UI at `http://localhost:8080`. When finished, stop the services:

```bash
docker compose down
```

### Test the local Kubernetes deployment

Keep each port-forward command running in a separate terminal:

```bash
kubectl port-forward --namespace nasa-image \
  service/nasa-image-app 8080:80
```

```bash
kubectl port-forward --namespace nasa-image \
  service/nasa-image-server 3000:3000
```

In a third terminal, wait for the services and run the test suite:

```bash
python3 tests/wait_for_services.py
python3 -m unittest -v tests.test_application
```

To include the live NASA API assertion:

```bash
RUN_LIVE_NASA_TEST=1 python3 -m unittest -v tests.test_application
```

Open the UI at `http://localhost:8080`. Press `Ctrl+C` in each port-forward
terminal when testing is complete.
