#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,sys,struct,zipfile
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes
ROOT=Path('/mnt/data/pdj_v18')
PKG=Path('/mnt/data/PocketDJ-Spotify-v1.8-SWIPE-ROOT.apk')
BASE=Path('/mnt/data/PocketDJ-Spotify-v1.6.apk')
sys.path.insert(0,str(ROOT))
import build_v18 as build

def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  while b:=f.read(2**20):h.update(b)
 return h.hexdigest()

def verify_zip():
 with zipfile.ZipFile(BASE) as a,zipfile.ZipFile(PKG) as b:
  A=set(a.namelist());B=set(b.namelist())
  assert B-A=={'classes19.dex'}, B-A
  assert A-B==set(),A-B
  changed=[x for x in A if a.read(x)!=b.read(x)]
  assert set(changed)=={'res/layout/activity_now_playing.xml','res/layout/activity_now_playing_duo.xml'},changed
  assert a.read('classes18.dex')==b.read('classes18.dex')
  assert b.testzip() is None
  names=['res/layout/activity_now_playing.xml','res/layout/activity_now_playing_duo.xml']
  expected=['com.pocketdj.spotifyexperiment.SwipeHostFrameLayout','com.pocketdj.spotifyexperiment.SwipeHostConstraintLayout']
  for name,tag in zip(names,expected):
   data=b.read(name)
   pos,pool,ss,flags=build.xml_pool(data)
   assert tag in ss
   p=pos+len(pool)
   while p<len(data):
    typ,hs,sz=struct.unpack_from('<HHI',data,p)
    if typ==0x0102:
     actual=ss[build.u32(data,p+20)]
     assert actual==tag,(name,actual,tag)
     break
    p+=sz
  # Check DEX header checksum and SHA1, five classes only owned by PocketDJ.
  dex=b.read('classes19.dex')
  assert dex[:4]==b'dex\n'
  assert hashlib.sha1(dex[32:]).digest()==dex[12:32]
  assert (struct.unpack_from('<I',dex,8)[0]==__import__('zlib').adler32(dex[12:])&0xffffffff)
  assert b'SwipeHostFrameLayout' in dex and b'SwipeHostConstraintLayout' in dex and b'SwipeRouter' in dex
  assert b'Lcom/pocketdj/Hook;' in dex and b'Landroidx/constraintlayout/widget/ConstraintLayout;' in dex
  return changed,len(dex)

def main():
 cert=x509.load_pem_x509_certificate((ROOT/'pocketdj-test-signing-cert.pem').read_bytes())
 from importlib.util import spec_from_file_location, module_from_spec
 spec=spec_from_file_location('v16verify', '/mnt/data/pdj_v17_build/build_v16.py')
 v16=module_from_spec(spec)
 sys.modules['v16verify']=v16
 spec.loader.exec_module(v16)
 bsign=v16.verify_v2(BASE,cert)
 nsign=build.verify_v2(PKG,cert)
 changed,dexsize=verify_zip()
 manifest={'version':'v1.8','status':'static-validated; phone and foldable runtime NOT tested',
 'filename':PKG.name,'sha256':sha(PKG),'bytes':PKG.stat().st_size,
 'sha256_signing_cert':cert.fingerprint(hashes.SHA256()).hex(),
 'matches_v16_signer':True,'v16_sha256':sha(BASE),
 'changed_uncompressed_entries_vs_v16':changed,
 'added_entries_vs_v16':['classes19.dex'],
 'custom_dex_bytes':dexsize,'v16_hook_dex_identical':True,
 'compile':'Android GitHub Actions CI passed: both host classes + swipe router',
 'remaining_risks':['No physical-device gesture testing','Artwork target detection depends on runtime hierarchy','Legacy v1.6 room sizing unchanged']}
 (ROOT/'validation_v18.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps(manifest,indent=2))
if __name__=='__main__': main()