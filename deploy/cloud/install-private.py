"""Install isolated loopback services; does NOT enable the public HTTPS site.

Input contains source files, fixed download hashes and a public encryption key.
The gateway secret is generated on the server and returned RSA-OAEP encrypted.
"""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import socket
import sqlite3
import subprocess
import tarfile
import tempfile
import time
import urllib.request

BASE = Path('/opt/pascal-ai-gateway')
STATE = Path('/var/lib/pascal-ai-gateway')
CONFIG = Path('/etc/pascal-ai-gateway')
BACKUP = Path('/var/backups/pascal-ai-gateway')
MINI_DB = Path('/var/lib/pocket-rudiment/main.sqlite')
ALLOWED_FILES = {'gateway.py', 'test_gateway.py', 'pascal-ai-gateway.service', 'pascal-ai-tailnet.service', 'pascal-ai-tls.service'}


def run(*args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def private_dir(p):
    p.mkdir(parents=True, exist_ok=True)
    p.chmod(0o700)


def protect_mini():
    for service in ('pocket-rudiment.service', 'pocket-rudiment-owner.service', 'pocket-rudiment-backup.timer'):
        run('systemctl', 'is-active', '--quiet', service)
    with urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=5) as response:
        health = json.load(response)
    if health.get('version') != 'aliyun-backend-v3-summary-sync' or not health.get('ok'):
        raise RuntimeError('Existing mini program health differs from the inspected baseline')
    source = sqlite3.connect('file:' + str(MINI_DB) + '?mode=ro', uri=True)
    try:
        if source.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Protected database is not healthy')
        snapshot = BACKUP / 'predeploy-mini.sqlite'
        if not snapshot.exists():
            destination = sqlite3.connect(snapshot)
            try:
                source.backup(destination)
            finally:
                destination.close()
            snapshot.chmod(0o600)
        counts = {}
        for (table,) in source.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
            quoted = '"' + table.replace('"', '""') + '"'
            counts[table] = source.execute('SELECT COUNT(*) FROM ' + quoted).fetchone()[0]
        evidence = {'health': health, 'tableCounts': counts, 'backup': str(snapshot)}
        target = STATE / 'mini-before.json'
        if not target.exists():
            target.write_text(json.dumps(evidence, indent=2))
            target.chmod(0o600)
        return evidence
    finally:
        source.close()


def binary(url, expected, member_suffix, destination):
    if destination.exists():
        # Installed binaries are reused only after the archive hash marker matches.
        marker = destination.with_suffix('.archive-sha256')
        if marker.exists() and marker.read_text().strip() == expected:
            return
        raise RuntimeError('Refusing to replace an unrecognized existing binary')
    print('Downloading verified binary:', destination.name, flush=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'PascalGatewayInstaller/1'})
    with urllib.request.urlopen(request, timeout=120) as response:
        archive = response.read(100 * 1024 * 1024)
    if hashlib.sha256(archive).hexdigest() != expected:
        raise RuntimeError('Binary archive checksum mismatch')
    if url.endswith('.deb'):
        # Extract only the verified executable. Do not run package scripts,
        # install global dependencies, or start the distribution's service.
        with tempfile.TemporaryDirectory() as temporary:
            package = Path(temporary) / 'package.deb'
            package.write_bytes(archive)
            extracted = Path(temporary) / 'extracted'
            run('dpkg-deb', '--extract', str(package), str(extracted))
            content = (extracted / 'usr/bin' / member_suffix).read_bytes()
    else:
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
            members = [m for m in tar.getmembers() if m.isfile() and (m.name == member_suffix or m.name.endswith('/' + member_suffix))]
            if len(members) != 1:
                raise RuntimeError('Unexpected binary archive layout')
            content = tar.extractfile(members[0]).read()
    destination.write_bytes(content)
    destination.chmod(0o755)
    destination.with_suffix('.archive-sha256').write_text(expected)


