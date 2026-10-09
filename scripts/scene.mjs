#!/usr/bin/env node
import { readFile, writeFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const original = join(root, 'assets/ascii');
const usage = 'scene.mjs reference <original-slug> <empty-directory> | verify-brief <brief.json> | build <project> | check <project> [--loop seconds] | check-library';
const [command, arg, target, flag, seconds] = process.argv.slice(2);
const exists = async path => { try { await stat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const files = async project => (await readdir(join(project, 'src/pieces'))).filter(n => n.endsWith('.ts'));

async function build(project) {
  const names = await files(project);
  assert.equal(names.length, 1, 'a preview project must contain one authoritative scene');
  for (const [from,to] of [[`src/pieces/${names[0]}`,'piece.js'],['src/mount.ts','mount.js']]) {
    const source = await readFile(join(project,from),'utf8');
    await writeFile(join(project,to),stripTypeScriptTypes(source));
  }
  console.log(`Built ${project}`);
}

function officialCheck(project, slugs) {
  const result = spawnSync(process.execPath,[join(project,'scripts/check.ts'),...slugs],{encoding:'utf8'});
  if (result.error) throw result.error;
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return result.status === 0;
}

async function parity(project, period) {
  const names = await files(project);
  assert.equal(names.length, 1, 'check one preview scene at a time');
  const source = await import(pathToFileURL(join(project,'src/pieces',names[0])).href);
  const compiled = await import(pathToFileURL(join(project,'piece.js')).href);
  assert.deepEqual(compiled.meta,source.meta,'compiled metadata is stale; run build');
  const a = source.default(), b = compiled.default();
  const take = (frame,t) => {
    const color = source.meta.palette ? new Uint8Array(source.meta.cols * source.meta.rows).fill(255) : undefined;
    const text=frame(t,{color});
    if (color) assert.ok(color.every(v=>v<source.meta.palette.length),'frame must write every color cell with a valid index');
    return {text,color};
  };
  for (const t of [0,1,2.5,5]) assert.deepEqual(take(a,t),take(b,t),`TS/JS parity at ${t}s; run build`);
  if (period !== undefined) {
    const first = take(a,0);
    assert.deepEqual(take(a,period),first,'loop endpoints differ');
    const fps=source.meta.fps, count=period*fps;
    assert.ok(fps>0 && Number.isInteger(count) && count>=3,'loop must contain at least three whole frames at meta.fps');
    const distance=(left,right)=> {
      const x=[...left.text.replaceAll('\n','')], y=[...right.text.replaceAll('\n','')];
      return x.reduce((n,c,i)=>n+(c!==y[i] || left.color?.[i]!==right.color?.[i] ? 1 : 0),0);
    };
    const last=take(a,(count-1)/fps), prior=take(a,(count-2)/fps), next=take(a,1/fps);
    const changed=distance(last,first), adjacent=Math.max(distance(prior,last),distance(first,next));
    assert.ok(changed<=adjacent,'actual last-frame loop seam exceeds adjacent frame changes');
    console.log(`PASS: ${period}s loop at ${fps}fps, ${changed} seam / ${adjacent} adjacent cell changes; visual inspection still required`);
  }
  console.log('PASS: source/browser parity at four times');
}

try {
  const [major,minor] = process.versions.node.split('.').map(Number);
  assert.ok(major>23 || major===23 && minor>=6,'Node 23.6+ is required');
  if (command === 'reference' && arg && target && !flag) {
    assert.match(arg,/^[a-z0-9]+(-[a-z0-9]+)*$/,'invalid scene slug');
    const source = original;
    assert.ok(await exists(join(source,'src/pieces',`${arg}.ts`)),`unknown original reference: ${arg}`);
    const project=resolve(target);
    if (await exists(project)) assert.equal((await readdir(project)).length,0,'target must be empty; no files overwritten');
    for (const dir of ['src/pieces','scripts']) await mkdir(join(project,dir),{recursive:true});
    for (const path of ['src/mount.ts','src/types.ts','scripts/check.ts',`src/pieces/${arg}.ts`]) await copyFile(join(source,path),join(project,path));
    await copyFile(join(original,'LICENSE'),join(project,'LICENSE-ascii.rest.txt'));
    for (const name of ['index.html','app.js']) await copyFile(join(root,'assets/preview',name),join(project,name));
    await build(project);
    console.log('Original technique reference only. This is not a redraw of the requested place.');
  } else if (command === 'verify-brief' && arg && !target) {
    const path=resolve(arg), brief=JSON.parse(await readFile(path,'utf8'));
    assert.ok(['place','image'].includes(brief.input_kind),'input_kind must be place or image');
    assert.ok(typeof brief.requested==='string' && brief.requested.trim(),'requested input missing');
    assert.ok(typeof brief.art_direction==='string' && brief.art_direction.trim(),'art_direction must describe framing, hierarchy and lighting before drawing');
    const ref=brief.reference;
    assert.ok(ref && ref.viewed===true,'reference image must actually be viewed');
    assert.ok(typeof ref.identity_evidence==='string' && ref.identity_evidence.trim(),'reference identity evidence missing');
    if (brief.input_kind==='place') {
      assert.ok(typeof brief.resolved_place==='string' && brief.resolved_place.trim(),'specific resolved place missing');
      assert.ok(/^https?:\/\//.test(ref.page),'source page URL missing');
    }
    const bytes=await readFile(resolve(dirname(path),ref.file));
    assert.ok(bytes.length>=12 && (bytes[0]===255 && bytes[1]===216 && bytes[2]===255 || bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP'),'reference must have a JPEG, PNG or WebP signature; decoding and visual inspection are separate');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),ref.sha256,'reference file differs from the inspected image');
    for (const key of ['observed','preserve']) assert.ok(Array.isArray(brief[key]) && brief[key].length>0 && brief[key].every(v=>typeof v==='string' && v.trim()),`${key} must describe the actual image`);
    const profiles=JSON.parse(await readFile(join(root,'references/techniques.json'),'utf8'));
    assert.ok(Array.isArray(brief.techniques) && brief.techniques.length>0,'choose drawing techniques');
    for (const item of brief.techniques) {
      assert.ok(profiles.some(p=>p.id===item.id),`unknown technique ${item.id}`);
      for (const key of ['apply','omit']) assert.ok(Array.isArray(item[key]) && item[key].length>0 && item[key].every(v=>typeof v==='string' && v.trim()),`${item.id}: explain ${key}`);
    }
    assert.ok(Array.isArray(brief.transformations),'declare transformations, even when empty');
    assert.ok(Array.isArray(brief.unresolved) && brief.unresolved.length===0,'resolve source/visual conflicts before drawing');
    console.log('PASS: reference file and evidence record are complete. This checks declarations, not geographic or visual truth.');
  } else if (command === 'build' && arg && !target) {
    await build(resolve(arg));
  } else if (command === 'check' && arg && (target===undefined || target==='--loop' && flag!==undefined && seconds===undefined)) {
    const period=target===undefined ? undefined : Number(flag);
    if (period!==undefined) assert.ok(Number.isFinite(period)&&period>0,'loop seconds must be positive and finite');
    const project=resolve(arg);
    const passed=officialCheck(project,(await files(project)).map(n=>n.slice(0,-3)));
    await parity(project,period);
    assert.ok(passed,'official scene check failed; see errors above');
  } else if (command === 'check-library' && !arg) {
    const manifest=JSON.parse(await readFile(join(root,'references/upstream.json'),'utf8'));
    for (const [file,expected] of Object.entries(manifest.files)) {
      const actual=createHash('sha256').update(await readFile(join(original,file))).digest('hex');
      assert.equal(actual,expected,`upstream source modified: ${file}`);
    }
    const profiles=JSON.parse(await readFile(join(root,'references/techniques.json'),'utf8'));
    assert.deepEqual(profiles.map(c=>c.id).sort(),[...manifest.scenes].sort(),'drawing guidance must cover all 15 original references');
    console.log('PASS: 19 upstream file hashes and coverage of 15 drawing techniques. Frame timing is checked separately with check.');
  } else throw new Error(usage);
} catch (error) {
  console.error(error.message);
  process.exitCode=1;
}
