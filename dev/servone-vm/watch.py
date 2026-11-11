#!/usr/bin/env python3
# cron: */5 * * * * python3 ~/servone/watch.py >> ~/servone/watch.log 2>&1
# Watches every container on the VM (Saola too) plus disk, memory and the public URL; emails only on change.
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / 'watch-state.json'
DISK_MAX_PERCENT = 85
MEM_MIN_AVAILABLE_MB = 400
SWAP_MAX_USED_MB = 2048
HTTP_TIMEOUT_S = 15
SENDER = 'Servone Alerts <no-reply@servone.app>'


def read_env() -> dict[str, str]:
    lines = (HERE / '.env').read_text().splitlines()
    return dict(line.split('=', 1) for line in lines if '=' in line and not line.startswith('#'))


def container_rows() -> list[str]:
    ids = subprocess.run(['docker', 'ps', '-aq'], capture_output=True, text=True, check=True).stdout.split()
    fmt = '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.RestartCount}}|{{.State.OOMKilled}}'
    out = subprocess.run(['docker', 'inspect', '-f', fmt, *ids], capture_output=True, text=True, check=True).stdout
    return out.splitlines()


def container_problems(rows: list[str], last_restarts: dict[str, int]) -> tuple[list[str], dict[str, int]]:
    problems = []
    restarts = {}
    for row in rows:
        name, status, health, restart_count, oom_killed = row.lstrip('/').split('|')
        restarts[name] = int(restart_count)
        if status != 'running':
            problems.append(f'{name} is {status}')
        if health == 'unhealthy':
            problems.append(f'{name} is unhealthy')
        if oom_killed == 'true':
            problems.append(f'{name} was killed for running out of memory')
        if restarts[name] > last_restarts.get(name, restarts[name]):
            problems.append(f'{name} restarted ({restarts[name]} restarts total)')
    return problems, restarts


def host_problems() -> list[str]:
    problems = []
    disk = shutil.disk_usage('/')
    disk_percent = disk.used * 100 // disk.total
    if disk_percent > DISK_MAX_PERCENT:
        problems.append(f'disk / is {disk_percent}% full')
    meminfo = {k: int(v.split()[0]) // 1024 for k, v in (l.split(':', 1) for l in Path('/proc/meminfo').read_text().splitlines())}
    if meminfo['MemAvailable'] < MEM_MIN_AVAILABLE_MB:
        problems.append(f"only {meminfo['MemAvailable']} MB memory available")
    swap_used = meminfo['SwapTotal'] - meminfo['SwapFree']
    if swap_used > SWAP_MAX_USED_MB:
        problems.append(f'{swap_used} MB swap in use')
    return problems


def url_problems(urls: list[str]) -> list[str]:
    problems = []
    for url in urls:
        try:
            urllib.request.urlopen(url, timeout=HTTP_TIMEOUT_S)
        except Exception as error:  # any failure to load the page is the alert itself
            problems.append(f'{url} unreachable: {error}')
    return problems


def send_email(env: dict[str, str], subject: str, body: str) -> None:
    request = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps({'from': SENDER, 'to': [env['ALERT_EMAIL']], 'subject': subject, 'text': body}).encode(),
        headers={'Authorization': f"Bearer {env['RESEND_KEY']}", 'Content-Type': 'application/json', 'User-Agent': 'servone-watch'},
    )
    urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_S)


def main() -> None:
    env = read_env()
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {'problems': [], 'restarts': {}}
    problems, restarts = container_problems(container_rows(), state['restarts'])
    problems += host_problems()
    problems += url_problems([u for u in env.get('WATCH_URLS', '').split(',') if u])
    # Restart events fire once; only persistent problems are compared for recovery.
    persistent = sorted(p for p in problems if ' restarted (' not in p)
    new = [p for p in problems if p not in state['problems']]
    recovered = [p for p in state['problems'] if p not in persistent]
    if new:
        send_email(env, f'[VM 10.19.193.14] {len(new)} problem(s)', '\n'.join(new + ['', 'Still open:'] + persistent))
    elif recovered and not persistent:
        send_email(env, '[VM 10.19.193.14] recovered', '\n'.join(recovered))
    if new or recovered:
        print(f'new={new} recovered={recovered}')
    STATE_FILE.write_text(json.dumps({'problems': persistent, 'restarts': restarts}))


def self_check() -> None:
    rows = ['/a|running||0|false', '/b|exited||0|false', '/c|running|unhealthy|3|false', '/d|running||1|true']
    problems, restarts = container_problems(rows, {'c': 2})
    assert problems == ['b is exited', 'c is unhealthy', 'c restarted (3 restarts total)', 'd was killed for running out of memory'], problems
    assert restarts == {'a': 0, 'b': 0, 'c': 3, 'd': 1}
    print('ok')


if __name__ == '__main__':
    self_check() if sys.argv[1:] == ['--check'] else main()