def install(payload):
    if os.geteuid() != 0:
        raise RuntimeError('Root is required for independent system services')
    os.umask(0o077)
    if BASE.exists() and not (BASE / '.pascal-managed').exists():
        raise RuntimeError('Refusing to change an unrecognized deployment directory')
    for p in (STATE, CONFIG, BACKUP):
        private_dir(p)
    before = protect_mini()
    print('Protected mini program backup/integrity/service check passed', flush=True)
    BASE.mkdir(exist_ok=True)
    BASE.chmod(0o755)
    (BASE / '.pascal-managed').write_text('Pascal AI gateway\n')
    binaries = BASE / 'bin'
    binaries.mkdir(exist_ok=True)
    binaries.chmod(0o755)
    if set(payload['files']) != ALLOWED_FILES:
        raise RuntimeError('Unexpected deployment file set')
    for name, content in payload['files'].items():
        (BASE / name).write_text(content)
        (BASE / name).chmod(0o644)
    run('/usr/bin/python3', '-m', 'unittest', 'test_gateway.py', cwd=BASE)
    print('Gateway transport tests passed on server', flush=True)
    for name in ('pascal-gateway', 'pascal-tls'):
        try:
            account = pwd.getpwnam(name)
            if account.pw_uid >= 1000:
                raise RuntimeError('Existing service account is not a system account')
        except KeyError:
            run('useradd', '--system', '--no-create-home', '--shell', '/usr/sbin/nologin', name)
    ts = payload['tailscale']
    for name in ('tailscale', 'tailscaled'):
        binary(ts['url'], ts['sha256'], name, binaries / name)
    caddy = payload['caddy']
    binary(caddy['url'], caddy['sha256'], 'caddy', binaries / 'caddy')
    env = CONFIG / 'environment'
    if not env.exists():
        token = secrets.token_urlsafe(48)
        env.write_text('PASCAL_GATEWAY_TOKEN=' + token + '\nPASCAL_CHAT_WORKER=http://100.85.158.27:18091\nPASCAL_STUDIO_WORKER=http://100.85.158.27:18092\nPASCAL_GATEWAY_PROXY=http://127.0.0.1:1055\n')
    env.chmod(0o600)
    token = next(line.split('=', 1)[1] for line in env.read_text().splitlines() if line.startswith('PASCAL_GATEWAY_TOKEN='))
    caddy_config = CONFIG / 'Caddyfile'
    caddy_config.write_text('pascal-ai.pocketrudiment.cn {\n  @ai path /chat /studio\n  handle @ai {\n    reverse_proxy 127.0.0.1:9080 {\n      flush_interval -1\n    }\n  }\n  respond 404\n}\n')
    # The TLS service can read this public config but cannot read the gateway token.
    CONFIG.chmod(0o755)
    caddy_config.chmod(0o644)
    for name in ('pascal-ai-gateway.service', 'pascal-ai-tailnet.service', 'pascal-ai-tls.service'):
        destination = Path('/etc/systemd/system') / name
        if destination.exists() and destination.read_text() != (BASE / name).read_text():
            raise RuntimeError('Refusing to replace a different existing service unit')
        shutil.copyfile(BASE / name, destination)
        destination.chmod(0o644)
    run('systemctl', 'daemon-reload')
    run('systemctl', 'enable', '--now', 'pascal-ai-gateway.service', 'pascal-ai-tailnet.service')
    run('systemctl', 'is-active', '--quiet', 'pascal-ai-gateway.service', 'pascal-ai-tailnet.service')
    run(str(binaries / 'caddy'), 'validate', '--config', str(caddy_config), '--adapter', 'caddyfile')
    # Deliberately do not start/enable pascal-ai-tls.service in this phase.
    with tempfile.TemporaryDirectory() as temporary:
        public_key = Path(temporary) / 'recipient.pem'
        public_key.write_text(payload['recipientPublicKey'])
        encrypted = run('openssl', 'pkeyutl', '-encrypt', '-pubin', '-inkey', str(public_key), '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256', input=token.encode()).stdout
    for service in ('pocket-rudiment.service', 'pocket-rudiment-owner.service', 'pocket-rudiment-backup.timer'):
        run('systemctl', 'is-active', '--quiet', service)
    print(json.dumps({'phase': 'private-installed', 'gatewayTokenEncrypted': base64.b64encode(encrypted).decode(), 'publicTlsStarted': False, 'miniServiceChecks': 'passed', 'protectedBackup': before['backup']}), flush=True)


if __name__ == '__main__':
    try:
        install(json.loads(base64.b64decode(os.environ['PASCAL_INSTALL_PAYLOAD'])))
    except Exception:
        # Command Assistant displays stdout reliably; include stage failures
        # there without printing environment values or the private payload.
        import sys
        import traceback
        traceback.print_exc(file=sys.stdout)
        raise SystemExit(1)
