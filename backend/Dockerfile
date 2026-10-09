# NetRouteAI backend — a Python runtime, the Docker CLI, and no application code.
#
# The code is deliberately not baked in. `docker-compose.yml` at the repo root
# bind-mounts the checked-out `backend/` at the *same* absolute path inside the
# container as on the host and runs this image's uvicorn from there. That is a
# requirement, not a convenience:
#
#   POST /api/lab/deploy writes `backend/labs/current/docker-compose.yml` with
#   relative bind mounts ("./r1/frr.conf:/etc/frr/frr.conf") and then runs
#   `docker compose up` *from inside this container*. Compose resolves those
#   relative paths where it executes — here — but the Docker daemon resolves
#   the resulting absolute path on the *host*. The only way those are the same
#   file is if the path is identical on both sides. Copying the code in would
#   give a second, dead copy at /app that never runs; leaving it out makes the
#   mount obvious instead of incidental.
#
# Build context is therefore just this file plus requirements.txt.

FROM python:3.14-slim

# The Docker CLI, because this process is not only an API server: it drives the
# lab. `docker compose up` builds the routers, `docker exec` runs vtysh, ping
# and the interface reads inside them, and every figure on the Analytics page
# comes from those execs. The daemon socket is mounted by docker-compose.yml;
# the CLI and the compose plugin installed here are what speak over it.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://download.docker.com/linux/debian/gpg \
        -o /etc/apt/keyrings/docker.asc; \
    chmod a+r /etc/apt/keyrings/docker.asc; \
    . /etc/os-release; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin; \
    rm -rf /var/lib/apt/lists/*; \
    docker compose version

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# `uvicorn main:app` resolves `main` from the working directory, which
# docker-compose.yml sets to the mounted backend/ — there is no main.py in this
# image to find, and that is intended.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
