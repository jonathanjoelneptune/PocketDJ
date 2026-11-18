import assert from 'node:assert/strict';
import test from 'node:test';
import { ScratchVinylTransport, scratchOffsetsFromArms, scratchOffsetsFromLegacy } from '../src/dj/vinylScratch.ts';
const degrees=x=>x*180/Math.PI;

test('resting hand follows regular RPM',()=>{
 const v=new ScratchVinylTransport();v.setGesture('a10',{left:0,right:0});
 assert.ok(Math.abs(degrees(v.step('left',0,100,true,16.2))-9.72)<0.01);
});
test('forward hand stroke, hold and reverse share one angle',()=>{
 const v=new ScratchVinylTransport(4);v.setGesture('a10',{left:0,right:0});
 let angle=v.step('left',0,100,true,16.2);
 v.setGesture('a10',{left:10,right:0});angle=v.step('left',angle,100,true,16.2);
 assert.ok(Math.abs(degrees(angle)-49.72)<0.01);
 v.setGesture('a10',{left:10,right:0});assert.equal(v.step('left',angle,100,true,16.2),angle);
 v.setGesture('a10',{left:0,right:0});angle=v.step('left',angle,100,true,16.2);
 assert.ok(Math.abs(degrees(angle)-9.72)<0.01);
 angle=v.step('left',angle,100,true,16.2);assert.ok(Math.abs(degrees(angle)-19.44)<0.01);
});
test('the other platter remains motor-driven during a one-hand scratch',()=>{
 const v=new ScratchVinylTransport();v.setGesture('a10',{left:0,right:0});
 v.step('left',0,100,true,16.2);v.setGesture('a10',{left:12,right:0});
 assert.ok(Math.abs(degrees(v.step('right',0,100,true,16.2))-9.72)<0.01);
});
test('pose-family swaps cannot instantly spin a disc',()=>{
 const v=new ScratchVinylTransport();v.setGesture('a10',{left:0,right:0});
 const angle=v.step('left',0,100,true,16.2);
 v.setGesture('a44',{left:12,right:0});assert.equal(v.step('left',angle,100,true,16.2),angle);
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
 assert.equal(transport.step('right',forward,100,true,16.2),forward);
 transport.setGesture('a44',base);
 const backward=transport.step('right',forward,100,true,16.2);
 assert.ok(backward<forward);
});
test('Scratch Rig arm rotation and calibrated anchor move the record without adding a new animation',()=>{
 const pivots={left:{x:225,y:211},right:{x:371,y:211}},base={x:0,y:0,tilt:0};
 const states={left:[base,{x:0,y:0,tilt:8},{x:0,y:0,tilt:-8},{x:0,y:0,tilt:4}],right:[base,base,base,base]};
 const moved=scratchOffsetsFromArms('a44',{left:states.left[1],right:base},pivots,states,{left:{x:150,y:335}});
 assert.ok(Math.abs(moved.left)>1);assert.equal(moved.right,0);
 assert.deepEqual(scratchOffsetsFromArms('a44',{left:base,right:base},pivots,states),{left:0,right:0});
});
