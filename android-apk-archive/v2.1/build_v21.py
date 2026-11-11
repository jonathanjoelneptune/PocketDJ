#!/usr/bin/env python3
"""PocketDJ Spotify v2.1: preloaded persistent session, geometry and gesture stability.
Preserves the stable v1.4 scroll-hosted WebView, OAuth, and view toggle.
"""
from __future__ import annotations
import struct, hashlib, zlib, io, os, zipfile, itertools, json, time
from pathlib import Path
from dataclasses import dataclass, field
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from datetime import datetime, timedelta, timezone

ROOT=Path('/mnt/data/pdj_v21')
SRC=Path('/mnt/data/Spotify_+Music+and+Podcasts_9.1.98.621_APKPure.apk')
DST=Path('/mnt/data/PocketDJ-Spotify-v2.1-CORE-STABILITY.apk')
END=0xffffffff
p16=lambda n:struct.pack('<H',n)
p32=lambda n:struct.pack('<I',n)
p64=lambda n:struct.pack('<Q',n)
u16=lambda b,o:struct.unpack_from('<H',b,o)[0]
u32=lambda b,o:struct.unpack_from('<I',b,o)[0]


def leb(n):
    out=bytearray()
    while True:
        v=n&127;n>>=7
        if n:v|=128
        out.append(v)
        if not n: return bytes(out)

def aligned(data, n=4):
    while len(data)%n:data.extend(b'\0')

H='Lcom/pocketdj/Hook;'
FRAME='Landroid/widget/FrameLayout;'
FLP='Landroid/widget/FrameLayout$LayoutParams;'
VG='Landroid/view/ViewGroup;'
VGLP='Landroid/view/ViewGroup$LayoutParams;'
MARGIN='Landroid/view/ViewGroup$MarginLayoutParams;'
VIEW='Landroid/view/View;'
LISTENER='Landroid/view/View$OnClickListener;'
WEB='Landroid/webkit/WebView;'
CLIENT='Landroid/webkit/WebViewClient;'
SESSIONCLIENT='Lcom/pocketdj/spotifyexperiment/PocketDjSessionWebViewClient;'
PRELOADER='Lcom/pocketdj/spotifyexperiment/PocketDjPreloader;'
SETTINGS='Landroid/webkit/WebSettings;'
BUTTON='Landroid/widget/Button;'
CTX='Landroid/content/Context;'
ATTR='Landroid/util/AttributeSet;'
STRING='Ljava/lang/String;'
CHARS='Ljava/lang/CharSequence;'
OBSERVER='Landroid/view/ViewTreeObserver;'
SCROLLLISTENER='Landroid/view/ViewTreeObserver$OnScrollChangedListener;'
GLOBALLAYOUTLISTENER='Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;'
CALLBACK='Landroid/webkit/ValueCallback;'

M=(
 (FRAME,'<init>','V',(CTX,ATTR)),(FRAME,'onAttachedToWindow','V',()),
 (FRAME,'getContext',CTX,()),(FRAME,'onDetachedFromWindow','V',()),(FRAME,'addView','V',(VIEW,VGLP)),(FRAME,'removeView','V',(VIEW,)),
 (VIEW,'getWidth','I',()),(VIEW,'getHeight','I',()),(VIEW,'getScrollY','I',()),
 (VIEW,'getRootView',VIEW,()),(VIEW,'getLocationInWindow','V',('[I',)),
 (VIEW,'getViewTreeObserver',OBSERVER,()),(VIEW,'findViewById',VIEW,('I',)),
 (VIEW,'setTranslationY','V',('F',)),
 (OBSERVER,'addOnScrollChangedListener','V',(SCROLLLISTENER,)),
 (OBSERVER,'removeOnScrollChangedListener','V',(SCROLLLISTENER,)),
 (OBSERVER,'addOnGlobalLayoutListener','V',(GLOBALLAYOUTLISTENER,)),
 (OBSERVER,'removeOnGlobalLayoutListener','V',(GLOBALLAYOUTLISTENER,)),
 (VG,'getChildCount','I',()),(VG,'getChildAt',VIEW,('I',)),
 (VIEW,'setVisibility','V',('I',)),(VIEW,'setLayoutParams','V',(VGLP,)),
 (FLP,'<init>','V',('I','I')),
 (BUTTON,'<init>','V',(CTX,)),(BUTTON,'setText','V',(CHARS,)),
 (WEB,'<init>','V',(CTX,)),(WEB,'evaluateJavascript','V',(STRING,CALLBACK)),(WEB,'getSettings',SETTINGS,()),(WEB,'loadUrl','V',(STRING,)),(WEB,'destroy','V',()),
 (SESSIONCLIENT,'<init>','V',(CTX,)),(PRELOADER,'<init>','V',()),(PRELOADER,'schedule','V',(VIEW,)),(WEB,'setWebViewClient','V',(CLIENT,)),
 (SETTINGS,'setJavaScriptEnabled','V',('Z',)),(SETTINGS,'setDomStorageEnabled','V',('Z',)),(SETTINGS,'setOffscreenPreRaster','V',('Z',)),
 (VIEW,'setBackgroundColor','V',('I',)),(VIEW,'setElevation','V',('F',)),(VIEW,'setOnClickListener','V',(LISTENER,)),(VIEW,'bringToFront','V',()),
 (H,'<init>','V',(CTX,ATTR)),(H,'onAttachedToWindow','V',()),
 (H,'onClick','V',(VIEW,)),(H,'updateLayout','V',()),
 (H,'onScrollChanged','V',()),(H,'onGlobalLayout','V',()),(H,'syncArtwork','V',()),(H,'scanScroll','I',(VIEW,)),(H,'syncScroll','V',()),(H,'onDetachedFromWindow','V',()),
)
F=((FLP,'gravity','I'),(MARGIN,'topMargin','I'),(MARGIN,'rightMargin','I'),(MARGIN,'leftMargin','I'),(H,'button',BUTTON),(H,'web',WEB),
   (H,'expand',BUTTON),(H,'expanded','I'),(H,'shown','I'),(MARGIN,'bottomMargin','I'),
   (H,'lastWidth','I'),(H,'lastHeight','I'))

@dataclass
class Instr:
    op:str
    args:tuple
    size:int
    label:str|None=None
    @classmethod
    def make(cls,op,*args):
        sz={'invoke-direct':3,'invoke-virtual':3,'invoke-super':3,'invoke-interface':3,'move-result-object':1,'move-result':1,'move':1,'return':1,'neg-int':1,'int-to-float':1,
           'new-instance':2,'instance-of':2,'check-cast':2,'const-string':2,'const':3,'const/4':1,'const/16':2,'const/high16':2,
           'iput':2,'iput-object':2,'iget':2,'iget-object':2,'if-nez':2,'if-eqz':2,'if-eq':2,'if-ge':2,'if-le':2,'goto/16':2,
           'mul-int/lit8':2,'div-int/lit8':2,'add-int/lit8':2,'sub-int':2,'add-int':2,'return-void':1,'nop':1,
           'new-array':2,'aget':2}[op]
        return cls(op,args,sz)

