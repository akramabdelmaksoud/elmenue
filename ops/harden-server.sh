#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server. Run as root:   bash ops/harden-server.sh "ssh-ed25519 AAAA... you@pc"
# (the argument is your PUBLIC ssh key; if omitted, root's existing authorized_keys is reused)
#
# Does: updates, docker, 2 GB swap, firewall (22/80/443 only), fail2ban, key-only SSH with a non-root "deploy" user,
#       automatic security updates (with a night-time reboot only if the kernel needs it).
# Safe order: the new user + key are created and checked BEFORE password/root SSH login is switched off.
# After it finishes: open a SECOND terminal and log in as deploy@SERVER before closing this one.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
DEPLOY_USER=deploy
REBOOT_TIME="${REBOOT_TIME:-02:30}"      # server time (UTC) = 04:30 in Cairo in winter. Only used when an update needs a reboot.
export DEBIAN_FRONTEND=noninteractive

echo "==> Packages"
apt-get update -y && apt-get upgrade -y
apt-get install -y ufw fail2ban unattended-upgrades apt-listchanges docker.io docker-compose-v2 git curl ca-certificates dnsutils cron

echo "==> Deploy user + SSH key"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AK="/home/$DEPLOY_USER/.ssh/authorized_keys"
if [ -n "${1:-}" ]; then echo "$1" > "$AK"; elif [ -s /root/.ssh/authorized_keys ]; then cp /root/.ssh/authorized_keys "$AK"; fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$AK" 2>/dev/null || true; chmod 600 "$AK" 2>/dev/null || true
[ -s "$AK" ] || { echo "No SSH key for $DEPLOY_USER - refusing to disable password login. Pass your public key as the first argument."; exit 1; }
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-deploy; chmod 440 /etc/sudoers.d/90-deploy

echo "==> SSH: keys only, no root login"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
CONF
sshd -t && systemctl reload ssh

echo "==> Firewall (only 22, 80, 443)"
ufw --force reset >/dev/null
ufw default deny incoming; ufw default allow outgoing
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp
ufw --force enable
# Docker publishes ports itself; only 80/443 are published in docker-compose.yml, the app port 3000 is internal-only.

echo "==> fail2ban (SSH)"
cat > /etc/fail2ban/jail.d/sshd.local <<'CONF'
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban && systemctl restart fail2ban

echo "==> Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
cat > /etc/apt/apt.conf.d/52elmenue-upgrades <<CONF
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "$REBOOT_TIME";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
CONF

echo "==> 2 GB swap (the server has 2 GB RAM)"
if ! swapon --show | grep -q .; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf; sysctl -p /etc/sysctl.d/99-swap.conf >/dev/null

echo "==> Docker log rotation"
cat > /etc/docker/daemon.json <<'CONF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
CONF
systemctl enable --now docker && systemctl restart docker

install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/backups/elmenue
echo
echo "DONE. Now, in a NEW terminal, check:  ssh $DEPLOY_USER@<server-ip>   (do not close this session until that works)"
