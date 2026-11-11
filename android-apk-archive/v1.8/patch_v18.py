from pathlib import Path
src=Path('/mnt/data/pdj_v17_build/build_v16.py').read_text()
def patch(old,new):
 global src
 n=src.count(old)
 if n!=1:raise RuntimeError('Expected single match, found %s: %r'%(n,old[:100]))
 src=src.replace(old,new)
patch('PocketDJ Spotify v1.6: safe leaf-artwork hiding and centered landscape scene.',
      'PocketDJ Spotify v1.8: root touch routing for native artwork swipes on phone and dual-pane tablet.')
patch("ROOT=Path('/mnt/data/pdj_v14')", "ROOT=Path('/mnt/data/pdj_v18')")
patch("DST=Path('/mnt/data/PocketDJ-Spotify-v1.6-TABLET-LAYOUT-FIX.apk')", "DST=Path('/mnt/data/PocketDJ-Spotify-v1.8-SWIPE-ROOT.apk')")
patch('def xml_modify(data, target_depth=0, target_id=None):',
      "def xml_modify(data, target_depth=0, target_id=None, replacement='com.pocketdj.Hook', expected='FrameLayout'):")
patch(" assert 'com.pocketdj.Hook' not in ss\n new_str='com.pocketdj.Hook'",
      " assert replacement not in ss\n new_str=replacement")
patch("    assert name=='FrameLayout',(name,depth)","    assert name==expected,(name,depth)")
patch("    assert ss[u32(remains,k+20)]=='FrameLayout'","    assert ss[u32(remains,k+20)]==expected")
patch(" 'res/layout/activity_now_playing.xml':lambda b:xml_modify(b,0,None),\n 'res/layout/activity_now_playing_duo.xml':lambda b:xml_modify(b,0,0x7f0b0c57),",
" 'res/layout/activity_now_playing.xml':lambda b:xml_modify(b,0,None,\n     replacement='com.pocketdj.spotifyexperiment.SwipeHostFrameLayout'),\n 'res/layout/activity_now_playing_duo.xml':lambda b:xml_modify(\n     xml_modify(b,0,0x7f0b0c57),0,None,\n     replacement='com.pocketdj.spotifyexperiment.SwipeHostConstraintLayout',\n     expected='androidx.constraintlayout.widget.ConstraintLayout'),")
patch("  zout.writestr(info,dex,compress_type=zipfile.ZIP_DEFLATED)\n print('unsigned zip'",
      "  zout.writestr(info,dex,compress_type=zipfile.ZIP_DEFLATED)\n  extra=zipfile.ZipInfo('classes19.dex')\n  extra.compress_type=zipfile.ZIP_DEFLATED\n  zout.writestr(extra,(ROOT/'classes19.dex').read_bytes(),compress_type=zipfile.ZIP_DEFLATED)\n print('unsigned zip'")
patch("  assert 'classes18.dex' in z.namelist()\n  assert z.read('classes18.dex')[:8]==b'dex\\n035\\x00'",
      "  assert 'classes18.dex' in z.namelist() and 'classes19.dex' in z.namelist()\n  assert z.read('classes18.dex')[:8]==b'dex\\n035\\x00'\n  assert z.read('classes19.dex')[:8].startswith(b'dex\\n')")
patch("   assert 'com.pocketdj.Hook' in ss",
      "   assert (('com.pocketdj.spotifyexperiment.SwipeHostFrameLayout' in ss) if n.endswith('activity_now_playing.xml') else ('com.pocketdj.spotifyexperiment.SwipeHostConstraintLayout' in ss))")
patch(" print('VERIFIED: APK v2 signature, chunked digest, ZIP CRC, hook DEX, both XML layouts'",
      " print('VERIFIED: APK v2 signature, chunked digest, ZIP CRC, two DEX modules, both swipe-host XML layouts'")
Path('/mnt/data/pdj_v18/build_v18.py').write_text(src)
print('Wrote',len(src),'bytes')