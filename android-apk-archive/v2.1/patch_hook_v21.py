from pathlib import Path
p=Path('/mnt/data/pdj_v21/build_v21.py')
s=p.read_text()
def repl(a,b):
 global s
 n=s.count(a)
 if n!=1: raise RuntimeError(f'Expected 1 occurrence not {n}: {a[:80]}')
 s=s.replace(a,b)
repl('PocketDJ Spotify v2.0: artwork-native hitbox, tall room viewport, foldable alignment.', 'PocketDJ Spotify v2.1: preloaded persistent session, geometry and gesture stability.')
repl("ROOT=Path('/mnt/data/pdj_v20')", "ROOT=Path('/mnt/data/pdj_v21')")
repl("DST=Path('/mnt/data/PocketDJ-Spotify-v2.0-ARTWORK-BOUNDS.apk')", "DST=Path('/mnt/data/PocketDJ-Spotify-v2.1-CORE-STABILITY.apk')")
repl("CLIENT='Landroid/webkit/WebViewClient;'", "CLIENT='Landroid/webkit/WebViewClient;'\nSESSIONCLIENT='Lcom/pocketdj/spotifyexperiment/PocketDjSessionWebViewClient;'")
repl(" (CLIENT,'<init>','V',()),(WEB,'setWebViewClient','V',(CLIENT,)),", " (SESSIONCLIENT,'<init>','V',(CTX,)),(WEB,'setWebViewClient','V',(CLIENT,)),")
repl(" (SETTINGS,'setJavaScriptEnabled','V',('Z',)),(SETTINGS,'setDomStorageEnabled','V',('Z',)),", " (SETTINGS,'setJavaScriptEnabled','V',('Z',)),(SETTINGS,'setDomStorageEnabled','V',('Z',)),(SETTINGS,'setOffscreenPreRaster','V',('Z',)),")
repl(''' # Listen to scroll events originating anywhere within native Now Playing.
 c.add('invoke-virtual',(p0,),(VIEW,'getViewTreeObserver',OBSERVER,())).add('move-result-object',2)
 c.add('invoke-virtual',(2,p0),(OBSERVER,'addOnScrollChangedListener','V',(SCROLLLISTENER,)))
 c.add('invoke-virtual',(2,p0),(OBSERVER,'addOnGlobalLayoutListener','V',(GLOBALLAYOUTLISTENER,)))
 c.add('return-void')''',''' # Listen to scroll events originating anywhere within native Now Playing.
 c.add('invoke-virtual',(p0,),(VIEW,'getViewTreeObserver',OBSERVER,())).add('move-result-object',2)
 c.add('invoke-virtual',(2,p0),(OBSERVER,'addOnScrollChangedListener','V',(SCROLLLISTENER,)))
 c.add('invoke-virtual',(2,p0),(OBSERVER,'addOnGlobalLayoutListener','V',(GLOBALLAYOUTLISTENER,)))
 # Start loading immediately when the Spotify Now Playing view attaches.
 # Both changes occur synchronously before a frame can draw: first click
 # builds/loads our WebView, second returns Spotify artwork while the room
 # continues to initialize invisibly. This prevents first-swipe lazy load.
 c.add('invoke-virtual',(p0,1),(H,'onClick','V',(VIEW,)))
 c.add('invoke-virtual',(p0,1),(H,'onClick','V',(VIEW,)))
 c.add('return-void')''')
# Constrained landscape: 16:9 content, not full width plus cropping.
repl(''' c.add('if-le',4,12,'room_size_chosen')
 c.add('move',4,12)
 c.add('goto/16','room_size_chosen')''',''' c.add('if-le',4,12,'room_size_chosen')
 c.add('move',4,12)
 # Fit an honest 16:9 room inside Spotify's available landscape height;
 # no CSS stretching or lossy scene cropping.
 c.add('mul-int/lit8',3,4,16)
 c.add('div-int/lit8',3,3,9)
 c.add('goto/16','room_size_chosen')''')
repl(" c.add('mul-int/lit8',12,6,39)\n", " c.add('mul-int/lit8',12,6,35)\n")
repl(''' # Phone portrait: 4:3 compact viewport, normal 16:9 scene kept intact,
 # ~33% extra viewport height reveals PocketDJ's existing ceiling strip.
 c.add('mul-int/lit8',4,3,3)
 c.add('div-int/lit8',4,4,4)''',''' # Phone portrait: square viewport matches native Spotify album art exactly.
 # Room drawing is still 16:9 at the bottom; extra height shows the existing
 # ceiling extension instead of stretching scene geometry.
 c.add('move',4,3)''')
repl(''' # Unfolded portrait: move the scene up ~3.1% of the host, clear of the
 # native track metadata row, without changing the existing page width.
 c.add('iget',9,p0,(H,'lastWidth','I'))
 c.add('mul-int/lit8',10,6,3)
 c.add('div-int/lit8',10,10,4)
 c.add('if-le',9,10,'layout_clear_portrait_lift')
 c.add('if-ge',9,6,'layout_clear_portrait_lift')
 c.add('div-int/lit8',10,6,32)
 c.add('sub-int',5,5,10)
 c.mark('layout_clear_portrait_lift')''',''' # Foldable portrait: keep the scene BELOW Spotify's playlist header.
 # Earlier lifts moved the room into the header; instead set a minimum
 # top margin of ~16% of the native layout, with smaller 35%-height scene.
 c.add('iget',9,p0,(H,'lastWidth','I'))
 c.add('mul-int/lit8',10,6,3)
 c.add('div-int/lit8',10,10,4)
 c.add('if-le',9,10,'layout_clear_portrait_lift')
 c.add('if-ge',9,6,'layout_clear_portrait_lift')
 c.add('mul-int/lit8',10,6,16)
 c.add('div-int/lit8',10,10,100)
 c.add('if-ge',5,10,'layout_clear_portrait_lift')
 c.add('move',5,10)
 c.mark('layout_clear_portrait_lift')''')
repl(" c.add('const/16',3,8)\n c.add('invoke-virtual',(1,3),(VIEW,'setVisibility','V',('I',)))\n c.add('invoke-virtual',(0,3),(VIEW,'setVisibility','V',('I',)))", " c.add('const/4',3,4)  # INVISIBLE: retain layout/render pipeline for preload\n c.add('invoke-virtual',(1,3),(VIEW,'setVisibility','V',('I',)))\n c.add('const/16',3,8)\n c.add('invoke-virtual',(0,3),(VIEW,'setVisibility','V',('I',)))")
repl(''' c.add('invoke-virtual',(2,3),(SETTINGS,'setDomStorageEnabled','V',('Z',)))
 c.add('new-instance',5,CLIENT)
 c.add('invoke-direct',(5,),(CLIENT,'<init>','V',()))''',''' c.add('invoke-virtual',(2,3),(SETTINGS,'setDomStorageEnabled','V',('Z',)))
 c.add('invoke-virtual',(2,3),(SETTINGS,'setOffscreenPreRaster','V',('Z',)))
 # Client keeps a Keystore-encrypted, origin-verified recovery copy of
 # PocketDJ's Spotify refresh grant across the host app process lifecycle.
 c.add('new-instance',5,SESSIONCLIENT)
 c.add('invoke-direct',(5,0),(SESSIONCLIENT,'<init>','V',(CTX,)))''')
p.write_text(s)
print('Patched build_v21.py:',len(s),'bytes')