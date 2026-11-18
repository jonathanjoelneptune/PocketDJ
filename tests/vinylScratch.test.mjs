import assert from 'node:assert/strict';
import test from 'node:test';
import { ScratchVinylTransport, RigScratchVinylSampler, scratchRigSignedLevels, SCRATCH_VINYL_DIRECTION, SCRATCH_FORWARD_ORDER, scratchOffsetsFromArms, scratchOffsetsFromLegacy } from '../src/dj/vinylScratch.ts';
const degrees=x=>x*180/Math.PI;

test('resting hand follows regular RPM',()=>{
 const v=new ScratchVinylTransport();v.setGesture('a10',{left:0,right:0});
 assert.ok(Math.abs(degrees(v.step('left',0,100,true,16.2))-9.72)<0.01);
});
test('forward stroke scratches, held pose resumes RPM, and reverse scratches without an angle reset',()=>{
 const v=new ScratchVinylTransport(4);v.setGesture('a10',{left:0,right:0});
 let angle=v.step('left',0,100,true,16.2);
 v.setGesture('a10',{left:10,right:0});angle=v.step('left',angle,100,true,16.2);
 assert.ok(Math.abs(degrees(angle)-329.72)<0.01); // Left deck forward is CCW
 v.setGesture('a10',{left:10,right:0});angle=v.step('left',angle,100,true,16.2);
 assert.ok(Math.abs(degrees(angle)-339.44)<0.01); // The hand has stopped; the platter resumes RPM.
 v.setGesture('a10',{left:0,right:0});angle=v.step('left',angle,100,true,16.2);
 assert.ok(Math.abs(degrees(angle)-19.44)<0.01); // Returning hand scratches backward.
 angle=v.step('left',angle,100,true,16.2);assert.ok(Math.abs(degrees(angle)-29.16)<0.01);
});
test('the other platter remains motor-driven during a one-hand scratch',()=>{
 const v=new ScratchVinylTransport();v.setGesture('a10',{left:0,right:0});
 v.step('left',0,100,true,16.2);v.setGesture('a10',{left:12,right:0});
 assert.ok(Math.abs(degrees(v.step('right',0,100,true,16.2))-9.72)<0.01);
});
test('pose-family swaps never create a scratch-angle jump; platter resumes ordinary RPM',()=>{
 const v=new ScratchVinylTransport();v.setGesture('a10',{left:0,right:0});
 const angle=v.step('left',0,100,true,16.2);
 v.setGesture('a44',{left:12,right:0});
 assert.ok(Math.abs(degrees(v.step('left',angle,100,true,16.2))-19.44)<0.01);
});
test('pause freezes the angle',()=>{
 const v=new ScratchVinylTransport();v.setGesture('a14',{left:0,right:7});
 const angle=v.step('right',0,100,true,16.2);
 assert.equal(v.step('right',angle,400,false,16.2),angle);
});
test('legacy pose offsets preserve both scratch directions',()=>{
 assert.deepEqual(scratchOffsetsFromLegacy('a14','a14.png','a14-2.png',0.5),{left:0,right:5});
 assert.deepEqual(scratchOffsetsFromLegacy('a44','a44-2.png','a44.png',0.5),{left:0,right:6});
});
test('rig pivot rotation contributes to measured hand displacement',()=>{
 const m={left:{x:0,y:10,tilt:0},right:{x:0,y:0,tilt:0}};
 const p={left:{x:217,y:226},right:{x:372,y:226}};
 assert.deepEqual(scratchOffsetsFromArms('a10',m,p),{left:10,right:0});
});

