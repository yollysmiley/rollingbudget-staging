import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyCiChanges } from './classify-ci-changes.mjs';

const full = reason => ({ mode: 'full', reason });
const sha = /^[0-9a-f]{40}$/;
export function parseRawDiff(raw) {
  const parts = raw.split('\0');
  if (parts.pop() !== '' || parts.length % 2) throw Error('invalid raw diff');
  const seen = new Set();
  const files = [];
  for (let i = 0; i < parts.length; i += 2) {
    const match = /^:100644 100644 [0-9a-f]+ [0-9a-f]+ M$/.test(parts[i]);
    const filename = parts[i+1];
    if (!match || !filename || seen.has(filename)) throw Error('unsafe diff record');
    seen.add(filename);
    files.push({ filename, status: 'modified' });
  }
  return files;
}
export function resolveCiMode({ eventName, base, head, merge, git } = {}) {
  if (eventName !== 'pull_request' || ![base,head,merge].every(x => typeof x === 'string' && sha.test(x))) return full('invalid event revisions');
  try {
    if (git(['rev-parse','HEAD']).trim() !== base) return full('untrusted checkout');
    if (git(['rev-list','--parents','-n','1',merge]).trim() !== [merge,base,head].join(' ')) return full('merge parents mismatch');
    const args = ['diff','--raw','-z','--no-renames','--no-ext-diff','--no-textconv'];
    for (const range of [[base+'...'+head],[base,merge]]) {
      const files = parseRawDiff(git([...args,...range,'--']));
      if (classifyCiChanges({eventName,files,complete:true}).mode !== 'lightweight') return full('non-documentation or empty diff');
    }
    return {mode:'lightweight',reason:'verified immutable documentation diffs'};
  } catch { return full('git verification failed'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cwd = fileURLToPath(new URL('../',import.meta.url));
  const git = args => execFileSync('git',['-C',cwd,...args],{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','ignore']});
  const decision = resolveCiMode({eventName:process.env.GITHUB_EVENT_NAME,base:process.env.BASE_SHA,head:process.env.HEAD_SHA,merge:process.env.MERGE_SHA,git});
  process.stdout.write(decision.mode+'\n');
}
