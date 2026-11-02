import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
const dir=resolve(process.env.DATA_DIR||'data'), target=resolve(process.argv[2]||`${dir}/backups/game-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
if(existsSync(target))throw new Error('Backup destination already exists; choose a new filename.');
mkdirSync(resolve(target,'..'),{recursive:true});
const db=new DatabaseSync(resolve(dir,'games.sqlite'));db.prepare('VACUUM INTO ?').run(target);db.close();console.log(`Consistent backup saved: ${target}`);
