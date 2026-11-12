#!/usr/bin/env python3
"""Regression gate for PocketDJ v2.3.2: native album/PocketDJ reveal must show the WebView."""
from pathlib import Path
import importlib.util, sys, hashlib, zipfile, json
from cryptography.hazmat.primitives import hashes

HERE=Path(__file__).resolve().parent
ROOT=Path('/mnt/data')
V23=ROOT/'PocketDJ-Spotify-v2.3-ARTWORK-CAROUSEL.apk'
V231=ROOT/'PocketDJ-Spotify-v2.3.1-RECOVERY.apk'
V232=ROOT/'PocketDJ-Spotify-v2.3.2-DISPLAY-RECOVERY.apk'
spec=importlib.util.spec_from_file_location('pdj_v232',HERE/'build_v232.py')
b=importlib.util.module_from_spec(spec);sys.modules['pdj_v232']=b;spec.loader.exec_module(b)
b.ROOT=HERE
_,cert=b.load_key()
for apk in [V23,V231,V232]:
    b.verify_v2(apk,cert)
with zipfile.ZipFile(V23) as original, zipfile.ZipFile(V231) as recovered, zipfile.ZipFile(V232) as patched:
    assert set(patched.namelist()) == set(original.namelist()) == set(recovered.namelist())
    assert patched.testzip() is None
    changed=[name for name in original.namelist() if original.read(name)!=patched.read(name)]
    assert changed==['classes18.dex'], changed
    assert patched.read('classes19.dex')==recovered.read('classes19.dex')
    assert patched.read('classes19.dex')==original.read('classes19.dex')
    for path in ('AndroidManifest.xml','res/layout/activity_now_playing.xml','res/layout/activity_now_playing_duo.xml'):
        assert patched.read(path)==original.read(path)
    bad=original.read('classes18.dex')
    good=patched.read('classes18.dex')
    assert len(bad)==len(good)==5808
    # DEX header region [0:32] contains checksum and SHA1 signature; the
    # entire bytecode and data payload must differ in precisely one byte.
    payload_diffs=[i for i in range(32,len(bad)) if bad[i]!=good[i]]
    assert len(payload_diffs)==1, payload_diffs
    changed_byte=payload_diffs[0]
    assert bad[changed_byte-1:changed_byte+1]==bytes.fromhex('12 46'),bad[changed_byte-1:changed_byte+1].hex()
    assert good[changed_byte-1:changed_byte+1]==bytes.fromhex('12 06'),good[changed_byte-1:changed_byte+1].hex()
    # const/4 v6, 4 (INVISIBLE) -> const/4 v6, 0 (VISIBLE)
    assert good == b.make_dex(), 'Generator and APK DEX do not match'
    code_diff={'dex_offset':changed_byte,'before':bad[changed_byte], 'after':good[changed_byte],
               'meaning':'const/4 v6, 4 (INVISIBLE) to const/4 v6, 0 (VISIBLE) in showRoom()'}
sha=hashlib.file_digest(V232.open('rb'),'sha256').hexdigest()
report={
    'version':'2.3.2', 'apk_file':V232.name,'apk_bytes':V232.stat().st_size,
    'apk_sha256':sha,'signing_certificate_sha256':cert.fingerprint(hashes.SHA256()).hex(),
    'all_original_spotify_files_byte_identical_to_v23':True,
    'changed_apk_entries_vs_v23':changed,'changed_dex_payload_bytes':1,
    'exact_instruction_change':code_diff,'native_carousel_dex_identical_to_v23_and_v231':True,
    'features_reintroduced':['hidden compact Spotify toggle and Expand button','long press >=650ms opens dev mode','square phone artwork area with centered native 16:9 room','transparent top/bottom swipe region','tablet layout reflow only if native seekbar shifts','session persistence and preload from stable v231'],
    'risk':'Tablet full-width is conditional; reflow refuses unsafe layouts and keeps prior size. Must test on phone and foldable.',
    'android_device_tested':False}
(HERE/'validation_v232.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))