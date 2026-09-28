#!/bin/sh
# Run on the Spark with sudo. This installs files; it never requests shutdown.
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
export LC_ALL=C
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail 'Run with sudo on the DGX Spark.'
[ "$#" -eq 1 ] || fail 'Usage: sudo sh install.sh /path/to/spark_power_ssh_key.pub'
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
public_key=$1
account=spark-power
account_home=/var/lib/spark-power
marker=$account_home/.managed-by-dgx-gateway

for executable in /usr/bin/systemctl /usr/bin/ssh-keygen /usr/bin/sudo /usr/sbin/visudo /usr/sbin/useradd /usr/sbin/usermod; do
    [ -x "$executable" ] || fail "Missing dependency: $executable"
done
[ -f /proc/sys/kernel/random/boot_id ] || fail 'A running Linux system is required.'
/usr/bin/systemctl --help | grep -q -- '--check-inhibitors=' || fail 'systemd 248+ with --check-inhibitors is required.'
[ -f "$public_key" ] || fail 'Public key file not found.'
[ "$(awk 'NF {count++} END {print count+0}' "$public_key")" -eq 1 ] || fail 'Supply exactly one Ed25519 public key.'
key=$(awk 'NF {print $1 " " $2}' "$public_key")
printf '%s\n' "$key" | grep -Eq '^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$' || fail 'Generate a plain Ed25519 public key without key options.'
/usr/bin/ssh-keygen -l -f "$public_key" >/dev/null || fail 'Invalid SSH public key.'
[ -f "$script_dir/spark-power-command" ] && [ -f "$script_dir/spark-power-helper" ] || fail 'Keep both helper files beside install.sh.'

# Never repurpose an existing human/service account or grant it these privileges.
if getent passwd "$account" >/dev/null; then
    [ -f "$marker" ] && [ ! -L "$marker" ] && [ "$(stat -c %u "$marker")" -eq 0 ] || fail 'Existing spark-power account is not managed by this installer.'
    [ "$(getent passwd "$account" | cut -d: -f6)" = "$account_home" ] || fail 'Existing account has an unexpected home.'
    [ "$(getent passwd "$account" | cut -d: -f7)" = /bin/sh ] || fail 'Existing account has an unexpected shell.'
    [ "$(id -nG "$account")" = "$account" ] || fail 'Remove unexpected supplementary groups before reinstalling.'
    [ "$(id -u "$account")" -ne 0 ] || fail 'Account must not be root.'
else
    [ ! -e "$account_home" ] && [ ! -L "$account_home" ] || fail 'Account home already exists; inspect it before installation.'
    /usr/sbin/useradd --system --user-group --no-create-home --home-dir "$account_home" --shell /bin/sh "$account"
fi
/usr/sbin/usermod --lock "$account"

for target in "$account_home" "$account_home/.ssh" "$account_home/.ssh/authorized_keys" /usr/local/sbin/spark-power-command /usr/local/sbin/spark-power-helper /etc/sudoers.d/spark-power; do
    [ ! -L "$target" ] || fail "Refusing symlink: $target"
done

# Root owns every parent and key file; the login account cannot loosen restrictions.
install -d -o root -g root -m 0755 "$account_home" "$account_home/.ssh"
install -o root -g root -m 0755 "$script_dir/spark-power-command" /usr/local/sbin/spark-power-command
install -o root -g root -m 0755 "$script_dir/spark-power-helper" /usr/local/sbin/spark-power-helper

temp_dir=$(mktemp -d)
trap 'rm -f "$temp_dir/authorized_keys" "$temp_dir/sudoers"; rmdir "$temp_dir"' EXIT HUP INT TERM
printf 'restrict,command="/usr/local/sbin/spark-power-command" %s\n' "$key" > "$temp_dir/authorized_keys"
cat > "$temp_dir/sudoers" <<'SUDOERS'
# The shutdown helper validates exactly one expected boot UUID before acting.
# The wildcard cannot authorize other helper operations; its argument count is strict.
spark-power ALL=(root) NOPASSWD: /usr/local/sbin/spark-power-helper status, /usr/local/sbin/spark-power-helper shutdown *
SUDOERS
/usr/sbin/visudo -cf "$temp_dir/sudoers" >/dev/null
install -o root -g root -m 0440 "$temp_dir/sudoers" /etc/sudoers.d/spark-power
install -o root -g root -m 0644 "$temp_dir/authorized_keys" "$account_home/.ssh/authorized_keys"
printf '%s\n' 'dgx-gateway spark-power account v2' > "$marker"
chown root:root "$marker"
chmod 0644 "$marker"

printf '%s\n' 'Installed restricted spark-power SSH access. No shutdown was requested.'
printf '%s\n' 'Re-running replaces this dedicated account key. Existing SSH daemon settings are unchanged.'
printf '%s\n' 'Verify status from the Pi before enabling shutdown in the gateway.'
