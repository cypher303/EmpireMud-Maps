#!/usr/bin/env bash
# Sync the built static site + nginx config to a remote host via SSH key auth.
# Suggested GCP VM: e2-small (1 vCPU, 2 GB) is plenty for static nginx; size up if traffic grows.
# Edit the variables below before running; no env or positional args are read.
# Adjust paths in the constants below if your layout differs.

set -euo pipefail

DEPLOY_HOST="CHANGE_ME_DEPLOY_HOST"    # e.g., host.example.com
SERVER_NAME="CHANGE_ME_SERVER_NAME"    # e.g., map.example.com
DEPLOY_USER="deploy"                   # SSH user with key-based access
SSH_OPTS=""                            # e.g., "-i ~/.ssh/id_ed25519"
WEB_ROOT="/var/www/empire-maps"

SITE_NAME="empire-maps"
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"
NGINX_CERT_DIR="/etc/letsencrypt/live/${SERVER_NAME}"

if [[ "${DEPLOY_HOST}" == "CHANGE_ME_DEPLOY_HOST" || "${SERVER_NAME}" == "CHANGE_ME_SERVER_NAME" ]]; then
  echo "Edit DEPLOY_HOST and SERVER_NAME in tools/deploy-static.sh before running." >&2
  exit 1
fi

if [[ ! -d "dist" ]]; then
  echo "dist/ not found. Build first (npm run build and asset generation)." >&2
  exit 1
fi

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"
ssh_cmd() {
  # shellcheck disable=SC2029
  ssh ${SSH_OPTS} "${SSH_TARGET}" "$@"
}

echo "Preparing ${WEB_ROOT} on ${SSH_TARGET}..."
ssh_cmd "sudo mkdir -p ${WEB_ROOT} && sudo chown -R ${DEPLOY_USER}:${DEPLOY_USER} ${WEB_ROOT}"

echo "Syncing dist/ -> ${WEB_ROOT}..."
rsync -av --delete ${SSH_OPTS} dist/ "${SSH_TARGET}:${WEB_ROOT}/"

if [[ -d "public/basis" ]]; then
  echo "Syncing public/basis/ -> ${WEB_ROOT}/basis/..."
  rsync -av ${SSH_OPTS} public/basis/ "${SSH_TARGET}:${WEB_ROOT}/basis/"
fi

if [[ -d "dist/generated" ]]; then
  echo "Syncing dist/generated/ -> ${WEB_ROOT}/generated/..."
  rsync -av ${SSH_OPTS} dist/generated/ "${SSH_TARGET}:${WEB_ROOT}/generated/"
fi

echo "Writing nginx site ${SITE_NAME} for ${SERVER_NAME}..."
NGINX_CONF=$(cat <<EOF
server {
  listen 80;
  server_name ${SERVER_NAME};
  return 301 https://${SERVER_NAME}\$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ${SERVER_NAME};

  root ${WEB_ROOT};
  index index.html;

  ssl_certificate ${NGINX_CERT_DIR}/fullchain.pem;
  ssl_certificate_key ${NGINX_CERT_DIR}/privkey.pem;

  gzip on;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
  client_max_body_size 25m;

  location / {
    try_files \$uri \$uri/ /index.html;
  }

  location /generated/ {
    autoindex off;
  }

  location /basis/ {
    add_header Cache-Control "public, max-age=31536000";
  }
}
EOF
)

echo "${NGINX_CONF}" | ssh_cmd "sudo tee ${NGINX_AVAILABLE}/${SITE_NAME} >/dev/null"
ssh_cmd "sudo ln -sf ${NGINX_AVAILABLE}/${SITE_NAME} ${NGINX_ENABLED}/${SITE_NAME}"

echo "Reloading nginx..."
ssh_cmd "sudo nginx -t"
ssh_cmd "sudo systemctl reload nginx"

echo "Deployment sync complete for ${SERVER_NAME}."
