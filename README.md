# Buildkite Playground

Buildkite Playground is a small Docker Compose application used to experiment with Buildkite CI. It displays NASA's Astronomy Picture of the Day (APOD), supports looking up an APOD by date, and includes a MongoDB-backed API for users and image ratings.

The application has three services:

| Service | Technology | Host port | Purpose |
| --- | --- | --- | --- |
| `app` | Nginx | `8080` | Serves the static HTML, CSS, and browser-side JavaScript. |
| `server` | Node.js and Express | `3000` | Calls NASA's APOD API and exposes the application API. |
| `mongo` | MongoDB | `27017` | Persists fetched-image records, users, and ratings. |

## Functionality

The web interface loads the current Astronomy Picture of the Day when the page opens. A visitor can:

- view either APOD images or embedded APOD videos;
- see the title, date, explanation, and attribution returned by NASA;
- open the high-resolution image or original video;
- select any valid date from June 16, 1995 through today; and
- retry a failed request.

The browser requests `GET /api/nasaimage` from the Express server. The server forwards the request to NASA with the configured API key, normalizes the NASA response for the UI, and creates a MongoDB image record the first time it encounters a media URL.

The API also contains user and rating routes. These routes are not currently connected to the web interface, but they can be called directly:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Basic server response. |
| `GET` | `/api/nasaimage` | Fetch today's APOD. Pass `?date=YYYY-MM-DD` for another date. |
| `POST` | `/api/user` | Create a user/rating record from an `email` in the JSON body. |
| `GET` | `/api/user/:id` | Fetch a user record by MongoDB document ID. |
| `PATCH` | `/api/user/:id/:image_id` | Set a user's rating using a numeric `rating` from 0 through 5. |
| `DELETE` | `/api/user/:id` | Delete a user record. |
| `GET` | `/api/ratings` | Fetch ratings for the `email` supplied in the JSON request body. |

## Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose v2 (the `docker compose` command)
- A [NASA API key](https://api.nasa.gov/)

No local Node.js or MongoDB installation is needed when running the full stack with Docker Compose.

## Run the application

1. Clone the repository and enter it:

   ```bash
   git clone <repository-url>
   cd ao-bk-playground
   ```

2. Create a `.env` file in the repository root:

   ```dotenv
   API_TOKEN=your_nasa_api_key
   ```

   `.env` is ignored by Git. Do not commit the NASA key.

3. Build and start all three services:

   ```bash
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

`docker compose down` stops and removes the containers and network but retains the named MongoDB data volume. Use `docker compose down --volumes` only when you also want to delete the locally stored application data.

### Configuration

Docker Compose accepts these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `API_TOKEN` | none | NASA API key. Required for APOD requests. |
| `PORT` | `3000` | Port used by Express inside the server container. The Compose host mapping remains `3000:3000`, so changing this alone also requires updating that mapping. |
| `MONGO_HOST` | `mongodb://mongo:27017/bk` | MongoDB connection string used by Mongoose. |
| `APP_ENV` | `test` | Application environment value passed to the server. |
| `API_HOST` | `localhost` | Reserved server configuration value; the current code does not read it. |

The frontend currently has `http://localhost:3000/api/nasaimage` hard-coded in `app/render.js`. That is appropriate for local browser use, but a remote deployment needs either a configurable API URL or an Nginx reverse proxy.

## Architecture and request flow

1. The browser opens port `8080`, where the `app` container's Nginx process serves `index.html`, `styles.css`, and `render.js`.
2. Browser-side JavaScript calls the Express API through the host's port `3000`. CORS is enabled on the API to allow this separate origin.
3. Express calls `https://api.nasa.gov/planetary/apod`, passing `API_TOKEN` as NASA's `api_key` and requesting video thumbnails.
4. Express converts NASA's response into a consistent object for image and video rendering.
5. The server connects to MongoDB at the Compose DNS name `mongo` and stores a record for a newly encountered media URL.
6. The browser renders the media and metadata returned by Express.

Compose places all containers on the private `app-network`. Service-name DNS lets the server reach `mongo:27017`. The static frontend does not use container DNS because its JavaScript executes in the user's browser; it reaches the API through the published host port instead.

MongoDB data is stored in the named `data-volume`, so it survives normal container recreation. The `server` source directory is bind-mounted into its container, and `nodemon` runs the API, so server-side edits made locally are reloaded during development.

## Buildkite implementation

The pipeline is defined in [`.buildkite/pipeline.yml`](.buildkite/pipeline.yml). The Buildkite pipeline must be configured to upload this file, and its agents need access to the checked-out repository, a running Docker daemon, and the Docker Compose v2 plugin. The `secrets` syntax also requires Buildkite Agent 3.106.0 or newer.

### Pipeline steps

#### 1. Check Docker

```yaml
- label: ":docker: Check Docker"
  command: |
    command -v docker
    docker version
    docker compose version
```

This checks that `docker` is on the agent's `PATH`, that the agent can communicate with its Docker daemon, and that the Compose v2 subcommand is installed. Any command returning a non-zero status fails the step.

#### 2. Validate Compose

```yaml
- label: ":docker: Validate Compose"
  command: "docker compose config"
```

`docker compose config` parses the Compose file, resolves variable interpolation, and prints the fully merged configuration. It catches invalid Compose syntax before the stack is started. Because it prints resolved configuration, agents should avoid placing secrets in their global environment; the NASA secret is scoped only to the later smoke-test step.

#### 3. Build images

```yaml
- label: ":docker: Build images"
  key: "build-images"
  command: "docker compose build"
```

This builds the two repository-owned images:

- `app/Dockerfile` starts from `nginx:1.27-alpine` and copies the static frontend into Nginx's document root.
- `server/Dockerfile` starts from `node:12.14`, installs the npm dependencies, copies the API source, exposes port `3000`, and starts the server with `npm start`.

MongoDB is pulled as a prebuilt image rather than built locally. The `build-images` key gives later steps a stable dependency name. Buildkite steps can run on different agents, so locally built Docker images are not automatically transferred from this step to the smoke-test agent.

#### 4. Compose smoke test

```yaml
- label: ":docker: Smoke test"
  key: "compose-smoke-test"
  depends_on: "build-images"
  concurrency: 1
  concurrency_group: "nasa-image-app"
  secrets:
    API_TOKEN: NASA_API_TOKEN
  command: |
    set -euo pipefail
    docker compose up --build --detach
```

This step has several important behaviors:

- `depends_on: build-images` prevents it from starting until the image-build step succeeds.
- `secrets` reads the cluster-scoped Buildkite secret named `NASA_API_TOKEN` and exposes it to the job as `API_TOKEN`. Compose substitutes that value into the server container's environment. The secret must exist in the agent's Buildkite cluster and its access policy must permit this pipeline.
- `set -euo pipefail` makes the shell stop on command failure, unset-variable usage, or a failed command inside a pipeline.
- `docker compose up --build --detach` rebuilds on the smoke-test agent, creates the network and volume, and starts the three containers in the background. Rebuilding here is important if the earlier build ran against another agent's Docker daemon.
- `concurrency: 1` with the shared `nasa-image-app` group permits only one smoke-test job in that organization-wide group to run at a time. This serializes the setup commands that use fixed container names (`bk_app` and `bk_server`) and fixed host ports.

Buildkite command steps without explicit dependencies can run in parallel. Consequently, **Check Docker**, **Validate Compose**, and **Build images** do not form a sequential chain in the current file. The smoke test waits only for **Build images**; the overall build can still fail independently if either of the two diagnostic steps fails.

### What the current smoke test proves

The active smoke-test command proves that Compose can build/create the services and ask Docker to start them. It does not currently wait for application readiness, inspect container health, make an HTTP request, or stop the stack afterward. Detached containers therefore remain on the host unless the host environment is ephemeral or another cleanup mechanism removes them. The concurrency slot is released as soon as the detached `up` command finishes, so it does not reserve the running stack for a later test step.

The pipeline contains a commented-out `UI/API test` step with `curl` commands for ports `8080` and `3000`. Enabling it would add basic HTTP reachability checks, but a robust CI implementation should also add service health checks or retry logic and an always-run cleanup such as:

```bash
docker compose down --remove-orphans
```

Cleanup must run even when an assertion fails, typically via an agent hook or a shell `trap`. This prevents stale containers from occupying the fixed ports and blocking subsequent builds.

### Buildkite setup checklist

1. Create a Buildkite pipeline connected to this repository and configure it to load `.buildkite/pipeline.yml`.
2. Attach a self-hosted or hosted agent running Buildkite Agent 3.10.6 or newer that supports Docker workloads and has Docker Compose v2.
3. Add a `NASA_API_TOKEN` secret to the agent cluster, store the NASA API key as its value, and allow this pipeline in the secret access policy. See [Buildkite secrets](https://buildkite.com/docs/pipelines/security/secrets/buildkite-secrets).
4. Ensure the agent user can access the Docker daemon and bind host ports `8080`, `3000`, and `27017`.
5. Trigger a build and inspect each step's logs. The smoke-test step should show all three Compose services being created and started.

## Repository layout

```text
.
├── .buildkite/pipeline.yml  # Buildkite pipeline
├── app/                     # Static Nginx frontend
│   ├── Dockerfile
│   ├── index.html
│   ├── render.js
│   └── styles.css
├── server/                  # Express/Mongoose API
│   ├── schemas/             # MongoDB models
│   ├── controller.js
│   ├── db.js
│   ├── Dockerfile
│   ├── index.js
│   ├── package.json
│   └── router-app.js
└── docker-compose.yml       # Local and CI service orchestration
```

## Current limitations

- There is no automated test suite (`npm test` is a placeholder that exits with an error).
- The active Buildkite smoke test starts the stack but does not verify HTTP responses or clean up containers.
- Compose startup ordering checks that a dependency container has started, not that MongoDB or the API is ready.
- The frontend API URL is fixed to `localhost:3000`.
- The user/rating API is not exposed through the current UI.
- The server image uses Node.js 12, which is end-of-life and should be upgraded before production use.

This repository is intended as a Buildkite and Docker Compose playground rather than a production deployment template.

Buildkite pipeline tam-sandbox/ao-nasa-img 
