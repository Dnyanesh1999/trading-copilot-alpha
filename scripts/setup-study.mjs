import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
const file=new URL('../worker/.dev.vars',import.meta.url);
let text='';try{text=readFileSync(file,'utf8')}catch{}
if(!parseEnv(text).STUDY_ADMIN_TOKEN){writeFileSync(file,text+'\nSTUDY_ADMIN_TOKEN='+randomBytes(32).toString('hex')+'\n',{mode:0o600});}
chmodSync(file,0o600);
console.log('Local study researcher secret configured; no value printed. Restart Vite after setup. Rehearsal mode only.');
