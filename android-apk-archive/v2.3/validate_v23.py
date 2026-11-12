#!/usr/bin/env python3
"""PocketDJ v2.3 full original/companion integrity and signing comparison."""
from pathlib import Path
import hashlib,importlib.util,zipfile,json,sys
HERE=Path(__file__).resolve().parent
OLD=Path('/mnt/data/PocketDJ-Spotify-v2.2.apk')
NEW=Path('/mnt/data/PocketDJ-Spotify-v2.3-ARTWORK-CAROUSEL.apk')
spec=importlib.util.spec_from_file_location('v23',HERE/'build_v23.py')
b=importlib.util.module_from_spec(spec);sys.modules['v23']=b;spec.loader.exec_module(b)
_,cert=b.load_key()
b.verify_v2(OLD,cert)
b.verify_v2(NEW,cert)
with zipfile.ZipFile(OLD) as o, zipfile.ZipFile(NEW) as n:
    assert set(o.namelist())==set(n.namelist()),'Added/removed APK ZIP entries'
    assert n.testzip() is None
    changed=[x for x in sorted(n.namelist()) if o.getinfo(x).CRC!=n.getinfo(x).CRC]
    assert changed==['classes18.dex','classes19.dex'],changed
    for path in ('res/layout/activity_now_playing.xml','res/layout/activity_now_playing_duo.xml','AndroidManifest.xml'):
        assert o.read(path)==n.read(path),'Unexpected Spotify file edit '+path
    for path in ('classes18.dex','classes19.dex'):
        assert n.read(path).startswith(b'dex\n'),path
    dex19=n.read('classes19.dex')
    # Assert presence of new native functionality, even though Android runtime
    # behavior requires a physical device.
    assert b'ArtworkReflow' in dex19
    assert b'OPEN_DEVELOPER' not in dex19 or b'SwipeRouter' in dex19
    assert b'PocketDjSessionWebViewClient' in dex19
    assert len(n.read('classes18.dex'))>5600
    crc_o={x:o.getinfo(x).CRC for x in o.namelist()}
    crc_n={x:n.getinfo(x).CRC for x in n.namelist()}
    assert all(crc_o[x]==crc_n[x] for x in crc_o if x not in changed)
report={
    'version':'2.3',
    'filename':NEW.name,
    'bytes':NEW.stat().st_size,
    'sha256':hashlib.file_digest(NEW.open('rb'),'sha256').hexdigest(),
    'signing_cert_sha256':cert.fingerprint(b.hashes.SHA256()).hex(),
    'same_signing_cert_as_v22':True,
    'changed_entries_vs_v22':changed,
    'all_spotify_owned_entries_unchanged':True,
    'native_features':['phone square artwork gesture area with centered 16:9 web scene',
        'top-right Spotify toggle hidden',
        'compact Expand button hidden; 650ms PocketDJ long-press activates existing full-screen WebView',
        'same-WebView Compact button visible in expanded developer mode',
        'guarded native tablet artwork slot resize only if seekbar moves with it',
        'preserved v2.2 preloader/session backup and native album-swipe interception'],
    'web_companion':'embedded-only CSS in PR, native APK uses same GitHub Pages URL',
    'android_runtime':'untested; conditional tablet reflow must be verified on device',
    'risk_note':'Native tablet reflow is experimentally gated; if seekbar movement cannot be verified the APK restores original artwork bounds',
    'critical_tests':['phone album/PocketDJ swipe both directions, including transparent top/bottom',
        'phone long-press opens full-screen login and Compact closes',
        'tablet unfolded portrait and landscape full width only when album-slot reflow validated',
        'song title, seekbar, transport remain visible and clickable; scroll works',
        'Spotify close and reopen preserves PocketDJ sign-in']
}
(HERE/'validation_v23.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))