/** Optional visual-only scratch transport, enabled with ?scratchVinyl=1. */
export type ScratchSide = 'left' | 'right';
export type ScratchArm = { x: number; y: number; tilt: number };
export type ScratchArmPair = Record<ScratchSide, ScratchArm>;
export type ScratchPivotPair = Record<ScratchSide, { x: number; y: number }>;
export type ScratchOffsets = Record<ScratchSide, number>;
export const EMPTY_SCRATCH: ScratchOffsets = Object.freeze({ left: 0, right: 0 });
export const SCRATCH_VINYL_DEGREES_PER_PX = 4.5;

export const SCRATCH_VINYL_HANDS: Record<string, {
  left: { hand: readonly [number, number]; frames: readonly number[] } | null;
  right: { hand: readonly [number, number]; frames: readonly number[] } | null;
}> = {
  a10: { left: { hand: [164, 374], frames: [0, 12, 7, -2] }, right: null },
  a4: { left: { hand: [148, 373], frames: [0, 12, 8, -3] }, right: null },
  a14: { left: null, right: { hand: [435, 377], frames: [0, 10, 5, -3] } },
  a44: { left: { hand: [165, 374], frames: [0, 0, 10, 4] }, right: { hand: [439, 373], frames: [0, 12, 0, 7] } },
  a47: { left: { hand: [165, 374], frames: [0, 0, 10, 4] }, right: { hand: [440, 373], frames: [0, 12, 0, 7] } },
  a48: { left: { hand: [160, 373], frames: [0, 11, 0, 6] }, right: { hand: [434, 373], frames: [0, 0, 13, 7] } },
};
const clamp = (x:number) => Math.max(0, Math.min(1, x));
const mix = (a:number,b:number,t:number)=> a+(b-a)*t;
const rad = (x:number)=> x*Math.PI/180;
const wrap = (x:number)=> ((x % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
function poseIndex(family:string, frame:string|null):number {
  if(frame===family+'.png')return 0;
  if(frame===family+'-2.png')return 1;
  if(frame===family+'-3.png')return 2;
  return 0;
}
/** Use the same 0–1 transition progress as the rendered legacy sprite blend. */
export function scratchOffsetsFromLegacy(family:string, fromFrame:string, toFrame:string, fraction:number):ScratchOffsets{
  const entry=SCRATCH_VINYL_HANDS[family];
  if(!entry)return {...EMPTY_SCRATCH};
  const a=poseIndex(family,fromFrame),b=poseIndex(family,toFrame),t=clamp(fraction);
  return {
    left:entry.left ? mix(entry.left.frames[a]??0,entry.left.frames[b]??0,t):0,
    right:entry.right ? mix(entry.right.frames[a]??0,entry.right.frames[b]??0,t):0,
  };
}
/** Compute hand displacement from a real shoulder-pivot arm transform. */
export function scratchOffsetsFromArms(family:string, motion:ScratchArmPair, pivots:ScratchPivotPair):ScratchOffsets{
  const entry=SCRATCH_VINYL_HANDS[family];
  if(!entry)return {...EMPTY_SCRATCH};
  const offsets={...EMPTY_SCRATCH};
  for(const side of ['left','right'] as const){
    const contact=entry[side],arm=motion[side],pivot=pivots[side];
    if(!contact||!arm||!pivot||!Number.isFinite(arm.y)||!Number.isFinite(arm.tilt))continue;
    const angle=rad(arm.tilt),dx=contact.hand[0]-pivot.x,dy=contact.hand[1]-pivot.y;
    offsets[side]=arm.y+dx*Math.sin(angle)+dy*(Math.cos(angle)-1);
  }
  return offsets;
}
/** Angle stays continuous: hand motion displaces record, holding locks it,
 * returning to neutral releases it to the normal RPM without reset. */
export class ScratchVinylTransport{
  private family:string|null=null;
  private target:ScratchOffsets={...EMPTY_SCRATCH};
  private previous:ScratchOffsets={...EMPTY_SCRATCH};
  constructor(private readonly sensitivity=SCRATCH_VINYL_DEGREES_PER_PX){}
  setGesture(family:string|null, offsets:ScratchOffsets|null):void{
    const valid=family && SCRATCH_VINYL_HANDS[family]?family:null;
    if(valid!==this.family){
      this.previous=valid&&offsets?{...offsets}:{...EMPTY_SCRATCH};
      this.family=valid;
    }
    this.target=valid&&offsets?{...offsets}:{...EMPTY_SCRATCH};
  }
  step(side:ScratchSide,angle:number,elapsedMs:number,playing:boolean,rpm:number):number{
    if(!playing||!Number.isFinite(elapsedMs)||elapsedMs<=0)return angle;
    const current=this.family?this.target[side]:0,prev=this.family?this.previous[side]:0;
    const held=this.family!==null&&(Math.abs(current)>0.06||Math.abs(prev)>0.06);
    const delta=held?rad((current-prev)*this.sensitivity):rpm*Math.PI*2*elapsedMs/60000;
    this.previous[side]=current;
    return wrap(angle+delta);
  }
  reset():void{this.family=null;this.target={...EMPTY_SCRATCH};this.previous={...EMPTY_SCRATCH};}
}
