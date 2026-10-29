// Tag the current main as a release. The Beelink deploys the newest v* tag within five minutes.
// Usage: npm run release [-- patch|minor|major]
import { execSync } from 'child_process';

const run = (command) => execSync(command, { stdio: 'inherit' });
const read = (command) => execSync(command, { encoding: 'utf8' }).trim();
const bump = process.argv[2] ?? 'patch';

if (!['patch', 'minor', 'major'].includes(bump)) throw new Error(`Unknown bump "${bump}"; use patch, minor or major`);
if (read('git branch --show-current') !== 'main') throw new Error('Release from main');
if (read('git status --porcelain')) throw new Error('Commit or stash your changes first');
run('git fetch --quiet origin main');
if (read('git rev-parse HEAD') !== read('git rev-parse origin/main')) throw new Error('Local main differs from origin/main; pull or push first');

run(`npm version ${bump} -m "Release v%s"`);
run('git push --follow-tags origin main');
console.log(`Released ${read('git describe --tags --abbrev=0')}. The Beelink deploys it within five minutes.`);