class Code:
 def __init__(self,regs,ins):self.regs,self.ins=regs,ins;self.insns=[];self.labels={}
 def mark(self,name):self.labels[name]=sum(i.size for i in self.insns)
 def add(self,op,*args):self.insns.append(Instr.make(op,*args));return self
 def compile(self,mid,tid,fid,sid):
  def mr(x):return mid[x]
  def tr(x):return tid[x]
  def fr(x):return fid[x]
  def emit16(code):return p16(code&0xffff)
  pcs=[];p=0
  for i in self.insns:pcs.append(p);p+=i.size
  b=bytearray()
  for i,pc in zip(self.insns,pcs):
   op,args=i.op,i.args
   if op.startswith('invoke-'):
    opc={'invoke-direct':0x70,'invoke-virtual':0x6e,'invoke-super':0x6f,'invoke-interface':0x72}[op]
    regs,method=args
    if len(regs)>5 or any(r>15 for r in regs):raise ValueError(('invoke regs',regs))
    packed=list(regs)+[0]* (5-len(regs))
    # DEX format 35c: G in bits 8..11, A (argument word count) in bits 12..15
    first=opc|(packed[4]<<8)|(len(regs)<<12)
    third=packed[0]|packed[1]<<4|packed[2]<<8|packed[3]<<12
    b+=emit16(first)+emit16(mr(method))+emit16(third)
   elif op in ('move','neg-int','int-to-float'):
    a,breg=args
    b+=emit16({'move':0x01,'neg-int':0x7b,'int-to-float':0x82}[op] | (a<<8) | (breg<<12))
   elif op=='return':
    b+=emit16(0x0f | (args[0]<<8))
   elif op in ('move-result-object','move-result'):
    b+=emit16((0x0a if op=='move-result' else 0x0c)|(args[0]<<8))
   elif op=='instance-of':
    dest,source,typ=args
    b+=emit16(0x20|(dest<<8)|(source<<12))+emit16(tr(typ))
   elif op=='check-cast':
    reg,typ=args
    b+=emit16(0x1f|(reg<<8))+emit16(tr(typ))
   elif op=='new-instance':
    r,t=args;b+=emit16(0x22|(r<<8))+emit16(tr(t))
   elif op=='const-string':
    r,s=args;b+=emit16(0x1a|(r<<8))+emit16(sid[s])
   elif op=='new-array':
    dest,size,typ=args
    b+=emit16(0x23|(dest<<8)|(size<<12))+emit16(tr(typ))
   elif op=='aget':
    dest,arr,index=args
    b+=emit16(0x44|(dest<<8))+emit16(arr|(index<<8))
   elif op=='const':
    r,n=args;b+=emit16(0x14|(r<<8))+p32(n)
   elif op=='const/4':
    r,n=args
    if not (-8<=n<=7):raise ValueError(('const/4',args))
    b+=emit16(0x12|(r<<8)|((n&15)<<12))
   elif op=='const/16':
    r,n=args;b+=emit16(0x13|(r<<8))+emit16(n)
   elif op=='const/high16':
    r,imm=args;b+=emit16(0x15|(r<<8))+emit16(imm)
   elif op=='add-int/lit8':
    a,src,imm=args
    assert -128<=imm<=127
    b+=emit16(0xd8|(a<<8))+emit16(src|((imm&0xff)<<8))
   elif op in ('mul-int/lit8','div-int/lit8'):
    opc={'mul-int/lit8':0xda,'div-int/lit8':0xdb}[op]
    a,src,imm=args
    if not -128<=imm<=127:raise ValueError(('literal8',imm))
    b+=emit16(opc|(a<<8))+emit16(src|((imm&0xff)<<8))
   elif op in ('sub-int','add-int'):
    a,src1,src2=args
    b+=emit16((0x91 if op=='sub-int' else 0x90)|(a<<8))+emit16(src1|(src2<<8))
   elif op in ('iput','iput-object','iget-object','iget'):
    opc={'iput':0x59,'iput-object':0x5b,'iget-object':0x54,'iget':0x52}[op]
    a,ob,field=args
    b+=emit16(opc|(a<<8)|(ob<<12))+emit16(fr(field))
   elif op in ('if-nez','if-eqz'):
    r,label=args
    delta=self.labels[label]-pc
    if not (-32768<=delta<=32767):raise ValueError(('branch',delta))
    b+=emit16((0x39 if op=='if-nez' else 0x38)|(r<<8))+emit16(delta)
   elif op in ('if-ge','if-le'):
    r1,r2,label=args
    delta=self.labels[label]-pc
    assert -32768<=delta<=32767
    b+=emit16((0x35 if op=='if-ge' else 0x37)|(r1<<8)|(r2<<12))+emit16(delta)
   elif op=='goto/16':
    (label,)=args
    delta=self.labels[label]-pc
    assert -32768<=delta<=32767
    b+=emit16(0x29)+emit16(delta)
   elif op=='if-eq':
    r1,r2,label=args
    delta=self.labels[label]-pc
    if not (-32768<=delta<=32767):raise ValueError(('branch',delta))
    b+=emit16(0x32|(r1<<8)|(r2<<12))+emit16(delta)
   elif op=='return-void':b+=emit16(0x0e)
   elif op=='nop':b+=emit16(0)
   else:raise Exception(op)
  assert len(b)==p*2,(len(b),p)
  # registers_size, ins_size, outs_size, tries_size, debug_info_off, insns_size
  # max argument count =3
  return struct.pack('<HHHHII',self.regs,self.ins,3,0,0,p)+b

