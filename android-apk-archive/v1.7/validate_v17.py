from pathlib import Path
import zipfile,struct,hashlib,json,sys
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from build_v17 import verify_v2,u32,u16
ROOT=Path('/mnt/data/pdj_v17_build')
old=Path('/mnt/data/PocketDJ-Spotify-v1.6.apk')
new=Path('/mnt/data/PocketDJ-Spotify-v1.7-SWIPE-CAROUSEL-EXPERIMENTAL.apk')
with zipfile.ZipFile(old) as prev, zipfile.ZipFile(new) as now:
 p=set(prev.namelist());n=set(now.namelist())
 assert n-p=={'classes19.dex'},n-p
 assert not p-n,p-n
 diff=[k for k in sorted(p) if (prev.getinfo(k).CRC,prev.getinfo(k).file_size)!=(now.getinfo(k).CRC,now.getinfo(k).file_size)]
 assert diff==['classes18.dex'],diff
 assert now.testzip() is None
 for info in now.infolist():
  if info.compress_type!=zipfile.ZIP_STORED:continue
  with new.open('rb') as f:pass
  at=info.header_offset
  now.fp.seek(at);header=now.fp.read(30)
  target=16384 if info.filename.startswith('lib/') and info.filename.endswith('.so') else 4
  assert (at+30+u16(header,26)+u16(header,28))%target==0,info.filename
 dex=now.read('classes18.dex')
 extra=now.read('classes19.dex')
 assert dex[:8]==b'dex\n035\0'
 assert extra[:4]==b'dex\n'
 assert b'PocketDjArtworkInstaller' in extra and b'PocketDjArtworkCarousel' in extra
 assert b'maybeInstall' in extra and b'PocketDJ-artwork' in extra
 print('APK entries:',len(p),'to',len(n),'changed',diff,'added',n-p)
# Validate Hook code sizes and static invocations.
info=json.loads((ROOT/'dex_debug_v10.json').read_text())
valid_sizes={0x0e:1,0x0f:1,0x01:1,0x0a:1,0x0c:1,0x12:1,0x13:2,0x14:3,0x15:2,0x1a:2,
 0x1f:2,0x20:2,0x22:2,0x23:2,0x29:2,0x32:2,0x35:2,0x37:2,0x38:2,0x39:2,
 0x44:2,0x52:2,0x54:2,0x59:2,0x5b:2,0x6e:3,0x6f:3,0x70:3,0x71:3,0x72:3,
 0x7b:1,0x82:1,0x90:2,0x91:2,0xd8:2,0xda:2,0xdb:2}
branch_ops={0x32,0x35,0x37,0x38,0x39,0x29}
check=[]
for _,key,off in info['methods']:
 if not off:continue
 method=tuple(key);regs,ins,outs,tries,debug,units=struct.unpack_from('<HHHHII',dex,off)
 assert tries==0 and debug==0
 code=off+16;pc=0;valid_pc=set();targets=[];opcodes=[]
 while pc<units:
  word=u16(dex,code+pc*2);op=word&0xff
  assert op in valid_sizes,(method,pc,hex(op)); valid_pc.add(pc);opcodes.append(op)
  if op in branch_ops:
   delta=u16(dex,code+(pc+1)*2)
   if delta>=32768:delta-=65536
   targets.append(pc+delta)
  pc+=valid_sizes[op]
 assert pc==units
 assert all(t in valid_pc for t in targets),(method,targets)
 if method[1]=='onGlobalLayout': assert 0x71 in opcodes,'native installer bridge missing'
 check.append({'method':method[1], 'code_units':units, 'branches':len(targets)})
print('Validated bytecode',len(check),'methods')
cert=x509.load_pem_x509_certificate((ROOT/'pocketdj-test-signing-cert.pem').read_bytes())
verify_v2(new,cert)
report={'version':'v1.7 experimental','apk':new.name,
 'sha256':hashlib.file_digest(new.open('rb'),'sha256').hexdigest(),
 'size_bytes':new.stat().st_size,'signing_cert_sha256':cert.fingerprint(hashes.SHA256()).hex(),
 'changed_entries_vs_v16':diff,'added_entries_vs_v16':sorted(n-p),
 'dex_classes':['com.pocketdj.Hook','com.pocketdj.spotifyexperiment.PocketDjArtworkCarousel','com.pocketdj.spotifyexperiment.PocketDjArtworkInstaller'],
 'ci_native_compilation':'passed on GitHub Actions',
 'zip_integrity':'passed','v2_signature':'passed','stored_entry_alignment':'passed',
 'dex_instruction_boundaries':'passed','android_install':'untested',
 'native_artwork_detection':'untested','safety_fallback':'v1.6 manual toggle retained if detection fails'}
(ROOT/'validation_v17.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))