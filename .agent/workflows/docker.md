---
description: How to build and run pinokiod in a Docker container
---

## Build the Docker Image

// turbo

1. Build the image from the project root:

```bash
docker build -t pinokiod .
```

## Run the Container

2. Run with a persistent volume:

```bash
docker run -d --name pinokiod -p 8080:8080 -v pinokio_data:/data/pinokio pinokiod
```

3. Open the browser at `http://localhost:8080`

## Docker Environment Variables

| Variable                    | Default         | Description                        |
| --------------------------- | --------------- | ---------------------------------- |
| `PINOKIO_HOME`              | `/data/pinokio` | Data directory inside container    |
| `PINOKIO_HTTPS_ACTIVE`      | `1`             | Enable HTTPS                       |
| `PINOKIO_NETWORK_ACTIVE`    | `1`             | Enable P2P networking              |
| `PINOKIO_PROGRESS_STEP`     | `5`             | Extraction progress step %         |
| `PINOKIO_PROGRESS_INTERVAL` | `1`             | Progress update interval (seconds) |

## Useful Docker Commands

// turbo 4. View logs:

```bash
docker logs -f pinokiod
```

5. Stop the container:

```bash
docker stop pinokiod
```

6. Remove the container:

```bash
docker rm pinokiod
```

## Notes

- The Docker build pre-seeds the Pinokio home directory from GitHub repos (network, code, proto)
- First run extracts `~7.7MB` compressed seed archive into the volume
- Port `8080` is exposed (mapped from the internal Express server)
- The volume at `/data/pinokio` persists all AI app installations and data
- GPU passthrough requires `--gpus all` flag for NVIDIA containers
