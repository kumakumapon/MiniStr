import { log } from 'node:console';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function isPublicationContext({ eventName, ref, sha }) {
  return ['push', 'workflow_dispatch'].includes(eventName) && ref === 'refs/heads/main' && typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha);
}

export async function isCurrentMain(context, fetchMain) {
  if (!isPublicationContext(context)) return false;
  const main = await fetchMain();
  const sha = main?.object?.sha;
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('GitHub returned no usable main SHA.');
  return context.sha === sha;
}

export async function runPreflight(environment, fetchResponse = globalThis.fetch) {
  const context = { eventName: environment.GITHUB_EVENT_NAME, ref: environment.GITHUB_REF, sha: environment.GITHUB_SHA };
  const current = await isCurrentMain(context, async () => {
    const repository = environment.GITHUB_REPOSITORY;
    if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository) || !environment.GH_TOKEN) throw new Error('Publication context is incomplete.');
    const response = await fetchResponse(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
      headers: { authorization: `Bearer ${environment.GH_TOKEN}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Could not confirm current main (HTTP ${response.status}).`);
    return response.json();
  });
  if (!environment.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  appendFileSync(environment.GITHUB_OUTPUT, `current=${current}\n`);
  log(current ? 'The verified build matches current main.' : 'Pages deployment skipped: this is not current main.');
  return current;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runPreflight(process.env);
