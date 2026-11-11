from pathlib import Path
src=Path('/mnt/data/pdj_v17_build/build_v16.py').read_text()
def patch(old,new):
 global src
 n=src.count(old)
 if n!=1: raise AssertionError(f'Expected one occurrence, saw {n} for {old[:90]!r}')
 src=src.replace(old,new)

patch('PocketDJ Spotify v1.6: safe leaf-artwork hiding and centered landscape scene.', 'PocketDJ Spotify v1.7: fail-closed native swipe carousel in artwork-only slot.')
patch("ROOT=Path('/mnt/data/pdj_v14')", "ROOT=Path('/mnt/data/pdj_v17_build')")
patch("DST=Path('/mnt/data/PocketDJ-Spotify-v1.6-TABLET-LAYOUT-FIX.apk')", "DST=Path('/mnt/data/PocketDJ-Spotify-v1.7-SWIPE-CAROUSEL-EXPERIMENTAL.apk')")
patch("H='Lcom/pocketdj/Hook;'", "H='Lcom/pocketdj/Hook;'\nADAPTER='Lcom/pocketdj/spotifyexperiment/PocketDjArtworkInstaller;'")
patch(" (H,'onClick','V',(VIEW,)),(H,'updateLayout','V',()),", " (H,'onClick','V',(VIEW,)),(ADAPTER,'maybeInstall','Z',(VIEW,)),(H,'updateLayout','V',()),")
patch("'invoke-direct':3,'invoke-virtual':3,'invoke-super':3,'invoke-interface':3,", "'invoke-direct':3,'invoke-virtual':3,'invoke-super':3,'invoke-interface':3,'invoke-static':3,")
patch("'invoke-direct':0x70,'invoke-virtual':0x6e,'invoke-super':0x6f,'invoke-interface':0x72", "'invoke-direct':0x70,'invoke-virtual':0x6e,'invoke-super':0x6f,'invoke-interface':0x72,'invoke-static':0x71")
old=""" c.mark('artwork_only')
 c.add('invoke-virtual',(p0,),(H,'syncArtwork','V',()))
 c.add('return-void')
 d.method((H,'onGlobalLayout','V',()),c)"""
new=""" c.mark('artwork_only')
 # The v1.6 overlay and its top-right toggle remain available ONLY if the
 # live Spotify layout does not contain a verified artwork-only ImageView.
 # A successful install replaces exactly that image with a native horizontal
 # two-page pager, with original layout params and a persistent WebView.
 c.add('invoke-virtual',(p0,),(VIEW,'getRootView',VIEW,())).add('move-result-object',4)
 c.add('invoke-static',(4,),(ADAPTER,'maybeInstall','Z',(VIEW,))).add('move-result',5)
 c.add('if-eqz',5,'fallback_present')
 c.add('iget-object',6,p0,(H,'button',BUTTON))
 c.add('if-eqz',6,'fallback_present')
 c.add('const/16',0,8)  # GONE: the native artwork pager owns horizontal swipe.
 c.add('invoke-virtual',(6,0),(VIEW,'setVisibility','V',('I',)))
 c.mark('fallback_present')
 c.add('invoke-virtual',(p0,),(H,'syncArtwork','V',()))
 c.add('return-void')
 d.method((H,'onGlobalLayout','V',()),c)"""
patch(old,new)
patch("  zout.writestr(info,dex,compress_type=zipfile.ZIP_DEFLATED)\n print('unsigned zip'", "  zout.writestr(info,dex,compress_type=zipfile.ZIP_DEFLATED)\n  extra=zipfile.ZipInfo('classes19.dex')\n  extra.compress_type=zipfile.ZIP_DEFLATED\n  zout.writestr(extra,(ROOT/'classes19.dex').read_bytes(),compress_type=zipfile.ZIP_DEFLATED)\n print('unsigned zip'")
patch("  assert 'classes18.dex' in z.namelist()\n  assert z.read('classes18.dex')[:8]==b'dex\\n035\\x00'", "  assert 'classes18.dex' in z.namelist() and 'classes19.dex' in z.namelist()\n  assert z.read('classes18.dex')[:8]==b'dex\\n035\\x00'\n  assert z.read('classes19.dex')[:8].startswith(b'dex\\n')")
patch("'ZIP CRC, hook DEX, both XML layouts'", "'ZIP CRC, two DEX modules, both XML layouts'") if "'ZIP CRC, hook DEX, both XML layouts'" in src else None
Path('/mnt/data/pdj_v17_build/build_v17.py').write_text(src)
print('Wrote v1.7 generator; length',len(src))