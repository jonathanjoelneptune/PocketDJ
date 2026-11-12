"""PocketDJ Spotify v2.3.1 recovery candidate.
Known-good v2.2 Hook (scene and WebView lifecycle) plus v2.3 swipe/long-press DEX.
No native artwork reflow invoked until runtime instrumentation establishes its safety.
"""
import importlib.util, sys, hashlib, json, zipfile
from pathlib import Path
from cryptography.hazmat.primitives import hashes

def load(name,filepath):
    spec=importlib.util.spec_from_file_location(name,filepath)
    m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m

base=load('pdj_v22_build','/mnt/data/pdj_v22/build_v22.py')
pack=load('pdj_v23_build','/mnt/data/pdj_v23/build_v23.py')
new=Path('/mnt/data/PocketDJ-Spotify-v2.3.1-RECOVERY.apk')
pack.ROOT=Path('/mnt/data/pdj_v23')
pack.SRC=Path('/mnt/data/Spotify_+Music+and+Podcasts_9.1.98.621_APKPure.apk')
pack.DST=new
print('Generating exact v2.2 Hook...',flush=True)
dex=base.make_dex()
with zipfile.ZipFile('/mnt/data/PocketDJ-Spotify-v2.2.apk') as z:
    assert dex == z.read('classes18.dex'), 'Baseline Hook does not match v2.2 APK'
with zipfile.ZipFile('/mnt/data/PocketDJ-Spotify-v2.3.apk') as z:
    assert (pack.ROOT/'classes19.dex').read_bytes() == z.read('classes19.dex'), 'Gesture DEX does not match v2.3 APK'
print('DEX identity verified',flush=True)
unsigned=Path('/mnt/data/pdj_v23/unsigned_v231_recovery.apk')
pack.generate_unsigned(dex,unsigned)
cert=pack.apk_v2_sign(unsigned,new)
pack.verify_v2(new,cert)
with zipfile.ZipFile('/mnt/data/PocketDJ-Spotify-v2.2.apk') as o, zipfile.ZipFile(new) as n:
    assert n.testzip() is None
    assert set(n.namelist()) == set(o.namelist())
    changed=[p for p in sorted(o.namelist()) if o.read(p)!=n.read(p)]
    assert changed==['classes19.dex'], changed
    with zipfile.ZipFile('/mnt/data/PocketDJ-Spotify-v2.3.apk') as v23:
        assert n.read('classes19.dex') == v23.read('classes19.dex')
        assert n.read('classes18.dex') != v23.read('classes18.dex')
report={
'build':'2.3.1-RECOVERY','filename':new.name,'bytes':new.stat().st_size,
'sha256':hashlib.file_digest(new.open('rb'),'sha256').hexdigest(),
'signing_sha256':cert.fingerprint(hashes.SHA256()).hex(),
'changed_apk_entries_vs_working_v22':changed,
'v22_hook_byte_identical':True,
'v23_gesture_and_long_press_dex_byte_identical':True,
'android_runtime_tested':False,
'description':'Restores v2.2 WebView life cycle, button visibility and sizing; keeps v2.3 root swipe router/long-press; disables v2.3 tablet reflow; website CSS unchanged.',
'caution':'The old mode toggle and Expand buttons are visible again. This recovery is intentionally not the final buttonless/tablet full-width build.'}
Path('/mnt/data/PocketDJ-Spotify-v2.3.1-Recovery-Validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2),flush=True)