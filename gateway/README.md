# Pi gateway

The Go gateway runs on `raspberry-pi-5`. Mosquitto is on the same Pi at
`192.168.1.119:1883`; the Athom/Tasmota meter at `192.168.1.100` powers the Pi.
Infrastructure monitoring continues when the DGX Spark and Olla are offline.

For the separate DGX Spark Singapore plug, admin/operator controls, SSH setup and
attended shutdown calibration, follow [Spark power setup](docs/spark-power.md).
Spark controls enforce a three-minute off interval and five-minute ready interval,
drain existing inference before shutdown, and respect a Spark maintenance lock.
The persistent `spark-power-state` Compose volume stores the safety journal;
do not remove it during updates. Existing Spark installations must upgrade the
restricted helper to protocol version 2 before shutdown is available.

```text
gateway/
  api/                         Go module and Docker build context
    main.go                    Starts the HTTP server and routes
    internal/ai/               Inference authentication, model routing, usage,
                               prompts, multimodal requests and capacity status
    internal/infra/power/      Requests fresh readings from Tasmota over MQTT
    go.mod / go.sum
    Dockerfile
  config/olla.yaml             AI upstream configuration
  .env.example                Canonical gateway environment template
  env.example                 Compatibility copy of the same settings
  docker-compose.yml
  system-prompt.md
```

## Configure and run on the Pi

From `gateway/`, copy `.env.example` to `.env` and fill in the secrets. Existing
`.env` files are not modified automatically. Every gateway setting is documented
in `.env.example`; Next.js has its own template at the repository root.

```sh
cd gateway
# Preserve an existing .env file when updating.
[ -f .env ] || cp .env.example .env
nano .env
```

Generate the monitoring read key with `openssl rand -hex 32` and put the same
value in gateway `INFRA_READ_KEY` and Next.js `INFRA_GATEWAY_READ_KEY`.

Keep your existing AI settings and add the meter connection:

```dotenv
INFRA_READ_KEY=<distinct-random-secret>
MQTT_BROKER_URL=tcp://192.168.1.119:1883
MQTT_USERNAME=tasmota
MQTT_PASSWORD=<broker-password>
MQTT_CLIENT_ID=dgx-gateway-pi-power
TASMOTA_TOPIC=pi_power
```

```sh
docker compose up -d --build
```

Verify the container and listener from the Pi:

```sh
docker compose ps
docker compose logs --tail=50 api
curl --fail http://127.0.0.1:50080/healthz
```

`/healthz` returns `ok`. Open Admin → Infrastructure to see live readings.
When changing gateway `.env`,
run `docker compose up -d --build api` again to recreate the service with the new
environment; a plain `docker compose restart` does not load changed variables.

Compose restarts containers unless stopped. Enable Docker and Mosquitto at Pi
boot. The API binds to Pi loopback port 50080 by default; use the existing tunnel
or an SSH port forward to access it remotely. MQTT uses the Pi's LAN address from
inside Docker; `localhost` there would refer to the Go container.

## Connect the frontend

The panel is at `/admin/infra`, linked from the existing Admin navigation. It
requires an active admin account. The browser calls the authenticated Next.js
route `/api/admin/infra/pi-power`; only the Next.js server holds the gateway key.

Set these in the root `.env` for local Next.js, or the frontend's Vercel project
environment, then restart/redeploy Next.js:

```dotenv
INFRA_GATEWAY_URL=https://api.dgxspark.dev
INFRA_GATEWAY_READ_KEY=<same-value-as-gateway-INFRA_READ_KEY>
```

The example public hostname must route to **the gateway on the Pi**, including
`/infra/pi-power`. The host-installed cloudflared example forwards to
`http://127.0.0.1:50080`, matching Compose's loopback binding. If cloudflared runs
in another container, use the Go service's Docker-network address `http://api:8080`
instead. Keep the existing AI URL pointed at the appropriate gateway too.

Vercel cannot connect directly to `192.168.1.119`. Use the tunnel/public HTTPS
endpoint for a Vercel frontend. For development from Windows without a tunnel,
forward the Pi's loopback API port over SSH:

