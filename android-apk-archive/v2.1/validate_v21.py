#!/usr/bin/env python3
"""Static v2.1 APK provenance and safety checks; runtime behavior requires device."""
from pathlib import Path
import hashlib, importlib.util, json, sys, zipfile
HERE=Path(__file__).resolve().parent
OLD=Path('/mnt/data/PocketDJ-Spotify-v2.0-ARTWORK-BOUNDS.apk')
NEW=Path('/mnt/data/PocketDJ-Spotify-v2.1-CORE-STABILITY.apk')
modname='pocketdj_v21_builder'
spec=importlib.util.spec_from_file_location(modname,HERE/'build_v21.py')
builder=importlib.util.module_from_spec(spec);sys.modules[modname]=builder;spec.loader.exec_module(builder)
_,cert=builder.load_key()
builder.verify_v2(OLD,cert)
builder.verify_v2(NEW,cert)
with zipfile.ZipFile(OLD) as old,zipfile.ZipFile(NEW) as new:
    assert set(old.namelist())==set(new.namelist())
    changed=[n for n in sorted(new.namelist()) if old.getinfo(n).CRC!=new.getinfo(n).CRC]
    assert changed==['classes18.dex','classes19.dex'],changed
    assert new.testzip() is None
    dex=new.read('classes18.dex');router=new.read('classes19.dex')
    assert b'PocketDjSessionWebViewClient' in dex or b'PocketDjSessionWebViewClient' in router
    assert b'PocketDjPreloader' in router
    assert b'AndroidKeyStore' in router
    assert b'PocketDJ-session' in router
    assert dex.startswith(b'dex\n') and router.startswith(b'dex\n')
    sizes={'custom_hook_dex':len(dex),'native_module_dex':len(router)}
report={
    'version':'2.1',
    'filename':NEW.name,
    'bytes':NEW.stat().st_size,
    'sha256':hashlib.file_digest(NEW.open('rb'),'sha256').hexdigest(),
    'signing_cert_sha256':cert.fingerprint(builder.hashes.SHA256()).hex(),
    'same_signing_cert_as_v20':True,
    'changed_entries_vs_v20':changed,
    'all_original_spotify_assets_and_playback_files_unchanged':True,
    'dex_sizes':sizes,
    'native_java_ci':'success',
    'android_runtime':'not tested',
    'critical_device_tests':['swipe right/left across entire artwork to just above song title',
        'vertical scroll and timeline seeking','foldable portrait playlist header clearance',
        'foldable landscape unwarped 16:9','close and reopen: PKCE login persistence',
        'open Now Playing and immediately swipe: preload experience',
        'Spotify page background black when PocketDJ shown'],
    'limitations':['Spotify native background drawable may come from a child: root-only fade is best effort',
        'Preload starts when Now Playing attaches, not before the Spotify process starts',
        'Encrypted recovery store is seeded after one successful PocketDJ login; device test needed',
        'Landscape may letterbox because uncropped 16:9 must fit above Spotify controls']
}
(HERE/'validation_v21.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))