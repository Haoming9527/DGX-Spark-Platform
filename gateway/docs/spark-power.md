# DGX Spark Singapore power control

The Pi gateway reads and switches the plug at `192.168.1.126`, MQTT topic
`dgx_spark_sg_power`, using the existing Pi Mosquitto broker. It requests a normal
Spark shutdown over SSH before considering relay cutoff. The Pi meter remains
read-only and uses its own topic and MQTT connection.

Admins see the Spark card under **Admin → Infrastructure**. Operators see the
same card on **Spark Power**, in addition to normal user features. Operators do
not gain access to Pi readings or other admin pages. Authentication checks the
account's current role and disabled status on every request.

## 1. Prepare the network and Spark

Reserve the Spark's LAN IP in your router. Use that IP in the gateway SSH address:
Docker does not automatically resolve the Spark's `.local` hostname. The plug
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
Linux tools must include `sudo`, OpenSSH utilities, and systemd 248 or newer; the
installer checks the required command support and stops if it is missing.

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
- Installs a forced-command wrapper with OpenSSH's `restrict` option. Only the
  exact commands `status` and `shutdown` are accepted; shell, PTY, user RC, agent,
  X11 and port forwarding are unavailable through this key.
- Installs a root-owned helper and two exact sudoers commands. `status` returns
  JSON containing `boot_id` and system state. `shutdown` requests ordinary
  `systemctl --check-inhibitors=yes --no-ask-password poweroff`, then returns
  `{"accepted":true,"boot_id":"..."}` only after successful command exit.

Installation never shuts down the Spark and does not alter your existing SSH
daemon configuration or personal account. Re-running with a new public key
replaces this dedicated account's key; unrelated existing accounts are refused.
The Spark's SSH configuration must permit public-key access for `spark-power`
and its normal `.ssh/authorized_keys`. If you maintain an `AllowUsers` list, add
`spark-power` alongside its existing entries; do not loosen global authentication.

The explicit inhibitor option is intentional for a non-interactive call.
Systemd describes the behaviour in its
[systemctl documentation](https://github.com/systemd/systemd/blob/main/man/systemctl.xml).
Success means the shutdown was accepted, not that disks have finished unmounting.

## 4. Pin the Spark's SSH host identity

On the Pi, set a shell variable to the **reserved Spark IP**, not the plug's IP:

```sh
SPARK_IP=192.168.1.REPLACE
```

Obtain the expected fingerprint through your already trusted Spark connection
or directly at the Spark console:

```sh
ssh haoming@spark-2c12.local 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
```

Collect the candidate key from the reserved IP:

```sh
ssh-keyscan -t ed25519 "$SPARK_IP" > secrets/spark_known_hosts.candidate
ssh-keygen -lf secrets/spark_known_hosts.candidate
```

**Compare the SHA256 fingerprint against the trusted result.** A scan alone does
not verify identity. Only after they match, install the pinned key and make a
read-only status request:

```sh
mv secrets/spark_known_hosts.candidate secrets/spark_known_hosts
ssh -F /dev/null -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$PWD/secrets/spark_known_hosts" \
  -i secrets/spark_power_ssh_key "spark-power@$SPARK_IP" status
```

Expected response: `{"boot_id":"<UUID>","state":"running"}` (or `degraded` if a
system service has failed). This command does not change power. Do not disable
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
DGX_SPARK_SSH_ADDR=<reserved-Spark-IP>:22
DGX_SPARK_SSH_USER=spark-power
DGX_SPARK_SSH_KEY_FILE=/run/secrets/spark_power_ssh_key
DGX_SPARK_SSH_KNOWN_HOSTS_FILE=/run/secrets/spark_known_hosts
DGX_SPARK_OFF_MAX_WATTS=
```

Keep the existing MQTT settings and `TASMOTA_TOPIC=pi_power`. The Spark controller
derives its own MQTT client ID so it does not disconnect Pi readings. Its broker
ACL needs subscription to `stat/dgx_spark_sg_power/#` and publication to the Spark's
`cmnd/dgx_spark_sg_power/Status` and `cmnd/dgx_spark_sg_power/POWER` topics. No generic
MQTT command or Pi relay control endpoint is exposed.

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

Apply [the role migration](../../sql/migrations/20260928_operator_role.sql) to the
same database used by Next.js. Run it once in the Neon SQL editor, or from the repo
root using an already configured database connection:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/migrations/20260928_operator_role.sql
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

The first **Shut down & power off** operation should be attended. The gateway
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

## Operation and acceptance checks

Power-on confirms the relay before waiting for SSH. After five minutes without
SSH it reports that AC is on but the Spark is unavailable; it never power-cycles.
Shutdown keeps running in the Pi gateway if you close the browser. Repeat clicks
reuse the active operation. During an operation the card shows its latest sampled
readings; otherwise opening/polling the card requests fresh readings.

Check admin/operator access and confirm ordinary or disabled accounts cannot use
the routes. Verify operators cannot access Pi readings or user/model management.
On an attended maintenance run, verify shutdown completion before relay cutoff,
and confirm that restoring AC boots the Spark. Review `docker compose logs api`
for the requesting account, operation and result. Hardware loss cases must leave
the relay supplied; a lost OFF confirmation is reported as an unknown power state
and followed by read-only queries, never a blind command replay.

The setup scripts can be inspected and shell syntax-checked without powering off
anything. Only the installer is run with sudo during setup; do not invoke the
`shutdown` helper directly as a setup check. Keep SSH keys and MQTT/control secrets
out of logs, screenshots, commits and support messages.