class Dex:
 def __init__(self):
  self.codes={}
  self.methods=list(M)
  self.fields=list(F)
 def method(self,k,code):self.codes[k]=code
 def build(self):
  # All type constants and references from fields and method signatures.
  types={H,FRAME,FLP,VG,VGLP,MARGIN,VIEW,LISTENER,OBSERVER,SCROLLLISTENER,GLOBALLAYOUTLISTENER,CALLBACK,WEB,CLIENT,SETTINGS,BUTTON,CTX,ATTR,STRING,CHARS,'I','F','Z','V'}
  for c,n,r,ps in self.methods:types.update((c,r,*ps))
  for c,n,t in self.fields:types.update((c,t))
  def shorty(t):return t[0] if len(t)==1 else 'L'
  prototypes={(r,tuple(ps)) for c,n,r,ps in self.methods}
  shorties={shorty(r)+''.join(shorty(p) for p in ps) for r,ps in prototypes}
  strings=(set(types)|shorties|{n for _,n,_,_ in self.methods}|{n for _,n,_ in self.fields}|
        {'PocketDJ','Spotify','Expand','Compact','https://jonathanjoelneptune.github.io/PocketDJ/#spotify-embed',
         'window.pocketDjSpotifySetCompact && window.pocketDjSpotifySetCompact(true)',
         'window.pocketDjSpotifySetCompact && window.pocketDjSpotifySetCompact(false)'})
  strings=sorted(strings)
  si={s:i for i,s in enumerate(strings)}
  tys=sorted(types,key=lambda x:si[x]);ti={s:i for i,s in enumerate(tys)}
  protos=sorted(prototypes,key=lambda p:(ti[p[0]], tuple(ti[x] for x in p[1])))
  pi={p:i for i,p in enumerate(protos)}
  fields=sorted(self.fields,key=lambda p:(ti[p[0]],si[p[1]],ti[p[2]]));fi={v:i for i,v in enumerate(fields)}
  methods=sorted(self.methods,key=lambda p:(ti[p[0]],si[p[1]],pi[(p[2],tuple(p[3]))]));mi={v:i for i,v in enumerate(methods)}
  out=bytearray(b'\0'*0x70)
  def push_id_region(data):
   aligned(out);off=len(out);out.extend(data);return off
  ss_off=push_id_region(b'\0'*(4*len(strings)))
  ty_off=push_id_region(b''.join(p32(si[x]) for x in tys))
  pr_off=push_id_region(b'\0'*(12*len(protos)))
  fd_off=push_id_region(b''.join(struct.pack('<HHI',ti[c],ti[t],si[n]) for c,n,t in fields))
  mt_off=push_id_region(b''.join(struct.pack('<HHI',ti[c],pi[(r,tuple(ps))],si[n]) for c,n,r,ps in methods))
  cl_off=push_id_region(b'\0'*32)
  data_off=len(out)
  # string data first
  sdo=[]
  for s in strings:
   sdo.append(len(out));u=s.encode('utf-8')
   out+=leb(len(s))+u+b'\0'
  for i,o in enumerate(sdo):struct.pack_into('<I',out,ss_off+4*i,o)
  # parameter type_lists and class interface type_list
  listoffs={}
  for combo in sorted({ps for _,ps in protos if ps}|{(LISTENER,SCROLLLISTENER,GLOBALLAYOUTLISTENER)}):
   aligned(out);listoffs[combo]=len(out)
   out+=p32(len(combo))+b''.join(p16(ti[t]) for t in combo)
   aligned(out)
  for i,(r,ps) in enumerate(protos):
   struct.pack_into('<III',out,pr_off+12*i,si[shorty(r)+''.join(shorty(p) for p in ps)],ti[r],listoffs.get(tuple(ps),0))
  # executable methods code before class_data
  codeoffs={}
  for k in sorted(self.codes,key=lambda k:mi[k]):
   aligned(out);codeoffs[k]=len(out)
   out+=self.codes[k].compile(mi,ti,fi,si)
  # Fields: order by ID, access flag private (not static)
  class_fields=sorted([f for f in fields if f[0]==H],key=lambda f:fi[f])
  class_methods=sorted([m for m in methods if m[0]==H],key=lambda m:mi[m])
  direct=[m for m in class_methods if m[1]=='<init>']
  virtual=[m for m in class_methods if m[1]!='<init>']
  class_off=len(out)
  out+=leb(0)+leb(len(class_fields))+leb(len(direct))+leb(len(virtual))
  last=0
  for f in class_fields:
   idx=fi[f];out+=leb(idx-last)+leb(0x2);last=idx
  for group in (direct,virtual):
   last=0
   for m in group:
    idx=mi[m];acc=0x4 if m[1] in ('onAttachedToWindow','onDetachedFromWindow') else 1
    out+=leb(idx-last)+leb(acc)+leb(codeoffs[m]);last=idx
  # class_defs item
  struct.pack_into('<IIIIIIII',out,cl_off,
   ti[H],0x21,ti[FRAME],listoffs[(LISTENER,SCROLLLISTENER,GLOBALLAYOUTLISTENER)],END,0,class_off,0)
  # map_list
  aligned(out);map_off=len(out)
  def map_entry(typ,num,off):return struct.pack('<HHII',typ,0,num,off)
  sections=[(0x0000,1,0),(0x0001,len(strings),ss_off),(0x0002,len(tys),ty_off),
   (0x0003,len(protos),pr_off),(0x0004,len(fields),fd_off),(0x0005,len(methods),mt_off),
   (0x0006,1,cl_off),(0x1000,1,map_off),(0x1001,len(listoffs),min(listoffs.values())),
   (0x2000,1,class_off),(0x2001,len(codeoffs),min(codeoffs.values())),
   (0x2002,len(strings),min(sdo))]
  # DEX map_items MUST be ordered by ascending file offset.
  sections.sort(key=lambda x:x[2])
  out+=p32(len(sections))+b''.join(map_entry(*x) for x in sections)
  file_sz=len(out)
  out[:8]=b'dex\n035\x00'
  struct.pack_into('<I',out,0x20,file_sz)
  struct.pack_into('<I',out,0x24,0x70)
  struct.pack_into('<I',out,0x28,0x12345678)
  struct.pack_into('<I',out,0x2c,0)
  struct.pack_into('<I',out,0x30,0)
  struct.pack_into('<I',out,0x34,map_off)
  struct.pack_into('<IIIIIIIIIIIIII',out,0x38,
   len(strings),ss_off,len(tys),ty_off,len(protos),pr_off,len(fields),fd_off,
   len(methods),mt_off,1,cl_off,file_sz-data_off,data_off)
  out[12:32]=hashlib.sha1(out[32:]).digest()
  struct.pack_into('<I',out,8,zlib.adler32(out[12:])&0xffffffff)
  (ROOT/'hook_v10.dex').write_bytes(out)
  print('Built hook.dex',len(out),'bytes',len(strings),'strings',len(methods),'methods',len(self.codes),'code items',flush=True)
  (ROOT/'dex_debug_v10.json').write_text(json.dumps({'strings':strings,'types':tys,'protos':protos,
    'methods':[(mi[x],x,codeoffs.get(x)) for x in methods],'fields':fields},indent=2))
  return bytes(out)

