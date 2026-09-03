FROM buildkite/agent:3-ubuntu

USER root

# The acquired pipeline job builds and pushes images through the Docker socket
# mounted from the host, so the agent image only needs the Docker client.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*
