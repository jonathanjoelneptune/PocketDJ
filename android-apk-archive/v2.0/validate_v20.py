#!/usr/bin/env python3
"""Verify v2.0 preserved Spotify APK files and retained the signing identity."""
from pathlib import Path
import hashlib, importlib.util, json, sys, zipfile
BASE = Path('/mnt/data/PocketDJ-Spotify-v1.9-BIDIRECTIONAL-SWIPE.apk')
NEW = Path('/mnt/data/PocketDJ-Spotify-v2.0-ARTWORK-BOUNDS.apk')
SCRIPT = Path(__file__).with_name('build_v20.py')
spec = importlib.util.spec_from_file_location('v20_builder', SCRIPT)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
_, cert = mod.load_key()
for item in (BASE,NEW):
    mod.verify_v2(item,cert)
with zipfile.ZipFile(BASE) as old, zipfile.ZipFile(NEW) as new:
    assert set(old.namelist()) == set(new.namelist())
    modified = [k for k in sorted(old.namelist()) if old.getinfo(k).CRC != new.getinfo(k).CRC]
    assert modified == ['classes18.dex','classes19.dex'], modified
    assert new.testzip() is None
    assert new.read('classes18.dex')[:8] == b'dex\n035\x00'
    assert new.read('classes19.dex')[:4] == b'dex\n'
result = {
    'version':'2.0',
    'filename':NEW.name,
    'bytes':NEW.stat().st_size,
    'sha256':hashlib.sha256(NEW.read_bytes()).hexdigest(),
    'signing_cert_sha256':cert.fingerprint(mod.hashes.SHA256()).hex(),
    'matches_v19_certificate':True,
    'changed_entries_vs_v19':modified,
    'all_other_Spotify_files_unchanged':True,
    'native_java_ci':'success',
    'native_install_status':'not device tested',
    'web_embed_css':'deployed via PR #16',
    'limitations':[
        'Landscape preserves full-width with intentional vertical cropping; full uncropped scene cannot fit with controls',
        'Native Spotify full-page background fade not modified; requires separately verified background view',
        'Artwork hitbox detection must be confirmed on phone/tablet'
    ],
}
Path(__file__).with_name('validation_v20.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))