def make_dex():
 d=Dex()
 # Constructor, identical to v0.6: no heavy work at inflation time.
 c=Code(3,3)
 c.add('invoke-direct',(0,1,2),(FRAME,'<init>','V',(CTX,ATTR)))
 c.add('return-void')
 d.method((H,'<init>','V',(CTX,ATTR)),c)

 # Create only the top-right mode toggle during layout attachment.
 # No WebView creation until the user first activates PocketDJ.
 c=Code(14,1);p0=13
 c.add('invoke-super',(p0,),(FRAME,'onAttachedToWindow','V',()))
 c.add('invoke-virtual',(p0,),(FRAME,'getContext',CTX,())).add('move-result-object',0)
 c.add('new-instance',1,BUTTON)
 c.add('invoke-direct',(1,0),(BUTTON,'<init>','V',(CTX,)))
 c.add('const-string',2,'PocketDJ')
 c.add('invoke-virtual',(1,2),(BUTTON,'setText','V',(CHARS,)))
 c.add('new-instance',3,FLP)
 c.add('const/4',4,-2).add('const/4',5,-2)
 c.add('invoke-direct',(3,4,5),(FLP,'<init>','V',('I','I')))
 c.add('const/16',4,53).add('iput',4,3,(FLP,'gravity','I'))
 c.add('const/16',4,75).add('iput',4,3,(MARGIN,'topMargin','I'))
 c.add('const/16',4,16).add('iput',4,3,(MARGIN,'rightMargin','I'))
 c.add('invoke-virtual',(p0,1,3),(FRAME,'addView','V',(VIEW,VGLP)))
 c.add('const/high16',4,0x430c)  # 140.0f
 c.add('invoke-virtual',(1,4),(VIEW,'setElevation','V',('F',)))
 c.add('invoke-virtual',(1,p0),(VIEW,'setOnClickListener','V',(LISTENER,)))
 c.add('iput-object',1,p0,(H,'button',BUTTON))
 # Listen to scroll events originating anywhere within native Now Playing.
 c.add('invoke-virtual',(p0,),(VIEW,'getViewTreeObserver',OBSERVER,())).add('move-result-object',2)
 c.add('invoke-virtual',(2,p0),(OBSERVER,'addOnScrollChangedListener','V',(SCROLLLISTENER,)))
 c.add('invoke-virtual',(2,p0),(OBSERVER,'addOnGlobalLayoutListener','V',(GLOBALLAYOUTLISTENER,)))
 # Warm the browser after native layout completes, before the first swipe.
 # A separate Java helper posts the existing toggle twice in one UI tick;
 # no window-level overlay or reparenting is introduced.
 c.add('new-instance',3,PRELOADER)
 c.add('invoke-direct',(3,),(PRELOADER,'<init>','V',()))
 c.add('invoke-virtual',(3,p0),(PRELOADER,'schedule','V',(VIEW,)))
 c.add('return-void')
 d.method((H,'onAttachedToWindow','V',()),c)

 # Update dimensions of the SAME WebView. Never destroy/reload it when
 # switching between compact and expanded modes or hiding the room.
 c=Code(14,1);p0=13
 c.add('iget-object',0,p0,(H,'web',WEB))
 c.add('iget-object',1,p0,(H,'expand',BUTTON))
 c.add('iget',2,p0,(H,'expanded','I'))
 c.add('if-eqz',2,'compact')
 # Expanded: WebView fills the Now Playing root frame.
 c.add('new-instance',3,FLP)
 c.add('const/4',4,-1)
 c.add('invoke-direct',(3,4,4),(FLP,'<init>','V',('I','I')))
 c.add('const/16',5,51).add('iput',5,3,(FLP,'gravity','I'))
 c.add('invoke-virtual',(0,3),(VIEW,'setLayoutParams','V',(VGLP,)))
 # Collapse control in the bottom-right empty area, away from login controls.
 c.add('new-instance',6,FLP)
 c.add('const/4',7,-2)
 c.add('invoke-direct',(6,7,7),(FLP,'<init>','V',('I','I')))
 c.add('const/16',7,85).add('iput',7,6,(FLP,'gravity','I'))  # bottom|right
 c.add('const/16',7,20).add('iput',7,6,(MARGIN,'rightMargin','I'))
 c.add('const/16',7,28).add('iput',7,6,(MARGIN,'bottomMargin','I'))
 c.add('invoke-virtual',(1,6),(VIEW,'setLayoutParams','V',(VGLP,)))
 c.add('const-string',7,'Compact')
 c.add('invoke-virtual',(1,7),(BUTTON,'setText','V',(CHARS,)))
 c.add('invoke-virtual',(p0,),(H,'syncScroll','V',()))
 c.add('return-void')
 c.mark('compact')
 # Compact mode: view height equals the actual 16:9 scene, not a square
 # panel with invisible top/bottom touch interception. Keep this view inside
 # the original stable scrolling root rather than attaching a window overlay.
 c.add('invoke-virtual',(p0,),(VIEW,'getWidth','I',())).add('move-result',3)
 c.add('mul-int/lit8',4,3,9)
 c.add('div-int/lit8',4,4,16)  # natural 16:9 room height
 c.add('invoke-virtual',(p0,),(VIEW,'getHeight','I',())).add('move-result',6)
 # Remember PHYSICAL host dimensions (not capped scene width), otherwise every
 # onGlobalLayout callback would trigger a new updateLayout recursion.
 c.add('iput',3,p0,(H,'lastWidth','I'))
 c.add('iput',6,p0,(H,'lastHeight','I'))
 # Responsive scene viewport: phone portrait remains the stable 16:9
 # render. Unfolded portrait caps height at 39% of native host height so
 # Spotify's seekbar stays below the scene. Landscape remains full WIDTH,
 # caps the physical WebView at 45% of host height, and uses a dedicated
 # Spotify-embed CSS cover rule to CROP top/bottom without squishing sprites.
 # Full width + uncropped 16:9 + visible seekbar cannot all fit in the
 # native landscape space without reflowing Spotify's content hierarchy.
 c.add('if-le',3,6,'portrait_check')
 c.add('mul-int/lit8',12,6,45)
 c.add('div-int/lit8',12,12,100)
 c.add('if-le',4,12,'room_size_chosen')
 c.add('move',4,12)
 # Fit an honest 16:9 room inside Spotify's available landscape height;
 # no CSS stretching or lossy scene cropping.
 c.add('mul-int/lit8',3,4,16)
 c.add('div-int/lit8',3,3,9)
 c.add('goto/16','room_size_chosen')
 c.mark('portrait_check')
 # Only foldables/tablets with width above 75% of height get portrait cap.
 c.add('mul-int/lit8',12,6,3)
 c.add('div-int/lit8',12,12,4)
 c.add('if-le',3,12,'phone_tall')
 c.add('mul-int/lit8',12,6,35)
 c.add('div-int/lit8',12,12,100)
 c.add('if-le',4,12,'room_size_chosen')
 c.add('move',4,12)
 c.add('mul-int/lit8',3,4,16)
 c.add('div-int/lit8',3,3,9)
 c.add('goto/16','room_size_chosen')
 c.mark('phone_tall')
 # Phone portrait: square viewport matches native Spotify album art exactly.
 # Room drawing is still 16:9 at the bottom; extra height shows the existing
 # ceiling extension instead of stretching scene geometry.
 c.add('move',4,3)
 c.mark('room_size_chosen')
 # Conservative fallback if Spotify's live carousel is not yet attached.
 # The old square WebView centered the room ~0.26W below this top margin;
 # removing that invisible padding moves the scene closer to album artwork.
 c.add('mul-int/lit8',5,6,4)
 c.add('div-int/lit8',5,5,25)   # old baseline top (16% of native height)
 c.add('div-int/lit8',9,3,28)
 c.add('sub-int',5,5,9)
 # Prefer actual artwork geometry, including when the native carousel lives
 # outside our Hook (as it can in the foldable 'duo' Now Playing layout).
 c.add('invoke-virtual',(p0,),(VIEW,'getRootView',VIEW,())).add('move-result-object',7)
 c.add('const',9,0x7f0b1043)
 c.add('invoke-virtual',(7,9),(VIEW,'findViewById',VIEW,('I',))).add('move-result-object',7)
 c.add('if-eqz',7,'set_compact_layout')
 c.add('invoke-virtual',(7,),(VIEW,'getHeight','I',())).add('move-result',10)
 c.add('if-eqz',10,'set_compact_layout')
 # Reject non-artwork containers: the carousel should be approximately square,
 # not a full-height scroll host or a tiny control widget.
 c.add('mul-int/lit8',12,3,7)
 c.add('div-int/lit8',12,12,5) # at most 1.4 * root width
 c.add('if-ge',10,12,'set_compact_layout')
 c.add('div-int/lit8',12,3,3) # at least 0.33 * root width
 c.add('if-le',10,12,'set_compact_layout')
 # In portrait, center the room over the square artwork. In landscape,
 # anchor to artwork top instead, so the extra vertical space belongs to
 # Spotify's controls and not to the overlay.
 c.add('iget',12,p0,(H,'lastWidth','I'))
 c.add('if-ge',12,6,'artwork_top_only')
 c.add('sub-int',10,10,4)
 c.add('div-int/lit8',10,10,2)
 c.add('goto/16','artwork_y_offset_done')
 c.mark('artwork_top_only')
 c.add('const/4',10,0)
 c.mark('artwork_y_offset_done')
 c.add('const/4',9,2)
 c.add('new-array',11,9,'[I')
 c.add('invoke-virtual',(7,11),(VIEW,'getLocationInWindow','V',('[I',)))
 c.add('const/4',9,1)
 c.add('aget',5,11,9)           # artwork window Y
 c.add('invoke-virtual',(p0,11),(VIEW,'getLocationInWindow','V',('[I',)))
 c.add('aget',12,11,9)          # Hook window Y
 c.add('sub-int',5,5,12)       # convert to Hook-local Y
 c.add('add-int',5,5,10)
 c.add('invoke-virtual',(p0,p0),(H,'scanScroll','I',(VIEW,))).add('move-result',10)
 c.add('add-int',5,5,10)       # syncScroll() later applies -scrollY
 c.mark('set_compact_layout')
 # Foldable portrait: keep the scene BELOW Spotify's playlist header.
 # Earlier lifts moved the room into the header; instead set a minimum
 # top margin of ~16% of the native layout, with smaller 35%-height scene.
 c.add('iget',9,p0,(H,'lastWidth','I'))
 c.add('mul-int/lit8',10,6,3)
 c.add('div-int/lit8',10,10,4)
 c.add('if-le',9,10,'layout_clear_portrait_lift')
 c.add('if-ge',9,6,'layout_clear_portrait_lift')
 c.add('mul-int/lit8',10,6,16)
 c.add('div-int/lit8',10,10,100)
 c.add('if-ge',5,10,'layout_clear_portrait_lift')
 c.add('move',5,10)
 c.mark('layout_clear_portrait_lift')
 c.add('new-instance',8,FLP)
 c.add('invoke-direct',(8,3,4),(FLP,'<init>','V',('I','I')))
 c.add('const/16',9,51).add('iput',9,8,(FLP,'gravity','I'))
 c.add('iput',5,8,(MARGIN,'topMargin','I'))
 # Center tablet portrait scenes when their capped height reduces width.
 c.add('iget',12,p0,(H,'lastWidth','I'))
 c.add('sub-int',12,12,3)
 c.add('div-int/lit8',12,12,2)
 c.add('iput',12,8,(MARGIN,'leftMargin','I'))
 c.add('invoke-virtual',(0,8),(VIEW,'setLayoutParams','V',(VGLP,)))
 # The Expand button remains inside the scene's bottom edge; it no longer
 # prolongs the overlay into native controls or lyrics below the artwork.
 c.add('new-instance',8,FLP)
 c.add('const/4',9,-2)
 c.add('invoke-direct',(8,9,9),(FLP,'<init>','V',('I','I')))
 c.add('const/16',9,53).add('iput',9,8,(FLP,'gravity','I'))
 # Anchor Expand to the physical scene viewport's right edge.
 c.add('iget',11,p0,(H,'lastWidth','I'))
 c.add('sub-int',11,11,3)
 c.add('div-int/lit8',11,11,2)
 c.add('add-int/lit8',11,11,10)
 c.add('iput',11,8,(MARGIN,'rightMargin','I'))
 c.add('add-int',10,5,4)       # exact scene bottom
 c.add('const/16',11,58)
 c.add('sub-int',10,10,11)
 c.add('iput',10,8,(MARGIN,'topMargin','I'))
 c.add('invoke-virtual',(1,8),(VIEW,'setLayoutParams','V',(VGLP,)))
 c.add('const-string',9,'Expand')
 c.add('invoke-virtual',(1,9),(BUTTON,'setText','V',(CHARS,)))
 c.add('invoke-virtual',(p0,),(H,'syncScroll','V',()))
 c.add('return-void')
 d.method((H,'updateLayout','V',()),c)

 c=Code(14,2);p0=12;p1=13
 c.add('iget-object',0,p0,(H,'expand',BUTTON))
 c.add('if-eq',p1,0,'changeSize')
 c.add('iget-object',1,p0,(H,'web',WEB))
 c.add('if-eqz',1,'firstOpen')
 c.add('iget',2,p0,(H,'shown','I'))
 c.add('if-eqz',2,'showRoom')
 # Hide without removal or destroy, preserving OAuth, DOM and timing state.
 c.add('const/4',3,4)  # INVISIBLE: retain layout/render pipeline for preload
 c.add('invoke-virtual',(1,3),(VIEW,'setVisibility','V',('I',)))
 c.add('const/16',3,8)
 c.add('invoke-virtual',(0,3),(VIEW,'setVisibility','V',('I',)))
 c.add('const/4',3,0)
 c.add('iput',3,p0,(H,'shown','I'))
 c.add('invoke-virtual',(p0,),(H,'syncArtwork','V',()))
 c.add('iget-object',4,p0,(H,'button',BUTTON))
 c.add('const-string',5,'PocketDJ')
 c.add('invoke-virtual',(4,5),(BUTTON,'setText','V',(CHARS,)))
 c.add('return-void')
 c.mark('showRoom')
 c.add('const/4',3,0)
 c.add('invoke-virtual',(1,3),(VIEW,'setVisibility','V',('I',)))
 c.add('invoke-virtual',(0,3),(VIEW,'setVisibility','V',('I',)))
 c.add('invoke-virtual',(1,),(VIEW,'bringToFront','V',()))
 c.add('invoke-virtual',(0,),(VIEW,'bringToFront','V',()))
 c.add('iget-object',4,p0,(H,'button',BUTTON))
 c.add('invoke-virtual',(4,),(VIEW,'bringToFront','V',()))
 c.add('const/4',3,1)
 c.add('iput',3,p0,(H,'shown','I'))
 c.add('invoke-virtual',(p0,),(H,'syncArtwork','V',()))
 c.add('const-string',5,'Spotify')
 c.add('invoke-virtual',(4,5),(BUTTON,'setText','V',(CHARS,)))
 c.add('invoke-virtual',(p0,),(H,'syncScroll','V',()))
 c.add('return-void')
 c.mark('changeSize')
 c.add('iget',2,p0,(H,'expanded','I'))
 c.add('if-eqz',2,'expandRoom')
 c.add('const/4',3,0)
 c.add('iput',3,p0,(H,'expanded','I'))
 c.add('invoke-virtual',(p0,),(H,'updateLayout','V',()))
 c.add('iget-object',0,p0,(H,'web',WEB))
 c.add('const-string',1,'window.pocketDjSpotifySetCompact && window.pocketDjSpotifySetCompact(true)')
 c.add('const/4',2,0)
 c.add('invoke-virtual',(0,1,2),(WEB,'evaluateJavascript','V',(STRING,CALLBACK)))
 c.add('return-void')
 c.mark('expandRoom')
 c.add('const/4',3,1)
 c.add('iput',3,p0,(H,'expanded','I'))
 c.add('invoke-virtual',(p0,),(H,'updateLayout','V',()))
 c.add('iget-object',0,p0,(H,'web',WEB))
 c.add('const-string',1,'window.pocketDjSpotifySetCompact && window.pocketDjSpotifySetCompact(false)')
 c.add('const/4',2,0)
 c.add('invoke-virtual',(0,1,2),(WEB,'evaluateJavascript','V',(STRING,CALLBACK)))
 c.add('return-void')
 c.mark('firstOpen')
 c.add('invoke-virtual',(p0,),(FRAME,'getContext',CTX,())).add('move-result-object',0)
 c.add('new-instance',1,WEB)
 c.add('invoke-direct',(1,0),(WEB,'<init>','V',(CTX,)))
 # Preserve the stable v1.2 layout and scroll logic; expose Spotify's own
 # background through the unused letterbox portions of the embedded WebView.
 c.add('const/4',3,0)
 c.add('invoke-virtual',(1,3),(VIEW,'setBackgroundColor','V',('I',)))
 c.add('invoke-virtual',(1,),(WEB,'getSettings',SETTINGS,())).add('move-result-object',2)
 c.add('const/4',3,1)
 c.add('invoke-virtual',(2,3),(SETTINGS,'setJavaScriptEnabled','V',('Z',)))
 c.add('invoke-virtual',(2,3),(SETTINGS,'setDomStorageEnabled','V',('Z',)))
 c.add('invoke-virtual',(2,3),(SETTINGS,'setOffscreenPreRaster','V',('Z',)))
 # Client keeps a Keystore-encrypted, origin-verified recovery copy of
 # PocketDJ's Spotify refresh grant across the host app process lifecycle.
 c.add('new-instance',5,SESSIONCLIENT)
 c.add('invoke-direct',(5,0),(SESSIONCLIENT,'<init>','V',(CTX,)))
 c.add('invoke-virtual',(1,5),(WEB,'setWebViewClient','V',(CLIENT,)))
 # Set minimal layout initially; final dimensions are set by updateLayout.
 c.add('new-instance',5,FLP)
 c.add('const/4',6,1)
 c.add('invoke-direct',(5,6,6),(FLP,'<init>','V',('I','I')))
 c.add('invoke-virtual',(p0,1,5),(FRAME,'addView','V',(VIEW,VGLP)))
 c.add('const/high16',6,0x42dc)  # 110.0f
 c.add('invoke-virtual',(1,6),(VIEW,'setElevation','V',('F',)))
 c.add('iput-object',1,p0,(H,'web',WEB))
 c.add('new-instance',7,BUTTON)
 c.add('invoke-direct',(7,0),(BUTTON,'<init>','V',(CTX,)))
 c.add('const-string',8,'Expand')
 c.add('invoke-virtual',(7,8),(BUTTON,'setText','V',(CHARS,)))
 c.add('new-instance',5,FLP)
 c.add('const/4',6,-2)
 c.add('invoke-direct',(5,6,6),(FLP,'<init>','V',('I','I')))
 c.add('invoke-virtual',(p0,7,5),(FRAME,'addView','V',(VIEW,VGLP)))
 c.add('const/high16',6,0x4320)  # 160.0f
 c.add('invoke-virtual',(7,6),(VIEW,'setElevation','V',('F',)))
 c.add('invoke-virtual',(7,p0),(VIEW,'setOnClickListener','V',(LISTENER,)))
 c.add('iput-object',7,p0,(H,'expand',BUTTON))
 c.add('const/4',6,1)
 c.add('iput',6,p0,(H,'shown','I'))
 c.add('invoke-virtual',(p0,),(H,'syncArtwork','V',()))
 c.add('invoke-virtual',(p0,),(H,'updateLayout','V',()))
 c.add('const-string',8,'https://jonathanjoelneptune.github.io/PocketDJ/#spotify-embed')
 c.add('invoke-virtual',(1,8),(WEB,'loadUrl','V',(STRING,)))
 c.add('iget-object',9,p0,(H,'button',BUTTON))
 c.add('invoke-virtual',(9,),(VIEW,'bringToFront','V',()))
 c.add('const-string',8,'Spotify')
 c.add('invoke-virtual',(9,8),(BUTTON,'setText','V',(CHARS,)))
 c.add('return-void')
 d.method((H,'onClick','V',(VIEW,)),c)

 # CRITICAL: The parent tracks_carousel_view and cover_art_container can
 # include track metadata and the seekbar on foldables. Hiding those parent
 # widgets was responsible for the missing progress/title controls in v1.5.
 # Target only actual LEAF artwork views: skip anything that is a ViewGroup.
 # Keep the original view hierarchy and its dimensions untouched.
 c=Code(14,1);p0=13
 c.add('invoke-virtual',(p0,),(VIEW,'getRootView',VIEW,())).add('move-result-object',4)
 c.add('invoke-virtual',(4,),(VIEW,'getWidth','I',())).add('move-result',7)
 c.add('div-int/lit8',7,7,4)
 c.add('invoke-virtual',(4,),(VIEW,'getHeight','I',())).add('move-result',8)
 c.add('mul-int/lit8',8,8,3)
 c.add('div-int/lit8',8,8,5) # upper 60% of the window
 c.add('iget',2,p0,(H,'shown','I'))
 c.add('if-eqz',2,'show_original')
 c.add('const/4',3,4) # INVISIBLE preserves image geometry
 c.add('goto/16','lookup_art')
 c.mark('show_original')
 c.add('const/4',3,0) # VISIBLE
 c.mark('lookup_art')
 for j,res_id in enumerate((0x7f0b03ad, # cover_art_image
                             0x7f0b00e4, # album_artwork
                             0x7f0b012e, # artwork_view
                             0x7f0b0109, # art_work_view
                             0x7f0b011b)): # artwork
  next_label=f'next_art_{j}'
  c.add('const',0,res_id)
  c.add('invoke-virtual',(4,0),(VIEW,'findViewById',VIEW,('I',))).add('move-result-object',1)
  c.add('if-eqz',1,next_label)
  c.add('instance-of',5,1,VG) # never hide parent/carousel/controls
  c.add('if-nez',5,next_label)
  c.add('invoke-virtual',(1,),(VIEW,'getWidth','I',())).add('move-result',5)
  c.add('if-le',5,7,next_label)
  c.add('invoke-virtual',(1,),(VIEW,'getHeight','I',())).add('move-result',6)
  c.add('if-le',6,7,next_label)
  c.add('const/4',9,2)
  c.add('new-array',10,9,'[I')
  c.add('invoke-virtual',(1,10),(VIEW,'getLocationInWindow','V',('[I',)))
  c.add('const/4',9,1)
  c.add('aget',11,10,9)
  c.add('if-ge',11,8,next_label)
  c.add('invoke-virtual',(1,3),(VIEW,'setVisibility','V',('I',)))
  c.mark(next_label)
 c.add('return-void')
 d.method((H,'syncArtwork','V',()),c)

 # Lightweight recursive read of native scroll offsets. The WebView subtree
 # is excluded so scrolling PocketDJ's own webpage never moves the artwork.
 c=Code(14,2);p0=12;p1=13
 c.add('iget-object',0,p0,(H,'web',WEB))
 c.add('if-eq',p1,0,'no_scroll')
 c.add('invoke-virtual',(p1,),(VIEW,'getScrollY','I',())).add('move-result',1)
 c.add('instance-of',2,p1,VG)
 c.add('if-eqz',2,'done_scan')
 c.add('check-cast',p1,VG)
 c.add('invoke-virtual',(p1,),(VG,'getChildCount','I',())).add('move-result',3)
 c.add('const/4',4,0)
 c.mark('scan_loop')
 c.add('if-ge',4,3,'done_scan')
 c.add('invoke-virtual',(p1,4),(VG,'getChildAt',VIEW,('I',))).add('move-result-object',5)
 c.add('invoke-virtual',(p0,5),(H,'scanScroll','I',(VIEW,))).add('move-result',6)
 c.add('if-le',6,1,'next_child')
 c.add('move',1,6)
 c.mark('next_child')
 c.add('add-int/lit8',4,4,1)
 c.add('goto/16','scan_loop')
 c.mark('done_scan')
 c.add('return',1)
 c.mark('no_scroll')
 c.add('const/4',1,0)
 c.add('return',1)
 d.method((H,'scanScroll','I',(VIEW,)),c)

 # GPU translation mirrors the underlying native scroll, but expanded mode
 # stays fixed for login and settings. The WebView is never reloaded.
 c=Code(10,1);p0=9
 c.add('iget-object',0,p0,(H,'web',WEB))
 c.add('if-eqz',0,'done_sync')
 c.add('iget-object',1,p0,(H,'expand',BUTTON))
 c.add('if-eqz',1,'done_sync')
 c.add('iget',2,p0,(H,'expanded','I'))
 c.add('if-nez',2,'reset_offset')
 c.add('invoke-virtual',(p0,p0),(H,'scanScroll','I',(VIEW,))).add('move-result',3)
 c.add('neg-int',3,3)
 c.add('int-to-float',3,3)
 c.add('goto/16','apply_offset')
 c.mark('reset_offset')
 c.add('const/4',3,0)
 c.add('int-to-float',3,3)
 c.mark('apply_offset')
 c.add('invoke-virtual',(0,3),(VIEW,'setTranslationY','V',('F',)))
 c.add('invoke-virtual',(1,3),(VIEW,'setTranslationY','V',('F',)))
 c.mark('done_sync')
 c.add('return-void')
 d.method((H,'syncScroll','V',()),c)

 c=Code(2,1);p0=1
 c.add('invoke-virtual',(p0,),(H,'syncScroll','V',()))
 c.add('invoke-virtual',(p0,),(H,'syncArtwork','V',()))
 c.add('return-void')
 d.method((H,'onScrollChanged','V',()),c)

 c=Code(8,1);p0=7
 c.add('iget-object',0,p0,(H,'web',WEB))
 c.add('if-eqz',0,'artwork_only')
 c.add('iget',1,p0,(H,'expanded','I'))
 c.add('if-nez',1,'artwork_only')
 c.add('invoke-virtual',(p0,),(VIEW,'getWidth','I',())).add('move-result',2)
 c.add('iget',3,p0,(H,'lastWidth','I'))
 c.add('if-eq',2,3,'test_height')
 c.add('invoke-virtual',(p0,),(H,'updateLayout','V',()))
 c.add('goto/16','artwork_only')
 c.mark('test_height')
 c.add('invoke-virtual',(p0,),(VIEW,'getHeight','I',())).add('move-result',2)
 c.add('iget',3,p0,(H,'lastHeight','I'))
 c.add('if-eq',2,3,'artwork_only')
 c.add('invoke-virtual',(p0,),(H,'updateLayout','V',()))
 c.mark('artwork_only')
 c.add('invoke-virtual',(p0,),(H,'syncArtwork','V',()))
 c.add('return-void')
 d.method((H,'onGlobalLayout','V',()),c)

 # Remove observer from its native ViewTreeObserver on Activity teardown.
 c=Code(3,1);p0=2
 c.add('invoke-virtual',(p0,),(VIEW,'getViewTreeObserver',OBSERVER,())).add('move-result-object',0)
 c.add('invoke-virtual',(0,p0),(OBSERVER,'removeOnScrollChangedListener','V',(SCROLLLISTENER,)))
 c.add('invoke-virtual',(0,p0),(OBSERVER,'removeOnGlobalLayoutListener','V',(GLOBALLAYOUTLISTENER,)))
 c.add('invoke-super',(p0,),(FRAME,'onDetachedFromWindow','V',()))
 c.add('return-void')
 d.method((H,'onDetachedFromWindow','V',()),c)
 return d.build()

