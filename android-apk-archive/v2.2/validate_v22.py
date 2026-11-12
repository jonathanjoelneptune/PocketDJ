#!/usr/bin/env python3
"""PocketDJ v2.2 APK signature/diff checks, preserving tested v2.1 gesture/identity."""
from pathlib import Path
import hashlib,importlib.util,zipfile,json,sys
HERE=Path(__file__).resolve().parent
OLD=Path('/mnt/data/PocketDJ-Spotify-v2.1-CORE-STABILITY.apk')
NEW=Path('/mnt/data/PocketDJ-Spotify-v2.2-PRELOAD-LAYOUT.apk')
spec=importlib.util.spec_from_file_location('v22',HERE/'build_v22.py')
b=importlib.util.module_from_spec(spec);sys.modules['v22']=b;spec.loader.exec_module(b)
_,cert=b.load_key()
b.verify_v2(OLD,cert)
b.verify_v2(NEW,cert)
with zipfile.ZipFile(OLD) as o, zipfile.ZipFile(NEW) as n:
    assert set(o.namelist())==set(n.namelist()),'Entry list changed'
    changed=[p for p in sorted(n.namelist()) if o.getinfo(p).CRC!=n.getinfo(p).CRC]
    assert changed==['classes18.dex'],changed
    assert n.read('classes19.dex')==o.read('classes19.dex')
    assert n.read('classes18.dex').startswith(b'dex\n035\x00')
    for name in ('res/layout/activity_now_playing.xml','res/layout/activity_now_playing_duo.xml'):
        assert o.read(name)==n.read(name),name
    assert n.testzip() is None
    oldsha=hashlib.sha256(o.read('classes19.dex')).hexdigest()
    size18=len(n.read('classes18.dex'))
report={
 'version':'2.2', 'filename':NEW.name,'bytes':NEW.stat().st_size,
 'sha256':hashlib.file_digest(NEW.open('rb'),'sha256').hexdigest(),
 'signing_cert_sha256':cert.fingerprint(b.hashes.SHA256()).hex(),
 'certificate_unchanged_vs_v21':True,
 'changed_entries_vs_v21':changed,
 'classes19_dex_sha256_unchanged':oldsha,
 'all_original_spotify_entries_unchanged':True,
 'hook_dex_bytes':size18,
 'web_changes':'New embed warmup and no-blocking-startup published separately through GitHub Pages',
 'android_runtime':'untested on device',
 'critical_tests':['phone: artwork/swipes still toggle and timeline/lyrics visible',
   'unfolded portrait: extra ceiling while playlist heading and title remain visible',
   'tablet landscape: room stays 16:9 and play/pause icon visible',
   'first reveal: speaker images and marquee background appear immediately',
   'Spotify close/reopen: PocketDJ session remains authenticated'],
 'limitations':['The website preload begins on Now Playing attachment; actual fetch time still depends on network/cache',
   'Playback UI remains Spotify owned, not repositioned independently',
   'Artwork transition and touch behavior cannot be proven by static validation']
}
(HERE/'validation_v22.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))