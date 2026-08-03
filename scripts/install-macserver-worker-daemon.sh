#!/bin/zsh
# Install the private Stratum worker as a boot-managed LaunchDaemon.
# Run with sudo and pass the detached production checkout as argument one.
set -euo pipefail

repo_dir="${1:?Usage: sudo ./scripts/install-macserver-worker-daemon.sh /path/to/production-checkout-or-active-symlink [mac-user]}"
worker_user="${2:-$(stat -f '%Su' /dev/console)}"
worker_env="$repo_dir/.env.worker"
runtime_root="/Users/Shared/StratumData/runtime"
wrapper="$runtime_root/stratum-worker"
plist="/Library/LaunchDaemons/com.aarush.stratum-markets-worker.plist"
label="com.aarush.stratum-markets-worker"
log_dir="/Users/Shared/StratumData/logs"

if [[ "$EUID" -ne 0 ]]; then
  echo 'This installer must run with sudo so the worker survives logout and reboot.' >&2
  exit 1
fi
if [[ ! -f "$worker_env" ]]; then
  echo "Missing $worker_env; copy .env.worker.example and set worker-only credentials first." >&2
  exit 1
fi

install -d -o "$worker_user" -g staff -m 700 /Users/Shared/StratumData "$runtime_root" "$log_dir"
chown "$worker_user":staff "$worker_env"
chmod 600 "$worker_env"

cat > "$wrapper" <<EOF
#!/bin/zsh
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$repo_dir"
set -a
source "$worker_env"
set +a
export WORKER_ID="\${WORKER_ID:-stratum-macserver-1}"
exec /usr/bin/env node --experimental-strip-types scripts/markets-worker.ts
EOF
chown "$worker_user":staff "$wrapper"
chmod 700 "$wrapper"

cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>$wrapper</string></array>
  <key>WorkingDirectory</key><string>$repo_dir</string>
  <key>UserName</key><string>$worker_user</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$log_dir/worker.stdout.log</string>
  <key>StandardErrorPath</key><string>$log_dir/worker.stderr.log</string>
</dict></plist>
EOF
chown root:wheel "$plist"
chmod 644 "$plist"
plutil -lint "$plist"
launchctl bootout "system/$label" 2>/dev/null || true
launchctl bootstrap system "$plist"
launchctl enable "system/$label"
launchctl kickstart -k "system/$label"
launchctl print "system/$label"
