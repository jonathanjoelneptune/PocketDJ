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
 # The v1.6 rollback does not include classes19.dex, so only run the
 # cryptographic verifier against it. v1.8 gets full layout/DEX checks.
 from cryptography.hazmat.primitives.asymmetric import padding
 def verify_base_signing(path):
  b=path.read_bytes(); eocd=b.rfind(b'PK\x05\x06')
  cd_off=build.u32(b,eocd+16)
  assert b[cd_off-16:cd_off]==b'APK Sig Block 42'
  size=struct.unpack_from('<Q',b,cd_off-24)[0]
  blockstart=cd_off-size-8
  assert struct.unpack_from('<Q',b,blockstart)[0]==size
  p=blockstart+8
  length=struct.unpack_from('<Q',b,p)[0]
  assert build.u32(b,p+8)==0x7109871a
  val=b[p+12:p+8+length]
  si=val[4:4+build.u32(val,0)]
  signer=si[4:4+build.u32(si,0)]
  pos=0
  signed=signer[4:4+build.u32(signer,pos)]
  pos+=4+len(signed)
  sigs=signer[pos+4:pos+4+build.u32(signer,pos)]
  dg=signed[4:4+build.u32(signed,0)]
  entry=dg[4:4+build.u32(dg,0)]
  assert build.u32(entry,0)==0x0103
  recorded=entry[8:8+build.u32(entry,4)]
  entry=sigs[4:4+build.u32(sigs,0)]
  assert build.u32(entry,0)==0x0103
  signature=entry[8:8+build.u32(entry,4)]
  cert.public_key().verify(signature,signed,padding.PKCS1v15(),hashes.SHA256())
  e=bytearray(b[eocd:]);struct.pack_into('<I',e,16,blockstart)
  assert build.apk_digest(b[:blockstart],b[cd_off:eocd],e)==recorded
  return recorded
 bsign=verify_base_signing(BASE)
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