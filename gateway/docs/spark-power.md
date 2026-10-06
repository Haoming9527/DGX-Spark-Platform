# DGX Spark Singapore power control

The Pi gateway reads and switches the plug at `192.168.1.126`, MQTT topic
`dgx_spark_sg_power`, using the existing Pi Mosquitto broker. It requests a normal
Spark shutdown over SSH before considering relay cutoff. The Pi meter remains
read-only and uses its own topic and MQTT connection.

Admins see the Spark card under **Admin → Infrastructure**. Operators see the
same card on **Power** (`/power`), in addition to normal user features. Operators do
not gain access to Pi readings or other admin pages. Authentication checks the
account's current role and disabled status on every request.

## 1. Prepare the network and Spark

Reserve the Spark's LAN IP in your router. Set `DGX_SPARK_HOST` and `DGX_SPARK_IP`
in `gateway/.env`; Compose uses them for the API container's `extra_hosts` mapping.
Set `DGX_SPARK_SSH_ADDR=${DGX_SPARK_HOST}:22` to reuse the hostname for SSH.
Neither the hostname nor LAN IP is hardcoded in YAML. Missing mapping values use
an unused placeholder on container loopback; configure both for Spark access.
Keep the IP aligned with the reservation; Docker does not automatically
use the Pi's Avahi resolver. The gateway SSH address includes `:22`. The plug
must supply only the Spark. Keep its MQTT host/user/password pointing at your
existing Pi broker, with port `1883` and topic `dgx_spark_sg_power`.