def get_chunk(b,typ):
 at=8
 while at<len(b):
  t,hs,sz=struct.unpack_from('<HHI',b,at)
  if t==typ:return at,b[at:at+sz]
  at+=sz
 raise ValueError('missing chunk')

def xml_pool(b):
 pos,pool=get_chunk(b,1)
 t,hs,sz=struct.unpack_from('<HHI',pool)
 cnt,style,flags,start,styleoff=struct.unpack_from('<IIIII',pool,8)
 assert flags&0x100 and style==0
 strings=[]
 def u8l(p):
  a=pool[p];p+=1
  if a&0x80:return ((a&127)<<8)|pool[p],p+1
  return a,p
 for i in range(cnt):
  idx=u32(pool,hs+i*4);q=start+idx
  _,q=u8l(q);size,q=u8l(q);strings.append(pool[q:q+size].decode('utf-8'))
 return pos,pool,strings,flags

def xml_modify(data, target_depth=0, target_id=None, replacement='com.pocketdj.Hook', expected='FrameLayout'):
 pos,pool,ss,flags=xml_pool(data)
 assert replacement not in ss
 new_str=replacement
 nss=ss+[new_str]
 def len8(n):return bytes([n]) if n<128 else bytes([0x80|(n>>8),n&255])
 buf=bytearray();offsets=[]
 for s in nss:
  offsets.append(len(buf));u=s.encode('utf-8')
  buf+=len8(len(s))+len8(len(u))+u+b'\0'
 aligned(buf)
 hs=28;start=hs+len(nss)*4
 np=bytearray(struct.pack('<HHI',1,28,start+len(buf)))
 np+=struct.pack('<IIIII',len(nss),0,flags,start,0)
 np+=b''.join(p32(i) for i in offsets)+buf
 oldlen=len(pool)
 # patch element start and end indices after the pool is replaced; name index in XML chunk at +20.
 remains=bytearray(data[pos+oldlen:])
 depth=0; stack=[];count=0;patched=[]
 k=0
 while k<len(remains):
  t,hs,sz=struct.unpack_from('<HHI',remains,k)
  if t==0x0102:
   namei=u32(remains,k+20);name=ss[namei]
   idfound=False
   attrs_count=u16(remains,k+28);attrs_start=u16(remains,k+24);attrs_size=u16(remains,k+26)
   for j in range(attrs_count):
    attr=k+16+attrs_start+attrs_size*j
    kind=remains[attr+15]; val=u32(remains,attr+16)
    if kind==1 and val==target_id:idfound=True
   use=(depth==target_depth) if target_id is None else idfound
   if use:
    assert name==expected,(name,depth)
    struct.pack_into('<I',remains,k+20,len(ss))
    count+=1;patched.append((name,depth,'start'))
   stack.append(use);depth+=1
  elif t==0x0103:
   depth-=1;use=stack.pop()
   if use:
    assert ss[u32(remains,k+20)]==expected
    struct.pack_into('<I',remains,k+20,len(ss))
    patched.append(('FrameLayout',depth,'end'))
  k+=sz
 assert count==1,(count,target_depth,target_id)
 # modify header overall chunk length; source pool at offset 8
 out=bytearray(data[:pos])+np+remains
 struct.pack_into('<I',out,4,len(out))
 print('XML hook',target_depth,target_id,'=>',len(data),'to',len(out),patched,flush=True)
 return bytes(out)

