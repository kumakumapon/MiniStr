import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./use-ubuntu-https-mirror.sh', import.meta.url));
const fixtures: string[] = [];

function fixture(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'ministr-apt-'));
  fixtures.push(directory);
  for (const [path, content] of Object.entries(files)) {
    const destination = join(directory, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  return directory;
}

function configure(directory: string): void {
  execFileSync('bash', [script, directory]);
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Ubuntu HTTPS mirrors', () => {
  it('updates the mirror lists used by current GitHub runners', () => {
    const sources = 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
    const directory = fixture({
      'sources.list.d/ubuntu.sources': sources,
      'apt-mirrors.txt': 'http://azure.archive.ubuntu.com/ubuntu\tpriority:1\nhttp://archive.ubuntu.com/ubuntu\tpriority:2\n',
      'apt-mirrors-security.txt': 'https://azure.archive.ubuntu.com/ubuntu\nhttp://security.ubuntu.com/ubuntu\n',
    });
    configure(directory);
    expect(readFileSync(join(directory, 'apt-mirrors.txt'), 'utf8')).toBe(
      'https://mirrors.edge.kernel.org/ubuntu\tpriority:1\nhttps://mirrors.edge.kernel.org/ubuntu\tpriority:2\n',
    );
    expect(readFileSync(join(directory, 'apt-mirrors-security.txt'), 'utf8')).toBe('https://mirrors.edge.kernel.org/ubuntu\nhttps://mirrors.edge.kernel.org/ubuntu\n');
    expect(readFileSync(join(directory, 'sources.list.d/ubuntu.sources'), 'utf8')).toBe(sources);
  });

  it('supports legacy and direct deb822 sources without changing other repositories', () => {
    const directory = fixture({
      'sources.list': 'deb http://azure.archive.ubuntu.com/ubuntu noble main\n',
      'sources.list.d/ubuntu.list': 'deb http://archive.ubuntu.com/ubuntu noble-updates main\n',
      'sources.list.d/ubuntu.sources': 'URIs: https://azure.archive.ubuntu.com/ubuntu/\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n',
      'sources.list.d/other.list': 'deb https://packages.microsoft.com/repos/edge stable main\n',
    });
    configure(directory);
    expect(readFileSync(join(directory, 'sources.list'), 'utf8')).toBe('deb https://mirrors.edge.kernel.org/ubuntu noble main\n');
    expect(readFileSync(join(directory, 'sources.list.d/ubuntu.list'), 'utf8')).toBe('deb https://mirrors.edge.kernel.org/ubuntu noble-updates main\n');
    expect(readFileSync(join(directory, 'sources.list.d/ubuntu.sources'), 'utf8')).toBe(
      'URIs: https://mirrors.edge.kernel.org/ubuntu/\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n',
    );
    expect(readFileSync(join(directory, 'sources.list.d/other.list'), 'utf8')).toBe('deb https://packages.microsoft.com/repos/edge stable main\n');
  });

  it('updates security indexes while preserving suites, signature keys and other paths', () => {
    const directory = fixture({
      'sources.list.d/security.sources':
        'Types: deb\nURIs: https://security.ubuntu.com/ubuntu/\nSuites: resolute-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n',
      'sources.list.d/other.list': 'deb https://archive.ubuntu.com/ubuntu-extra noble main\n',
    });
    configure(directory);
    expect(readFileSync(join(directory, 'sources.list.d/security.sources'), 'utf8')).toBe(
      'Types: deb\nURIs: https://mirrors.edge.kernel.org/ubuntu/\nSuites: resolute-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n',
    );
    expect(readFileSync(join(directory, 'sources.list.d/other.list'), 'utf8')).toBe('deb https://archive.ubuntu.com/ubuntu-extra noble main\n');
  });

  it('allows missing source formats and repeated execution', () => {
    const directory = fixture({ 'apt-mirrors.txt': 'http://azure.archive.ubuntu.com/ubuntu\n' });
    configure(directory);
    configure(directory);
    expect(readFileSync(join(directory, 'apt-mirrors.txt'), 'utf8')).toBe('https://mirrors.edge.kernel.org/ubuntu\n');
    expect(() => configure(fixture({}))).not.toThrow();
  });

  it('runs the shared configuration before browser installation in the reusable CI', () => {
    const content = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const setup = content.indexOf('run: sudo bash scripts/use-ubuntu-https-mirror.sh');
    const install = content.indexOf('run: npx playwright install --with-deps chromium firefox webkit');
    expect(setup).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(setup);
  });

  it('uses the same browser setup for manual Pages verification', () => {
    const content = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
    expect(content).toContain('uses: ./.github/workflows/ci.yml');
    expect(content).not.toContain('playwright install');
  });

  it('configures the shared mirror before the terrain stability browser install', () => {
    const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').split('  terrain-stability:\n')[1]!;
    const setup = workflow.indexOf('run: sudo bash scripts/use-ubuntu-https-mirror.sh');
    expect(setup).toBeGreaterThan(-1);
    expect(workflow.indexOf('run: npx playwright install --with-deps webkit')).toBeGreaterThan(setup);
  });
});
