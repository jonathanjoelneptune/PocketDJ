#!/usr/bin/env python3
"""PocketDJ v2.4: safely widen Spotify's native foldable content pane.

Uses the user-validated v2.3.2 APK as a binary baseline. Patches only the
width-percent attributes on the right content pane and its empty left guide
in Spotify's foldable/duo XML. No changes to Spotify DEX, PocketDJ DEX,
WebView initialization, signer identity or scene CSS.
"""
import importlib.util
import hashlib
import json
import sys
import struct
import zipfile
from pathlib import Path
from cryptography.hazmat.primitives import hashes
BASE = Path('/mnt/data/PocketDJ-Spotify-v2.3.2.apk')
OUT = Path('/mnt/data/PocketDJ-Spotify-v2.4-FULL-PANE-EXPERIMENT.apk')
UNSIGNED = Path('/mnt/data/pdj_v24_unsigned.apk')
SRCMOD='/mnt/data/pdj_v232/build_v232.py'
spec=importlib.util.spec_from_file_location('pdj232',SRCMOD)
m=importlib.util.module_from_spec(spec);sys.modules["pdj232"]=m;spec.loader.exec_module(m)
m.ROOT=Path('/mnt/data/pdj_v232')
TARGET='res/layout/activity_now_playing_duo.xml'


def promote_duo(xml):
    b=bytearray(xml)
    pos,pool,strings,_=m.xml_pool(b)
    k=pos+len(pool)
    depth=0
    changes=[]
    while k<len(b):
        t,hs,sz=struct.unpack_from('<HHI',b,k)
        if t==0x0102:
            name=strings[m.u32(b,k+20)]
            count=m.u16(b,k+28)
            offset=m.u16(b,k+24)
            stride=m.u16(b,k+26)
            ids=set()
            attrs=[]
            for j in range(count):
                o=k+16+offset+j*stride
                key=strings[m.u32(b,o+4)]
                datatype=b[o+15]
                data=m.u32(b,o+16)
                attrs.append((key,datatype,data,o))
                if key=='id' and datatype==1:ids.add(data)
            if depth==1:
                # In Spotify's foldable two-pane XML the left guide consumes
                # 50%, while the right FrameLayout owns all Now Playing UI.
                # Reclaim that unused 50% for the right pane.
                if name=='View' and 0x7f0b1057 in ids:
                    new_float=0.0
                    descriptor='left guide'
                elif name=='FrameLayout' and any(a[0]=='background' for a in attrs):
                    new_float=1.0
                    descriptor='Now Playing content pane'
                else:
                    new_float=None
                    descriptor=''
                if new_float is not None:
                    candidates=[a for a in attrs if a[0]=='layout_constraintWidth_percent']
                    if len(candidates)!=1:raise ValueError((descriptor,'width percent count',len(candidates)))
                    key,typ,old,o=candidates[0]
                    if typ!=4 or old!=0x3f000000:raise ValueError((descriptor,'unexpected old percent',typ,hex(old)))
                    new=struct.unpack('<I',struct.pack('<f',new_float))[0]
                    struct.pack_into('<I',b,o+16,new)
                    changes.append({'view':descriptor,'old':0.5,'new':new_float,'offset':o+16})
            depth+=1
        elif t==0x0103:depth-=1
        k+=sz
    if len(changes)!=2:raise AssertionError(('expected exact two width percent changes',changes))
    assert len(b)==len(xml)
    return bytes(b),changes


patch_description=[]
with zipfile.ZipFile(BASE,'r') as src,zipfile.ZipFile(UNSIGNED,'w',allowZip64=False) as dst:
    dst.comment=b''
    for idx, info in enumerate(src.infolist()):
        name=info.filename
        if name.startswith('META-INF/') and name.endswith(('.SF','.RSA','.DSA','.EC','MANIFEST.MF')):
            continue
        data=src.read(name)
        if name==TARGET:
            data,patch_description=promote_duo(data)
        new=zipfile.ZipInfo(name,date_time=info.date_time)
        new.compress_type=info.compress_type
        new.flag_bits=0
        new.external_attr=info.external_attr
        new.internal_attr=info.internal_attr
        new.create_system=info.create_system
        new.comment=info.comment
        new.extra=info.extra
        if info.compress_type==zipfile.ZIP_STORED:
            target_align=16384 if name.startswith('lib/') and name.endswith('.so') else 4
            off=dst.fp.tell(); headlen=30+len(name.encode('utf-8'))+len(new.extra)
            need=(-(off+headlen))%target_align
            if need:
                if need<4:need+=target_align
                new.extra+=struct.pack('<HH',0xd935,need-4)+b'\0'*(need-4)
        dst.writestr(new,data,compress_type=info.compress_type,compresslevel=6)
        if idx and idx%2500==0:print('ZIP entries',idx,flush=True)
    print('Unsigned ready',UNSIGNED.stat().st_size,flush=True)
cert=m.apk_v2_sign(UNSIGNED,OUT)
verification=m.verify_v2(OUT,cert)
with zipfile.ZipFile(BASE) as z1,zipfile.ZipFile(OUT) as z2:
    assert z1.namelist()==z2.namelist()
    changed=[name for name in z1.namelist() if z1.read(name)!=z2.read(name)]
    assert changed==[TARGET],changed
    for dex in ['classes18.dex','classes19.dex']:
        assert z1.read(dex)==z2.read(dex)
    duo=z2.read(TARGET)
    twice,detail=promote_duo if False else (None,None)
    assert duo != z1.read(TARGET)
report={
 'build':'v2.4 full-width pane experiment',
 'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),
 'bytes':OUT.stat().st_size,
 'signer_fingerprint':cert.fingerprint(hashes.SHA256()).hex(),
 'changed_entries':changed,
 'patch':patch_description,
 'integrity':'ZIP CRC, APK v2 signature, two original custom DEX files unchanged',
 'phone_layout':'unchanged',
 'tablet_proof':'requires on-device testing: Spotify content may still constrain width or fail vertical reflow',
 'known_limitation':'Not guaranteed to make PocketDJ fill width or move song title and playback controls; native children may enforce max dimensions',
}
Path('/mnt/data/PocketDJ-Spotify-v2.4-Validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))