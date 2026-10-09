import { mount } from './mount.js';
import * as piece from './piece.js';

const canvas=document.querySelector('canvas');
const play=document.querySelector('#play');
if (document.querySelector('h1').textContent==='点阵场景') document.querySelector('h1').textContent=piece.meta.name;
if (document.title==='点阵场景') document.title=piece.meta.name;
if (!document.querySelector('#note').textContent) document.querySelector('#note').textContent=piece.meta.note;
if (canvas.getAttribute('aria-label')==='彩色点阵场景动画') canvas.setAttribute('aria-label',piece.meta.note);
let active=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let elapsed=0,current=0;
const frame=piece.default();
const session={...piece,default:()=> (t,env)=> {current=t+elapsed;return frame(current,env);}};
let stop=mount(canvas,session);
play.textContent=active?'暂停':'播放';
play.addEventListener('click',()=> {
  stop();elapsed=current;active=!active;
  stop=mount(canvas,session,active?{motion:true}:{fps:0});
  play.textContent=active?'暂停':'播放';
});
document.querySelector('#reset').addEventListener('click',()=> {
  stop();elapsed=0;active=true;stop=mount(canvas,session,{motion:true});play.textContent='暂停';
});