test('Scratch Rig 1 and 2 drive only the hand that actually moves',()=>{
 const p={left:{x:225,y:211},right:{x:371,y:211}},zero={x:0,y:0,tilt:0};
 const states={
  left:[zero,zero,{x:-1,y:10,tilt:-3},{x:2,y:4,tilt:2}],
  right:[zero,{x:9,y:12,tilt:4},zero,{x:5,y:7,tilt:2}],
 };
 const base=scratchOffsetsFromArms('a44',{left:zero,right:zero},p,states);
 const scratch1=scratchOffsetsFromArms('a44',{left:zero,right:states.right[1]},p,states);
 const scratch2=scratchOffsetsFromArms('a44',{left:states.left[2],right:zero},p,states);
 assert.deepEqual(base,{left:0,right:0});
 assert.equal(scratch1.left,0);assert.ok(Math.abs(scratch1.right)>3);
 assert.equal(scratch2.right,0);assert.ok(Math.abs(scratch2.left)>3);
 const transport=new ScratchVinylTransport(4.5);
 transport.setGesture('a44',base);
 let angle=transport.step('right',0,100,true,16.2);
 transport.setGesture('a44',scratch1);
 const forward=transport.step('right',angle,100,true,16.2);
 assert.notEqual(forward,angle);
 transport.setGesture('a44',scratch1);
 const held=transport.step('right',forward,100,true,16.2);
 assert.ok(Math.abs(degrees(held-forward)-9.72)<0.01); // No hand motion means normal spin.
 transport.setGesture('a44',base);
 const backward=transport.step('right',held,100,true,16.2);
 assert.ok(backward<forward);
});
test('Scratch Rig arm rotation and calibrated anchor move the record without adding a new animation',()=>{
 const pivots={left:{x:225,y:211},right:{x:371,y:211}},base={x:0,y:0,tilt:0};
 const states={left:[base,{x:0,y:0,tilt:8},{x:0,y:0,tilt:-8},{x:0,y:0,tilt:4}],right:[base,base,base,base]};
 const moved=scratchOffsetsFromArms('a44',{left:states.left[1],right:base},pivots,states,{left:{x:150,y:335}});
 assert.ok(Math.abs(moved.left)>1);assert.equal(moved.right,0);
 assert.deepEqual(scratchOffsetsFromArms('a44',{left:base,right:base},pivots,states),{left:0,right:0});
});

test('approved forward orders and canvas angular signs match all six families',()=>{
 const wanted={
  a10:{left:[1,2,0,3],right:null,signs:[-1,0]},
  a4:{left:[1,2,0,3],right:null,signs:[-1,0]},
  a14:{left:null,right:[1,2,0,3],signs:[0,1]},
  a44:{left:[2,3,0],right:[1,3,0],signs:[-1,1]},
  a47:{left:[2,3,0],right:[1,3,0],signs:[-1,1]},
  a48:{left:[1,3,0],right:[2,3,0],signs:[-1,1]},
 };
 for(const [family,entry] of Object.entries(wanted)){
  assert.deepEqual(SCRATCH_FORWARD_ORDER[family].left,entry.left);
  assert.deepEqual(SCRATCH_FORWARD_ORDER[family].right,entry.right);
  assert.deepEqual([SCRATCH_VINYL_DIRECTION[family].left,SCRATCH_VINYL_DIRECTION[family].right],entry.signs);
 }
});
test('A14 forward right-hand scratching rotates clockwise, matching the corrected calibration',()=>{
 const a14=new ScratchVinylTransport(4),a44=new ScratchVinylTransport(4);
 a14.setGesture('a14',{left:0,right:0});a44.setGesture('a44',{left:0,right:0});
 a14.step('right',0,100,true,16.2);a44.step('right',0,100,true,16.2);
 a14.setGesture('a14',{left:0,right:10});a44.setGesture('a44',{left:0,right:10});
 const aa=a14.step('right',0,100,true,16.2),bb=a44.step('right',0,100,true,16.2);
 assert.ok(Math.abs(degrees(aa)-40)<0.001);assert.ok(Math.abs(degrees(bb)-40)<0.001);
});
test('geometry preserves all four rig travel distances but uses explicit forward ordering',()=>{
 const base={x:0,y:0,tilt:0};
 const rig={pivots:{left:{x:225,y:211},right:{x:371,y:211}},
  scratchFrames:{left:[base,base,{x:0,y:10,tilt:0},{x:0,y:4,tilt:0}],
                 right:[base,{x:0,y:12,tilt:0},base,{x:0,y:7,tilt:0}]},
  handAnchors:{left:{x:165,y:374},right:{x:439,y:373}}};
 const levels=scratchRigSignedLevels('a44',rig);
 assert.deepEqual(levels.left,[0,0,10,4]);
 assert.deepEqual(levels.right,[0,12,0,7]);
});
test('rig sampler uses exactly the arm timeline including direct skips and interruptions',()=>{
 const base={x:0,y:0,tilt:0};
 const rig={pivots:{left:{x:225,y:211},right:{x:371,y:211}},
  scratchFrames:{left:[base,base,{x:0,y:10,tilt:0},{x:0,y:4,tilt:0}],
                 right:[base,{x:0,y:12,tilt:0},base,{x:0,y:7,tilt:0}]}};
 const sampler=new RigScratchVinylSampler();
 let x=sampler.sample('a44',{targetIndex:0,transitionId:1,progress:1},rig);
 assert.deepEqual(x,{left:0,right:0});
 x=sampler.sample('a44',{targetIndex:1,transitionId:2,progress:.5},rig);
 assert.deepEqual(x,{left:0,right:6});
 x=sampler.sample('a44',{targetIndex:3,transitionId:3,progress:0},rig);
 assert.deepEqual(x,{left:0,right:6}); // interrupt from actual current position
 x=sampler.sample('a44',{targetIndex:3,transitionId:3,progress:.5},rig);
 assert.deepEqual(x,{left:2,right:6.5});
 x=sampler.sample('a44',{targetIndex:2,transitionId:4,progress:1},rig);
 assert.deepEqual(x,{left:10,right:0});
 sampler.reset();
 assert.deepEqual(sampler.sample('a44',{targetIndex:0,transitionId:5,progress:1},rig),{left:0,right:0});
});

