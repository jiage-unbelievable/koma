import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {transcribe} from './asr.js';import {config} from '../config/config.js';
it('keeps later audio slices on the global timeline and scopes speaker IDs using seconds correctly',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'koma-asr-offset-'));const path=join(dir,'chunk.mp3');await writeFile(path,'audio-fixture');
 try{
  const offset=config.asrSegmentSeconds*1000;
  const lines=await transcribe({audioSegments:[{filename:'chunk.mp3',path,startMs:offset,endMs:offset+2000}],provider:'openai-compatible',apiKey:'fixture-only',baseUrl:'http://unused.test',model:'asr-1.0',fetchImpl:async()=>new Response(JSON.stringify({segments:[{start:.1,end:1,text:'Ending sentence.',speaker:'S1'}]}),{status:200})});
  expect(lines).toEqual([{startMs:offset+100,endMs:offset+1000,text:'Ending sentence.',speaker:'片段2 / S1'}]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