def generate_unsigned(dex, dest):
 print('Repack original with altered XML and appended DEX...',flush=True)
 changes={
 'res/layout/activity_now_playing.xml':lambda b:xml_modify(b,0,None,
     replacement='com.pocketdj.spotifyexperiment.SwipeHostFrameLayout'),
 'res/layout/activity_now_playing_duo.xml':lambda b:xml_modify(
     xml_modify(b,0,0x7f0b0c57),0,None,
     replacement='com.pocketdj.spotifyexperiment.SwipeHostConstraintLayout',
     expected='androidx.constraintlayout.widget.ConstraintLayout'),
 'classes18.dex':dex,
 }
 with zipfile.ZipFile(SRC,'r') as zin,zipfile.ZipFile(dest,'w',allowZip64=False) as zout:
  zout.comment=b''
  for i,info in enumerate(zin.infolist()):
   name=info.filename
   if name.startswith('META-INF/') and (name.endswith('.SF') or name.endswith('.RSA') or name.endswith('.DSA') or name.endswith('.EC') or name.endswith('MANIFEST.MF')):
    continue
   data=zin.read(name)
   if name in changes:
    data=changes[name](data);print('patched',name,flush=True)
   o=zipfile.ZipInfo(name,date_time=info.date_time)
   o.compress_type=info.compress_type
   o.flag_bits=0
   o.external_attr=info.external_attr
   o.internal_attr=info.internal_attr
   o.create_system=info.create_system
   o.comment=info.comment
   o.extra=info.extra
   if info.compress_type==zipfile.ZIP_STORED:
    # Page align stored native libraries, 4-byte align all stored dex files.
    target=16384 if name.startswith('lib/') and name.endswith('.so') else 4
    off=zout.fp.tell();header=30+len(name.encode('utf-8'))+len(o.extra)
    need=(-(off+header))%target
    if need:
     if need<4:need+=target
     o.extra+=struct.pack('<HH',0xd935,need-4)+b'\0'*(need-4)
   zout.writestr(o,data,compress_type=info.compress_type,compresslevel=6)
   if i and i%2000==0:print(' ZIP items',i,'/',len(zin.infolist()),flush=True)
  info=zipfile.ZipInfo('classes18.dex')
  info.compress_type=zipfile.ZIP_DEFLATED
  zout.writestr(info,dex,compress_type=zipfile.ZIP_DEFLATED)
  extra=zipfile.ZipInfo('classes19.dex')
  extra.compress_type=zipfile.ZIP_DEFLATED
  zout.writestr(extra,(ROOT/'classes19.dex').read_bytes(),compress_type=zipfile.ZIP_DEFLATED)
 print('unsigned zip',dest.stat().st_size,flush=True)