```sh
ssh -N -L 50080:127.0.0.1:50080 <pi-user>@192.168.1.119
```

Then set local Next.js `INFRA_GATEWAY_URL=http://127.0.0.1:50080`.
The Tasmota IP (`192.168.1.100`) and the MQTT port (`1883`) are not HTTP gateway URLs.

The panel requests a fresh reading every second while visible, with only one
request in flight. Each request queries the plug and waits for its response.
Missing readings display a dash; connection failures clear the values and retry.
There are no stale-reading labels or cached readings presented as live.
An AI outage does not block the power endpoint; the frontend's admin session check
still requires the account database, as it does for the other admin pages.

## Telemetry

Each GET connects to Mosquitto, subscribes to `stat/pi_power/STATUS10`, sends
`10` to `cmnd/pi_power/Status` without retaining it, waits for a sensor response,
and disconnects. Requests are serialized because Tasmota replies have no request
ID. The entire read, including any queue wait, has a five-second deadline.
Retained messages and malformed responses cannot satisfy a read.

The MQTT account needs permission to subscribe to `stat/pi_power/STATUS10` and
publish to `cmnd/pi_power/Status`. No relay command is sent and no `TelePeriod`
change is needed. The standard FullTopic `%prefix%/%topic%/` is assumed.

## HTTP contract

`GET /infra/pi-power` requires `Authorization: Bearer <INFRA_READ_KEY>`.
The read key is independent of the AI service keys and requires no database.
The route accepts GET/HEAD only and returns `Cache-Control: no-store`.

Example response shape (illustrative values, not measurements from your device):

```json
{
  "device": "raspberry-pi-5",
  "mqtt_connected": true,
  "device_status": "online",
  "stale": false,
  "received_at": "2026-09-07T12:00:00Z",
  "age_seconds": 0,
  "device_time": "2026-09-07T20:00:00",
  "retained": false,
  "relay_present": false,
  "relay_state": null,
  "power_w": 12.5,
  "voltage_v": 230,
  "current_a": 0.054,
  "energy_today_kwh": 0.12,
  "energy_yesterday_kwh": 0.3,
  "energy_total_kwh": 42
}
```

Missing fields stay null; zero is a valid measurement. The plug has no relay.
Energy totals come from the meter, are not summed per sample,
and may reset with device configuration. Daily boundaries follow the meter's
clock. Historical storage and charts are outside this version.

HTTP 200 contains the fresh response. A connection failure returns 503; a read
that reaches its deadline returns 504. Neither returns an old measurement.
HEAD checks authentication without querying the plug. `received_at` is the
gateway's UTC receipt time. Connection/status fields describe the successful read.
Powering off the Pi also stops this API; an external observer is needed to
detect a complete Pi outage.

`/healthz` remains process liveness. `/status` remains AI capacity; it can say
sleeping while power telemetry is healthy. Unknown `/infra/` paths never enter
the inference handler. Invalid configuration is a startup error, but unavailable
MQTT or PostgreSQL is not. Database connections are acquired on demand and
retried by the pool on later requests; database authentication failures return
503 rather than pretending credentials are invalid.

## Windows development and verification

Go development does not require the Pi. With Go 1.22+ installed, from `gateway/api`:

```sh
go vet ./...
go build .
```

Set process environment variables before native execution: the binary does not
load `.env` itself. When testing inference natively, use
`OLLA_URL=http://127.0.0.1:40114` instead of the Docker service name.
For a Linux ARM64 build, set `GOOS=linux GOARCH=arm64 CGO_ENABLED=0` for `go build`.
Docker builds on a 64-bit Pi natively without a separate architecture setting.

Final Pi checks: confirm actual STATUS10 fields, check readings through the
HTTP endpoint, stop/restart Mosquitto and observe failure/recovery, and verify
telemetry with the DGX Spark off. Also test startup with PostgreSQL unavailable.
Never interrupt power to the Pi as part of these checks.

Protocol references: [Tasmota MQTT](https://tasmota.github.io/docs/MQTT/),
[Tasmota commands](https://tasmota.github.io/docs/Commands/),
[Eclipse Paho Go](https://github.com/eclipse-paho/paho.mqtt.golang).