test('a non-Base scratch pose held for one second free-spins instead of pinning the album',()=>{
 const v=new ScratchVinylTransport();
 v.setGesture('a14',{left:0,right:0});
 let angle=v.step('right',0,100,true,16.2);
 v.setGesture('a14',{left:0,right:10});
 angle=v.step('right',angle,100,true,16.2);
 const afterStroke=angle;
 v.setGesture('a14',{left:0,right:10});
 angle=v.step('right',angle,1000,true,16.2);
 assert.ok(Math.abs(degrees(((angle-afterStroke+Math.PI*2)%(Math.PI*2)))-97.2)<0.01);
 // A14 remains at Scratch 1, not Base. Its direction calibration is unchanged.
 assert.equal(SCRATCH_VINYL_DIRECTION.a14.right,1);
});
test('both active decks resume motor rotation independently on a dual-arm scratch hold',()=>{
 const v=new ScratchVinylTransport();
 v.setGesture('a44',{left:0,right:0});
 let l=v.step('left',0,100,true,16.2),r=v.step('right',0,100,true,16.2);
 v.setGesture('a44',{left:10,right:12});
 l=v.step('left',l,100,true,16.2);r=v.step('right',r,100,true,16.2);
 const beforeHold={left:l,right:r};
 v.setGesture('a44',{left:10,right:12});
 l=v.step('left',l,300,true,16.2);r=v.step('right',r,300,true,16.2);
 const motorDelta=300*16.2*360/60000;
 for(const side of ['left','right']){
  const next=side==='left'?l:r;
  const previous=beforeHold[side];
  assert.ok(Math.abs(degrees(((next-previous+Math.PI*2)%(Math.PI*2)))-motorDelta)<0.01);
 }
});
test('subpixel hand jitter does not cause vinyl to freeze between actual scratch strokes',()=>{
 const v=new ScratchVinylTransport();
 v.setGesture('a10',{left:10,right:0});
 let angle=v.step('left',0,100,true,16.2);
 v.setGesture('a10',{left:10.0000001,right:0});
 angle=v.step('left',angle,100,true,16.2);
 assert.ok(Math.abs(degrees(angle)-19.44)<0.01);
});