def lp(x):return p32(len(x))+x

def apk_digest(s0,s1,s2):
 chunks=[]
 for section in (s0,s1,s2):
  for j in range(0,len(section),1024*1024):
   data=section[j:j+1024*1024]
   chunks.append(hashlib.sha256(b'\xa5'+p32(len(data))+data).digest())
 return hashlib.sha256(b'\x5a'+p32(len(chunks))+b''.join(chunks)).digest()

def load_key():
 path=ROOT/'pocketdj-test-signing-key.pem'; certpath=ROOT/'pocketdj-test-signing-cert.pem'
 if path.exists():
  key=serialization.load_pem_private_key(path.read_bytes(),password=None)
  cert=x509.load_pem_x509_certificate(certpath.read_bytes())
  return key,cert
 key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
 now=datetime.now(timezone.utc)
 subject=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'PocketDJ Private PoC Test'),
                    x509.NameAttribute(NameOID.ORGANIZATION_NAME,'PocketDJ')])
 cert=(x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
  .public_key(key.public_key()).serial_number(x509.random_serial_number())
  .not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=3650))
  .sign(key,hashes.SHA256()))
 path.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.TraditionalOpenSSL,serialization.NoEncryption()))
 certpath.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
 os.chmod(path,0o600)
 return key,cert

