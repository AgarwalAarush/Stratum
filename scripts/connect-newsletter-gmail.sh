#!/bin/zsh
# Run interactively on macserver. The secret is never an argument, exported
# environment value, shell-history entry, or terminal echo.
set -euo pipefail
set +x
cd "${0:A:h:h}"
[[ -t 0 ]] || { print -u2 'Use an interactive terminal for Gmail setup.'; exit 1; }
secret_dir="${STRATUM_DATA_ROOT:-/Users/Shared/StratumData}/secrets"
credential_file="$secret_dir/newsletter-gmail-app-password"
[[ ! -e "$credential_file" ]] || { print -u2 'A Gmail credential already exists; verify the existing connection instead of replacing it.'; exit 1; }
[[ -f .env.worker ]] || { print -u2 'Run from the deployed worker release.'; exit 1; }
umask 077
mkdir -p "$secret_dir"
print 'Connect aarushaga@gmail.com. Create a Google app password named Stratum newsletter.'
print 'Enter it here only. Do not paste it into Codex or chat.'
read -rs 'gmail_password?Google app password: '
print
gmail_password="${gmail_password// /}"
[[ ${#gmail_password} == 16 && "$gmail_password" != *[^a-zA-Z0-9]* ]] || { unset gmail_password; print -u2 'Expected a 16-character Google app password.'; exit 1; }
( set -o noclobber; printf '%s' "$gmail_password" > "$credential_file" )
unset gmail_password
export STRATUM_GMAIL_APP_PASSWORD_FILE="$credential_file"
node --experimental-strip-types --input-type=module <<'JS'
import {gmailTransport} from './lib/server/newsletter-transport.ts';
const transport = await gmailTransport();
try { await transport.verify(); console.log('Gmail connection verified. No message sent.'); }
catch { console.error('Google did not verify this connection. Sending remains disabled.'); process.exitCode = 1; }
finally { transport.close(); }
JS
# Preserve every unrelated setting. Connection setup alone does not enable
# scheduled delivery or pretend that SMTP acceptance proves inbox delivery.
sed -i '' '/^STRATUM_NEWSLETTER_PROVIDER=/d; /^STRATUM_GMAIL_APP_PASSWORD_FILE=/d' .env.worker
printf '\nSTRATUM_NEWSLETTER_PROVIDER=gmail\nSTRATUM_GMAIL_APP_PASSWORD_FILE=%s\n' "$credential_file" >> .env.worker
print 'Gmail is configured. Return to Stratum setup to verify the first newsletter and enable its daily schedule.'
