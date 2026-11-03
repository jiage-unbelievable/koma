import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {ChapterEvidence} from './ChapterEvidence.js';
it('shows all referenced original sentences and only the frames belonging to that chapter',()=>{
 const html=renderToStaticMarkup(createElement(ChapterEvidence,{chapter:{spokenSummary:'Spoken point',visualSummary:'Visible fact',transcriptIndices:[0,2],frameFilenames:['own.jpg']},transcript:[{text:'Opening sentence',startMs:0,endMs:1000},{text:'Other chapter',startMs:1500,endMs:1900},{text:'Ending sentence',startMs:2000,endMs:2900}],frames:[{filename:'own.jpg',url:'/api/jobs/test/frames/own.jpg',atMs:2000,caption:'Own evidence'},{filename:'other.jpg',url:'/api/jobs/test/frames/other.jpg',atMs:3000,caption:'Foreign evidence'}],onSeek:()=>{},language:'zh'}));
 expect(html).toContain('Opening sentence');expect(html).toContain('Ending sentence');expect(html).toContain('Own evidence');expect(html).not.toContain('Other chapter');expect(html).not.toContain('Foreign evidence');expect(html).toContain('查看讲话原文与画面证据');
});
