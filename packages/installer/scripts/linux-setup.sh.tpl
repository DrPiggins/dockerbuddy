#!/usr/bin/env bash
# DockerBuddy — Linux remote host setup
# Generated for: {{CONTEXT_NAME}}
# Pubkey owner:  {{KEY_COMMENT}}
#
# What this does:
#   1. Detects your distro's package manager
#   2. Installs and enables openssh-server
#   3. Authorizes your Mac's SSH key for the invoking user
#   4. Prints your IP + username so you can plug them into DockerBuddy
#
# Run me with sudo: sudo bash ./dockerbuddy-setup-{{CONTEXT_NAME}}.sh

set -euo pipefail

PUBKEY='{{PUBKEY}}'
SSH_PORT='{{SSH_PORT}}'
if ! [[ "$SSH_PORT" =~ ^[0-9]+$ ]] || [ "$SSH_PORT" -lt 1 ] || [ "$SSH_PORT" -gt 65535 ]; then
  SSH_PORT=22
fi

c_cyan="\033[36m"
c_green="\033[32m"
c_yellow="\033[33m"
c_dim="\033[2m"
c_reset="\033[0m"

step() { printf "\n${c_cyan}==> %s${c_reset}\n" "$*"; }
ok()   { printf "    ${c_green}[OK]${c_reset} %s\n" "$*"; }
skip() { printf "    ${c_dim}[--] %s${c_reset}\n" "$*"; }
warn() { printf "    ${c_yellow}[!!]${c_reset} %s\n" "$*"; }

# --- Self-elevate ---
if [ "$(id -u)" -ne 0 ]; then
  printf "${c_yellow}DockerBuddy needs root to install openssh-server. Relaunching with sudo...${c_reset}\n"
  exec sudo -E bash "$0" "$@"
fi

# Resolve the *invoking* user (so we authorize THEIR ~/.ssh, not root's)
TARGET_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
if [ -z "$TARGET_HOME" ] || [ ! -d "$TARGET_HOME" ]; then
  echo "Could not resolve home directory for user '$TARGET_USER'." >&2
  exit 1
fi

printf "\n${c_cyan}+----------------------------------------+${c_reset}\n"
printf "${c_cyan}|        DockerBuddy: Linux side         |${c_reset}\n"
printf "${c_cyan}+----------------------------------------+${c_reset}\n"
printf "  authorizing user: ${c_green}%s${c_reset} (%s)\n" "$TARGET_USER" "$TARGET_HOME"

# --- 1. Install openssh-server ---
step "Installing openssh-server"

if command -v apt-get >/dev/null 2>&1; then
  PKG_MGR="apt"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server
  SERVICE_NAME="ssh"
elif command -v dnf >/dev/null 2>&1; then
  PKG_MGR="dnf"
  dnf install -y -q openssh-server
  SERVICE_NAME="sshd"
elif command -v yum >/dev/null 2>&1; then
  PKG_MGR="yum"
  yum install -y -q openssh-server
  SERVICE_NAME="sshd"
elif command -v pacman >/dev/null 2>&1; then
  PKG_MGR="pacman"
  pacman -Sy --noconfirm --needed openssh
  SERVICE_NAME="sshd"
elif command -v zypper >/dev/null 2>&1; then
  PKG_MGR="zypper"
  zypper --non-interactive install openssh
  SERVICE_NAME="sshd"
elif command -v apk >/dev/null 2>&1; then
  PKG_MGR="apk"
  apk add --no-cache openssh
  SERVICE_NAME="sshd"
else
  echo "Could not find a supported package manager (apt/dnf/yum/pacman/zypper/apk)." >&2
  exit 1
fi
ok "Installed via $PKG_MGR"

