#!/usr/bin/env bash
# Deploy Axelkod. Usage: scripts/deploy.sh local   (mainnet: Phase 6)
#
# Local: uses --identity anonymous unless ICP_IDENTITY is set. Set FIRST_ADMIN to
# an Internet Identity principal to make it an admin (added by the controller).
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-local}"
if [[ "$target" != "local" ]]; then
  echo "Only 'local' is supported so far; mainnet deploy is added in Phase 6." >&2
  exit 1
fi

id="${ICP_IDENTITY:-anonymous}"
icp network status >/dev/null 2>&1 || icp network start -d
icp deploy --identity "$id"

ids=.icp/cache/mappings/local.ids.json
backend=$(jq -r .backend "$ids")

# The backend authorizes admins on the frontend canister, which only its
# controllers may do. Idempotent: skipped when it is already a controller.
if ! icp canister status frontend --identity "$id" | grep -q "controller: $backend"; then
  echo "Adding backend ($backend) as a controller of frontend"
  icp canister settings update frontend --add-controller "$backend" --identity "$id"
fi

if [[ -n "${FIRST_ADMIN:-}" ]]; then
  icp canister call backend addAdmin "(principal \"$FIRST_ADMIN\")" --identity "$id"
fi

# Re-applies the admin set to the frontend (a frontend reinstall clears it).
icp canister call backend syncAdminsToFrontend '()' --identity "$id"
