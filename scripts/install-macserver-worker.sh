#!/bin/zsh
set -euo pipefail

repo_dir="${1:-$PWD}"
repo_dir="$(cd "$repo_dir" && pwd)"
worker_env="$repo_dir/.env.worker"
worker_wrapper="$HOME/bin/stratum-worker"
launch_agent="$HOME/Library/LaunchAgents/com.aarush.stratum-markets-worker.plist"
log_dir="$HOME/Library/Logs/Stratum"
service="gui/$UID/com.aarush.stratum-markets-worker"

if [[ ! -f "$worker_env" ]]; then
  echo "Missing $worker_env. Copy .env.worker.example and add server-only credentials first." >&2
  exit 1
fi

mkdir -p "$HOME/bin" "$HOME/Library/LaunchAgents" "$log_dir"

{
  echo '#!/bin/zsh'
  echo 'set -euo pipefail'
  echo
  echo 'export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"'
  printf 'cd %q\n' "$repo_dir"
  echo 'set -a'
  printf 'source %q\n' "$worker_env"
  echo 'set +a'
  echo 'export WORKER_ID="${WORKER_ID:-stratum-macserver-1}"'
  echo 'exec node --experimental-strip-types scripts/markets-worker.ts'
} > "$worker_wrapper"
chmod 700 "$worker_wrapper"

cat > "$launch_agent" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aarush.stratum-markets-worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>$worker_wrapper</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$repo_dir</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$log_dir/worker.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$log_dir/worker.stderr.log</string>
</dict>
</plist>
PLIST

plutil -lint "$launch_agent"
if launchctl print "$service" >/dev/null 2>&1; then
  launchctl bootout "$service"
  sleep 1
fi

for attempt in 1 2 3; do
  if launchctl bootstrap "gui/$UID" "$launch_agent"; then
    break
  fi
  if (( attempt == 3 )); then
    echo "Unable to bootstrap $service after $attempt attempts." >&2
    exit 1
  fi
  sleep "$attempt"
done

launchctl enable "$service"
launchctl kickstart -k "$service"
launchctl print "$service"
