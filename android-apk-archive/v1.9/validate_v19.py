#!/usr/bin/env python3
"""Static signature, ZIP, DEX, and deployment contract verification for v1.9."""
from __future__ import annotations
import hashlib,json,sys,struct,zipfile,zlib
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes
ROOT=Path('/mnt/data/pdj_v19')
APK=Path('/mnt/data/PocketDJ-Spotify-v1.9-BIDIRECTIONAL-SWIPE.apk')
BASE=Path('/mnt/data/PocketDJ-Spotify-v1.8.apk')
sys.path.insert(0,str(ROOT))
import build_v19 as build

def sha_file(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
 return h.hexdigest()

def validate():
 cert=x509.load_pem_x509_certificate((ROOT/'pocketdj-test-signing-cert.pem').read_bytes())
 build.verify_v2(BASE,cert)
 build.verify_v2(APK,cert)
 with zipfile.ZipFile(BASE) as old,zipfile.ZipFile(APK) as new:
  oldset=set(old.namelist());newset=set(new.namelist())
  assert oldset==newset,(oldset-newset,newset-oldset)
  changed=sorted(n for n in oldset if old.read(n)!=new.read(n))
  assert changed==['classes18.dex','classes19.dex'],changed
  a=new.read('classes18.dex'); b=new.read('classes19.dex')
  for dex in (a,b):
   assert dex[:4]==b'dex\n'
   assert hashlib.sha1(dex[32:]).digest()==dex[12:32]
   assert struct.unpack_from('<I',dex,8)[0]==zlib.adler32(dex[12:])&0xffffffff
  for needle in [b'SwipePageEffects',b'SwipeHostFrameLayout',b'SwipeHostConstraintLayout',b'SwipeRouter']:
   assert needle in b,needle
  for p in ('res/layout/activity_now_playing.xml','res/layout/activity_now_playing_duo.xml'):
   assert old.read(p)==new.read(p)
  assert new.testzip() is None
  apk_entries=len(new.namelist())
 report={
  'version':'v1.9','status':'build/static checks passed; Android device gesture and size behavior untested',
  'filename':APK.name,'size_bytes':APK.stat().st_size,'sha256':sha_file(APK),
  'sha256_signing_cert':cert.fingerprint(hashes.SHA256()).hex(),
  'signature_matches_v18':True,'v18_sha256':sha_file(BASE),
  'changed_zip_entries_vs_v18':changed,'unchanged_original_spotify_entries':True,
  'dex18_bytes':len(a),'dex19_bytes':len(b),'apk_zip_entry_count':apk_entries,
  'android_java_ci':'Native SwipeRouter/SwipePageEffects/SwipeHost* compilation and DEX generation PASSED',
  'web_css':'Compact embedded landscape only, 2:1+ viewport crops vertical overscan',
  'tests_still_required':['phone portrait gestures both directions','album art hidden under scene','Canvas/video track with Canvas disabled','foldable portrait progress/timeline','foldable landscape full width and native controls','vertical scroll','authentication and expanded mode','force stop/relaunch'],
 }
 (ROOT/'validation_v19.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))

if __name__=='__main__':validate()