def apk_v2_sign(unsigned,dest):
 b=unsigned.read_bytes()
 eocd=b.rfind(b'PK\x05\x06')
 if eocd<0:raise ValueError('ZIP EOCD missing')
 cd_off=u32(b,eocd+16)
 # Original is unsigned file so no Signing Block.
 assert b[cd_off:cd_off+4]==b'PK\x01\x02'
 s0=b[:cd_off];s1=b[cd_off:eocd];e=bytearray(b[eocd:])
 struct.pack_into('<I',e,16,cd_off)
 key,cert=load_key()
 digest=apk_digest(s0,s1,bytes(e))
 alg=0x0103
 digestseq=lp(p32(alg)+lp(digest))
 signed=lp(digestseq)+lp(lp(cert.public_bytes(serialization.Encoding.DER)))+lp(b'')
 sig=key.sign(signed,padding.PKCS1v15(),hashes.SHA256())
 signatures=lp(p32(alg)+lp(sig))
 pub=key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
 signer=lp(signed)+lp(signatures)+lp(pub)
 signers=lp(lp(signer))
 pair=p64(4+len(signers))+p32(0x7109871a)+signers
 sz=len(pair)+24
 block=p64(sz)+pair+p64(sz)+b'APK Sig Block 42'
 # Note: pair struct value MUST be a length prefixed "signers" sequence; `signers=lp(signer)` above.
 struct.pack_into('<I',e,16,cd_off+len(block))
 with open(dest,'wb') as f:
  f.write(s0);f.write(block);f.write(s1);f.write(e)
 print('Signed',dest,'bytes',dest.stat().st_size,'digest',digest.hex(),flush=True)
 return cert

def verify_v2(dest,cert):
 b=dest.read_bytes();eocd=b.rfind(b'PK\x05\x06');cd_off=u32(b,eocd+16)
 assert b[cd_off-16:cd_off]==b'APK Sig Block 42'
 size=struct.unpack_from('<Q',b,cd_off-24)[0];blockstart=cd_off-size-8
 assert struct.unpack_from('<Q',b,blockstart)[0]==size
 p=blockstart+8
 length=struct.unpack_from('<Q',b,p)[0];assert u32(b,p+8)==0x7109871a
 val=b[p+12:p+8+length]
 si=val[4:4+u32(val,0)]
 signer=si[4:4+u32(si,0)]
 sp=0;sd=signer[4:4+u32(signer,sp)];sp+=4+len(sd)
 sigs=signer[sp+4:sp+4+u32(signer,sp)];sp+=4+len(sigs)
 digest_group=sd[4:4+u32(sd,0)]
 dr=digest_group[4:4+u32(digest_group,0)]
 assert u32(dr,0)==0x0103
 signed_digest=dr[8:8+u32(dr,4)]
 sig_entry=sigs[4:4+u32(sigs,0)];assert u32(sig_entry,0)==0x0103
 sig=sig_entry[8:8+u32(sig_entry,4)]
 cert.public_key().verify(sig,sd,padding.PKCS1v15(),hashes.SHA256())
 e=bytearray(b[eocd:]);struct.pack_into('<I',e,16,blockstart)
 actual=apk_digest(b[:blockstart],b[cd_off:eocd],e)
 assert actual==signed_digest,('mismatched v2 digest',actual.hex(),signed_digest.hex())
 with zipfile.ZipFile(dest) as z:
  assert z.testzip() is None
  assert 'classes18.dex' in z.namelist() and 'classes19.dex' in z.namelist()
  assert z.read('classes18.dex')[:8]==b'dex\n035\x00'
  assert z.read('classes19.dex')[:8].startswith(b'dex\n')
  # Cross-check root tag name via our own XML string pool and first START_ELEMENT
  for n in ('res/layout/activity_now_playing.xml','res/layout/activity_now_playing_duo.xml'):
   raw=z.read(n); _,_,ss,_=xml_pool(raw)
   assert (('com.pocketdj.spotifyexperiment.SwipeHostFrameLayout' in ss) if n.endswith('activity_now_playing.xml') else ('com.pocketdj.spotifyexperiment.SwipeHostConstraintLayout' in ss))
  print('VERIFIED: APK v2 signature, chunked digest, ZIP CRC, two DEX modules, both swipe-host XML layouts',flush=True)
 return actual

if __name__=='__main__':
 ROOT.mkdir(exist_ok=True)
 dex=make_dex()
 out=ROOT/'unsigned_v10.apk'
 generate_unsigned(dex,out)
 cert=apk_v2_sign(out,DST)
 verify_v2(DST,cert)
 (ROOT/'build_report_v10.json').write_text(json.dumps({'apk':str(DST),'sha256':hashlib.sha256(DST.read_bytes()).hexdigest(),
    'bytes':DST.stat().st_size,'version':'9.1.98.621','status':'not device tested',
    'sha256_signing_cert':cert.fingerprint(hashes.SHA256()).hex()},indent=2))
 print('COMPLETE',flush=True)