# --- 1b. Configure sshd port ---
step "Configuring sshd to listen on port $SSH_PORT"
SSHD_CONFIG="/etc/ssh/sshd_config"
if [ -f "$SSHD_CONFIG" ]; then
  if grep -qE '^[# ]*Port[ ]+[0-9]+' "$SSHD_CONFIG"; then
    # Replace the first (uncommented or commented) Port line. Single line edit
    # keeps daemon happy and avoids accumulating dupes across re-runs.
    sed -i -E "0,/^[# ]*Port[ ]+[0-9]+/s||Port $SSH_PORT|" "$SSHD_CONFIG"
  else
    printf "\nPort %s\n" "$SSH_PORT" >> "$SSHD_CONFIG"
  fi
  ok "Set Port $SSH_PORT in $SSHD_CONFIG"
else
  warn "$SSHD_CONFIG not found yet — service install may not have completed"
fi

# --- 2. Start and enable sshd ---
step "Enabling $SERVICE_NAME"
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable "$SERVICE_NAME" 2>/dev/null || true
  # restart so the new Port directive takes effect, even on a fresh install
  systemctl restart "$SERVICE_NAME"
  ok "$SERVICE_NAME enabled and running on port $SSH_PORT"
elif command -v rc-service >/dev/null 2>&1; then
  rc-update add "$SERVICE_NAME" default 2>/dev/null || true
  rc-service "$SERVICE_NAME" restart 2>/dev/null || rc-service "$SERVICE_NAME" start 2>/dev/null || true
  ok "$SERVICE_NAME started via OpenRC on port $SSH_PORT"
else
  warn "No systemd/OpenRC detected — start $SERVICE_NAME manually if needed"
fi

# --- 3. Firewall (best-effort) ---
step "Opening firewall for SSH (TCP/$SSH_PORT)"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$SSH_PORT/tcp" >/dev/null
  ok "ufw rule added for $SSH_PORT/tcp"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$SSH_PORT/tcp" >/dev/null
  firewall-cmd --reload >/dev/null
  ok "firewalld rule added for $SSH_PORT/tcp"
else
  skip "No active firewall detected, or rule already present"
fi

# --- 4. Authorize the pubkey for the invoking user ---
step "Authorizing DockerBuddy's public key"
SSH_DIR="$TARGET_HOME/.ssh"
AUTH_FILE="$SSH_DIR/authorized_keys"
mkdir -p "$SSH_DIR"
touch "$AUTH_FILE"

if grep -qxF "$PUBKEY" "$AUTH_FILE" 2>/dev/null; then
  skip "Public key already present"
else
  printf "%s\n" "$PUBKEY" >> "$AUTH_FILE"
  ok "Public key added"
fi

chown -R "$TARGET_USER":"$TARGET_USER" "$SSH_DIR"
chmod 700 "$SSH_DIR"
chmod 600 "$AUTH_FILE"
ok "File permissions locked down"

# --- 5. Print connection info ---
step "Connection info for DockerBuddy"

IP=$(ip -4 -o addr show scope global 2>/dev/null \
     | awk '{print $4}' | cut -d/ -f1 \
     | grep -v '^127\.' | head -n1)
if [ -z "${IP:-}" ]; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<could not detect>")
fi

printf "\n${c_green}+----------------------------------------+${c_reset}\n"
printf "${c_green}|              ALL DONE!                 |${c_reset}\n"
printf "${c_green}+----------------------------------------+${c_reset}\n\n"
printf "  IP address:   ${c_green}%s${c_reset}\n" "${IP:-unknown}"
printf "  Username:     ${c_green}%s${c_reset}\n" "$TARGET_USER"
printf "  SSH port:     ${c_green}%s${c_reset}\n\n" "$SSH_PORT"
printf "  Go back to DockerBuddy on your Mac and type\n"
printf "  these in. Make sure Docker Engine is installed\n"
printf "  and the user '%s' is in the 'docker' group.\n\n" "$TARGET_USER"
printf "${c_dim}Press Enter to close...${c_reset}\n"
read -r _ || true
