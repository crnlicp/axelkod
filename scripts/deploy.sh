#!/usr/bin/env bash
# Deploy Axelkod.
#   scripts/deploy.sh local   local network, --identity anonymous (or $ICP_IDENTITY)
#   scripts/deploy.sh ic      mainnet as prod-identity; asks before every mainnet step
#
# FIRST_ADMIN=<principal> makes that Internet Identity principal an admin (the
# controller adds it). Get it from the "Åtkomst nekad" page at /admin.
# FIRST_OWNER=<principal> makes it the first accounting owner. Only works while
# accounting has no roles; after that, owners manage roles in the admin.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-}"
case "$target" in
  local)
    env_flags=()
    id_flags=(--identity "${ICP_IDENTITY:-anonymous}")
    ids=.icp/cache/mappings/local.ids.json
    icp network status >/dev/null 2>&1 || icp network start -d
    ;;
  ic)
    env_flags=(-e ic)
    id_flags=(--identity prod-identity --identity-password-file "$HOME/.identity-pw")
    ids=.icp/data/mappings/ic.ids.json
    ;;
  *)
    echo "usage: scripts/deploy.sh local|ic" >&2
    exit 1
    ;;
esac

confirm() {
  [[ "$target" == "local" ]] && return 0
  local answer
  read -r -p "$1 Type 'yes' to continue: " answer
  [[ "$answer" == "yes" ]] || { echo "Aborted."; exit 1; }
}

if [[ "$target" == "ic" ]]; then
  echo "Mainnet deploy as prod-identity."
  icp cycles balance -n ic "${id_flags[@]}" || true
  [[ -f "$ids" ]] || echo "First deploy: creating 4 canisters needs about 8.4T cycles (4 × (2T + fee))."
  # Stable-memory compatibility against the last mainnet deploy, before anything ships.
  for c in site accounting vault; do (cd "canisters/backend/$c" && mops check); done
  confirm "Deploy site, web, accounting and vault to MAINNET (upgrade keeps state)?"
fi

icp deploy "${env_flags[@]}" "${id_flags[@]}"
backend=$(jq -r .site "$ids")

# The backend authorizes admins on the frontend canister, which only its
# controllers may do. Idempotent: skipped when it already is a controller.
if ! icp canister status web "${env_flags[@]}" "${id_flags[@]}" | grep -q "controller: $backend"; then
  confirm "Add the site canister ($backend) as a CONTROLLER of the web canister?"
  icp canister settings update web --add-controller "$backend" "${env_flags[@]}" "${id_flags[@]}"
fi

if [[ -n "${FIRST_ADMIN:-}" ]]; then
  confirm "Add admin $FIRST_ADMIN?"
  icp canister call site addAdmin "(principal \"$FIRST_ADMIN\")" "${env_flags[@]}" "${id_flags[@]}"
fi

if [[ -n "${FIRST_OWNER:-}" ]]; then
  confirm "Make $FIRST_OWNER the first accounting owner?"
  icp canister install accounting --mode upgrade --args "(opt principal \"$FIRST_OWNER\")" "${env_flags[@]}" "${id_flags[@]}"
fi

# Re-applies the admin set to the frontend (a frontend reinstall clears it).
icp canister call site syncAdminsToFrontend '()' "${env_flags[@]}" "${id_flags[@]}"

if [[ "$target" == "ic" ]]; then
  # Promote the deployed stable signature: the baseline for the next upgrade check.
  for c in site accounting vault; do (cd "canisters/backend/$c" && mops deployed "$c"); done
  echo "Commit .icp/data/ and canisters/backend/*/deployed/ now."
  echo "Frontend: https://$(jq -r .web "$ids").icp.net"
fi