On the Spark, check **UEFI → Advanced → Power On Behavior → After Power Loss
Behavior → Auto Boot** so restoring AC starts the machine. NVIDIA describes
this in the [Spark UEFI guide](https://docs.nvidia.com/dgx/dgx-spark-uefi/advanced-tab.html).
Check the plug for independent timers/rules and old retained relay commands.
Platform permissions cannot prevent someone who has direct plug/MQTT access
from switching it independently.

Use your existing trusted SSH connection, `ssh haoming@spark-2c12.local`. The setup
below uses that account only for installation. The running gateway receives a
separate restricted key; it never receives your login password or personal key.
No agent, Python package, or new SSH server is required on the Spark. Its existing
Linux tools must include `sudo`, OpenSSH utilities, and `busctl` with a running
systemd-logind that supports `PowerOffWithFlags`. The installer checks support
without requesting shutdown and stops if it is missing.

## 2. Generate a dedicated key on the Pi

Run these commands in the repository's `gateway/` directory **on the Pi**:

```sh
mkdir -p secrets
chmod 755 secrets
# Run once. Keep an existing key when updating this deployment.
test -f secrets/spark_power_ssh_key || ssh-keygen -t ed25519 -N '' \
  -C 'raspberry-pi-5 spark-power' -f secrets/spark_power_ssh_key
```

`gateway/secrets/` is gitignored. The unencrypted private key stays on the Pi so
the gateway can use it unattended. Only the public `.pub` file is copied to the
Spark. The installed key cannot run arbitrary commands or forward connections.

## 3. Install the restricted SSH helper on the Spark

From the same Pi directory:

```sh
ssh haoming@spark-2c12.local 'mkdir -p ~/spark-power-setup'
scp ops/spark/install.sh ops/spark/spark-power-command ops/spark/spark-power-helper \
  secrets/spark_power_ssh_key.pub haoming@spark-2c12.local:~/spark-power-setup/
ssh -t haoming@spark-2c12.local \
  'sudo sh ~/spark-power-setup/install.sh ~/spark-power-setup/spark_power_ssh_key.pub'
```

The installer creates the password-locked `spark-power` system account and:

- Makes `/var/lib/spark-power` and its `.ssh/authorized_keys` root-owned. The account
  cannot replace its key restrictions or add a shell startup file.
- Installs a forced-command wrapper with OpenSSH's `restrict` option. Only
  `status` and `shutdown <expected-boot-UUID>` are accepted; shell, PTY, user RC, agent,
  X11 and port forwarding are unavailable through this key.
- Installs a root-owned helper and narrowly scoped sudoers entries. The wrapper
  and root helper both require exactly one valid boot UUID for shutdown; the
  helper compares it with the current boot before acting. `status` returns
  protocol version 2, `boot_id`, system state, uptime and maintenance-lock state.
  `shutdown` checks the maintenance lock and blocking shutdown inhibitors, then
  requests normal shutdown through logind `PowerOffWithFlags` with flag `1`
  (`SD_LOGIND_ROOT_CHECK_INHIBITORS`). It returns
  `{"protocol_version":2,"accepted":true,"boot_id":"..."}` only after successful
  command exit. The sudoers argument wildcard cannot bypass the helper's validation.

Installation never shuts down the Spark and does not alter your existing SSH
daemon configuration or personal account. Re-running with a new public key
replaces this dedicated account's key; unrelated existing accounts are refused.
The Spark's SSH configuration must permit public-key access for `spark-power`
and its normal `.ssh/authorized_keys`. If you maintain an `AllowUsers` list, add
`spark-power` alongside its existing entries; do not loosen global authentication.

This avoids `systemctl --check-inhibitors=yes` rejecting the helper's own SSH
session. Logged-in desktop/SSH sessions alone do not block an authorized shutdown;
save work before confirming. Blocking shutdown inhibitors (including root-owned
locks) are checked first, and logind checks inhibitors again and handles delay
inhibitors. A failed check or request produces no acknowledgement. There is no
fallback to `poweroff -i`, forced shutdown, or inhibitor bypass.
See the [logind API documentation](https://github.com/systemd/systemd/blob/main/man/org.freedesktop.login1.xml).
Success means the shutdown was accepted, not that disks have finished unmounting.

## 4. Pin the Spark's SSH host identity

On the Pi, use the same hostname as the gateway SSH address:

```sh
SPARK_HOST=spark-2c12.local
```

Obtain the expected fingerprint through your already trusted Spark connection
or directly at the Spark console:

```sh
ssh haoming@spark-2c12.local 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
```

Collect the candidate key (the Pi must resolve this hostname too):

```sh
ssh-keyscan -T 5 -t ed25519 "$SPARK_HOST" > secrets/spark_known_hosts.candidate
ssh-keygen -lf secrets/spark_known_hosts.candidate
```

**Compare the SHA256 fingerprint against the trusted result.** A scan alone does
not verify identity. Only after they match, install the pinned key and make a
read-only status request:

```sh
mv secrets/spark_known_hosts.candidate secrets/spark_known_hosts
ssh -F /dev/null -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$PWD/secrets/spark_known_hosts" \
  -i secrets/spark_power_ssh_key "spark-power@$SPARK_HOST" status
```

Expected response:
`{"protocol_version":2,"boot_id":"<UUID>","state":"running","uptime_seconds":123.45,"maintenance_locked":false}`
(or `degraded` if a system service has failed). This command does not change power. Do not disable
host verification if it fails; correct the address or verify a legitimately
replaced host key through the trusted connection.

The gateway image runs as UID/GID `65532`. Give that user read access to the key
without making the key readable to other host users:

```sh
sudo chown 65532:65532 secrets/spark_power_ssh_key secrets/spark_known_hosts
sudo chmod 600 secrets/spark_power_ssh_key
sudo chmod 644 secrets/spark_known_hosts
```

Compose mounts `./secrets` at `/run/secrets` read-only. Later CLI key checks need
`sudo ssh ...` after this ownership change. These ownership settings assume the
provided standard Docker configuration, without custom user namespace remapping.

## 5. Configure the gateway and frontend

Generate a new control secret with `openssl rand -hex 32`. Set it in gateway `.env`
as `INFRA_CONTROL_KEY` and in Next.js as `INFRA_GATEWAY_CONTROL_KEY`. It must differ
from the Pi read key, both AI service keys, and MQTT password. Keep all keys
server-side; none uses a `NEXT_PUBLIC_` name.

Add to the existing `gateway/.env` (replace the address and control secret):

```dotenv
INFRA_CONTROL_KEY=<new-control-secret>
DGX_SPARK_TASMOTA_TOPIC=dgx_spark_sg_power
DGX_SPARK_HOST=spark-2c12.local
DGX_SPARK_IP=192.168.1.105
DGX_SPARK_SSH_ADDR=${DGX_SPARK_HOST}:22
DGX_SPARK_SSH_USER=spark-power
DGX_SPARK_SSH_KEY_FILE=/run/secrets/spark_power_ssh_key
DGX_SPARK_SSH_KNOWN_HOSTS_FILE=/run/secrets/spark_known_hosts
DGX_SPARK_OFF_MAX_WATTS=
DGX_SPARK_STATE_DIR=/var/lib/dgx-spark-power
```

Keep the existing MQTT settings and `TASMOTA_TOPIC=pi_power`. The Spark controller
derives its own MQTT client ID so it does not disconnect Pi readings. Its broker
ACL needs subscription to `stat/dgx_spark_sg_power/#` and publication to the Spark's
`cmnd/dgx_spark_sg_power/Status` and `cmnd/dgx_spark_sg_power/POWER` topics. No generic
MQTT command or Pi relay control endpoint is exposed.

Compose mounts the named `spark-power-state` volume at `/var/lib/dgx-spark-power`.
The image prepares this directory for its non-root UID `65532`; a new volume
inherits that ownership. The container path is fixed in Compose. For native Go
execution, set `DGX_SPARK_STATE_DIR` to a persistent directory writable only by
the gateway user. Do not use a temporary directory or run multiple controllers
for one plug. A lock prevents two processes sharing this directory, not two
controllers with unrelated directories.
Physical power control requires Linux for the filesystem locking and durability
checks used by the Pi deployment. Windows can be used for development and readings;
do not configure it as a second controller for the real plug.

Keep `DGX_SPARK_OFF_MAX_WATTS` empty until calibration. Shutdown remains blocked,
while configured readings and power-on remain available. Missing Spark settings
do not prevent existing Pi readings from working.

In the root Next.js environment or Vercel project, set:

```dotenv
INFRA_GATEWAY_URL=https://api.dgxspark.dev
INFRA_GATEWAY_CONTROL_KEY=<same-control-secret>
```

Keep the existing `INFRA_GATEWAY_READ_KEY` for both Pi and Spark readings;
`INFRA_GATEWAY_CONTROL_KEY` authorizes Spark actions only. The existing HTTPS
tunnel must route `/infra/dgx-spark` and `/infra/dgx-spark/actions` to the Pi API.
The frontend's requests use `/api/infra/dgx-spark` and its `/actions` route. Both
require an active admin or operator; POST additionally requires same-origin access.

Apply [schema.sql](../../schema.sql) to the same database used by Next.js. It preserves
existing data and updates the operator-role constraint. Run it in the Neon SQL editor,
or from the repo root using an already configured database connection:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
```

Then deploy Next.js and rebuild the Pi gateway from `gateway/`:

```sh
docker compose up -d --build api
docker compose logs --tail=50 api
```

Assign the **Operator** role from **Admin → Users**. No password or signup changes
are required. Use the live card for the attended calibration below.

## 6. Calibrate the fully-off power threshold

1. While the Spark runs normally, record the lowest stable idle wattage shown by
   the plug. Also account for any suspend/low-power modes you actually use.
2. Stop running work and perform an attended normal OS shutdown using the Spark's
   desktop or your existing administrator SSH connection. **Leave the plug relay
   ON.** Confirm physically that the machine has finished shutting down.
3. Observe fresh plug readings for at least two minutes while the Spark is fully
   off. Choose a threshold above the highest off-state reading plus meter
   tolerance, clearly below the lowest powered-on/suspended reading. There is no
   universal safe wattage; do not copy a guessed number from another machine.
4. If those ranges overlap or the plug reports unreliable/missing measurements,
   leave the threshold empty. The gateway cannot infer completed shutdown safely
   from that meter.
5. Put the measured threshold in `DGX_SPARK_OFF_MAX_WATTS`, then run
   `docker compose up -d api` to load the changed environment. Power the Spark back
   on using its physical button for this initial calibration.

The first **Shut down & power off** operation should be attended. After the
request-draining step described below, the gateway
requires an acknowledged shutdown, SSH unavailability, and fresh wattage samples
below the threshold for 60 continuous seconds. It samples every two seconds and
abandons cutoff after ten minutes. High wattage resets the observation window;
meter connection loss, missing samples or failed acknowledgement leave AC supplied.
The sensor timestamps must advance with each shutdown sample. Missing, repeated,
or regressing timestamps cancel cutoff and leave AC supplied, even if watts are low.
A restart discards cutoff authority. There is no force-off or unconditional timer.
If the Spark is already unreachable while the relay is on, use your normal
administration path to investigate it; the UI will not infer that it is shut down.

This meter check is a practical safeguard, not absolute proof of a completed OS
shutdown. A low reading or failed network connection alone never authorizes cutoff.

## 7. Cooldowns and protecting AI work

After confirming the plug is off, the gateway requires **three minutes of
observed off time** before another power-on. After authenticated readiness for a
Spark boot, it requires a **five-minute cooldown** before allowing shutdown.
Missed checks block shutdown until fresh plug and SSH readings return. The countdown
is retained when the authenticated boot ID matches and uptime has not decreased;
confirmed power-off, reboot or a non-ready OS state restarts it.
These are precautionary platform policies, not NVIDIA-certified timing
requirements or a guarantee of hardware lifespan. There is no administrator bypass.

Accepting a shutdown request immediately closes admission to **new inference
requests**, which receive an OpenAI-style `503`. Already admitted requests,
including streaming responses, may finish for up to five minutes. If any remain,
the shutdown operation is cancelled and admission reopens; no OS shutdown or
relay command is sent. The shutdown-verification timeout starts only when the OS
shutdown request is sent, separately from this five-minute drain period.

Only a requested shutdown pauses inference; monitoring failures, startup and normal
cooldowns do not. An unresolved shutdown requires five continuous minutes of
authenticated readiness for one boot before admission reopens, including after a
gateway restart. Readings, authentication, model permissions, model listing and health
endpoints remain available while inference is blocked.

Power-on confirms the relay before waiting for authenticated SSH readiness. After
five minutes without readiness it reports that AC is on but the Spark is unavailable;
it never power-cycles. An already-powered but unreachable machine is not evidence
of completed shutdown and does not authorize an off/on cycle.
Shutdown keeps running in the Pi gateway if you close the browser. Repeat clicks
with the same request ID return the recorded operation, including after a restart
within the 24-hour deduplication window. During an operation the card shows its
latest sampled readings. Safety monitoring continues independently of the browser.

## 8. Maintenance and work outside the gateway

Gateway draining only covers inference that passes through this gateway. It cannot
discover unrelated training scripts, direct Ollama clients or detached background
jobs from its request counter. Low GPU use also does not prove work has finished.

Before firmware updates or critical maintenance, create this marker **on the Spark**:

```sh
sudo touch /var/lib/spark-power/maintenance.lock
sudo chown root:root /var/lib/spark-power/maintenance.lock
sudo chmod 644 /var/lib/spark-power/maintenance.lock
```

The parent directory is root-owned, so the restricted SSH account cannot remove
the marker. Status reports the lock, and the root helper checks it again immediately
before requesting shutdown. Admins and operators cannot bypass it through the web
UI. Set it **before starting the work**, not after shutdown has already been requested.
After completing maintenance, remove only the marker:

```sh
sudo rm -- /var/lib/spark-power/maintenance.lock
```

For a foreground critical job, a systemd shutdown inhibitor can protect its lifetime:

```sh
systemd-inhibit --what=shutdown --mode=block --who=spark-maintenance \
  --why='Critical Spark job is running' bash
# Run the job in this shell; exit only when it and its child jobs have finished.
```

If acquiring an inhibitor is denied, use the root-owned maintenance marker instead.
The helper respects inhibitors and never forces shutdown. These protections cannot
stop someone directly switching the plug off or physically disconnecting its supply.
Keep independent plug timers/rules disabled and restrict direct MQTT/plug access.

## 9. Persistent safety state and upgrades

The named volume stores `safety.json`, a small versioned JSON safety journal,
and the process-lock file `controller.lock`, not telemetry history.
It records command intentions before mutations, operation results and request IDs.
State updates are atomic and synchronized to disk. Disk errors block power controls;
an unresolved shutdown keeps inference paused. There is no Neon dependency
for this coordination.

After restart, unfinished operations become interrupted and are never resumed or
replayed. Fresh relay and SSH observations restart the full relevant cooldown;
saved wall-clock timestamps cannot shorten it. Unknown relay-command delivery is
reconciled with read-only queries. Corrupt state blocks control rather than silently
starting over. Do not run `docker compose down -v`, which removes the safety volume.

Gateway startup starts a new five-minute shutdown cooldown after the first ready
check. AI requests remain available unless a recorded shutdown is unresolved.
Uncertain shutdown recovery still requires uninterrupted readiness; ordinary
monitoring errors do not reset the same-boot cooldown.

For a state-directory error, inspect `docker compose logs --tail=100 api` and the
volume mount/ownership; the directory must belong to UID `65532` and be writable.
For corrupt state, stop `api`, preserve the complete volume for diagnosis, and have
an administrator inspect/repair it before restarting. If the administrator elects
to replace unrecoverable state, first confirm the machine/relay condition in person;
the replacement must remain subject to the full fresh observation intervals.
Never edit state to shorten a cooldown or restore a pending cutoff operation.

Upgrade an existing installation during an attended maintenance window:

1. Complete active work and update this checkout on the Pi.
2. Repeat **section 3** with the existing public key. This upgrades the wrapper,
   helper and sudoers entry together; it never shuts down the machine and preserves
   an existing maintenance marker. No new SSH key or host fingerprint is needed.
3. Make the read-only status request in **section 4** using `sudo ssh` after key
   ownership was changed. Confirm protocol version `2` and the new fields.
4. Rebuild with `docker compose up -d --build api`. Compose creates/mounts the
   persistent state volume. The old helper remains readable for power-on readiness,
   but shutdown is blocked until the protocol-2 helper is installed.
5. Deploy the frontend, wait for readiness/cooldowns, and run an attended acceptance
   cycle only after confirming the calibrated threshold and Auto Boot setting.

## 10. Acceptance checks

Check admin/operator access and confirm ordinary or disabled accounts cannot use
the routes. Verify operators cannot access Pi readings or user/model management.
On an attended maintenance run, verify shutdown completion before relay cutoff,
the full three-minute off interval, successful Auto Boot and the five-minute
running restriction. Check that new AI requests are rejected as soon as shutdown
is accepted, and a request-drain timeout leaves the Spark on. A maintenance marker
or active shutdown inhibitor must prevent the OS shutdown request from succeeding.
Review `docker compose logs api`
for the requesting account, operation and result. Hardware loss cases must leave
the relay supplied; a lost OFF confirmation is reported as an unknown power state
and followed by read-only queries, never a blind command replay.

The setup scripts can be inspected and shell syntax-checked without powering off
anything. Only the installer is run with sudo during setup; do not invoke the
`shutdown` helper directly as a setup check. Keep SSH keys and MQTT/control secrets
out of logs, screenshots, commits and support messages. Simulate crash, disk failure,
stale telemetry and lost acknowledgements with fake dependencies; do not induce
them by repeatedly cutting the real Spark's power.
