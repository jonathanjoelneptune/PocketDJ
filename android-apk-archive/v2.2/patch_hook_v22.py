#!/usr/bin/env python3
"""Patch the v2.1 custom Hook for v2.2 native artwork and transport-safe geometry.
Only PocketDJ classes18.dex changes. Spotify-owned APK resources remain unchanged.
"""
from pathlib import Path
p=Path('/mnt/data/pdj_v22/build_v22.py')
s=p.read_text()
def replace(a,b):
    global s
    n=s.count(a)
    if n!=1: raise ValueError(f'Expected exactly once, found {n}: {a[:100]}')
    s=s.replace(a,b)
replace('PocketDJ Spotify v2.1: preloaded persistent session, geometry and gesture stability.',
        'PocketDJ Spotify v2.2: warmed assets, exact geometry and transport clearance.')
replace("ROOT=Path('/mnt/data/pdj_v21')", "ROOT=Path('/mnt/data/pdj_v22')")
replace("DST=Path('/mnt/data/PocketDJ-Spotify-v2.1-CORE-STABILITY.apk')", "DST=Path('/mnt/data/PocketDJ-Spotify-v2.2-PRELOAD-LAYOUT.apk')")
replace(" c.add('mul-int/lit8',12,6,45)\n", " c.add('mul-int/lit8',12,6,39)\n")
replace(""" c.add('if-le',4,12,'room_size_chosen')
 c.add('move',4,12)
 c.add('mul-int/lit8',3,4,16)
 c.add('div-int/lit8',3,3,9)
 c.add('goto/16','room_size_chosen')
 c.mark('phone_tall')""", """ # Keep the unfolded portrait container's height; shrink the actual 16:9
 # base scene width by 8% so its natural ceiling reveal can occupy the
 # upper part of that SAME container, never covering Spotify's song title.
 c.add('if-le',4,12,'fold_tall_scene')
 c.add('move',4,12)
 c.mark('fold_tall_scene')
 c.add('mul-int/lit8',3,4,16)
 c.add('div-int/lit8',3,3,9)
 c.add('mul-int/lit8',3,3,92)
 c.add('div-int/lit8',3,3,100)
 c.add('goto/16','room_size_chosen')
 c.mark('phone_tall')""")
replace(""" # Phone portrait: square viewport matches native Spotify album art exactly.
 # Room drawing is still 16:9 at the bottom; extra height shows the existing
 # ceiling extension instead of stretching scene geometry.
 c.add('move',4,3)""", """ # Phone portrait: 0.9:1 viewport fits the native artwork but leaves the
 # song title and lyrics visible below. The unchanged 16:9 base room sits
 # at bottom with a proportional ceiling above it, rather than being stretched.
 c.add('mul-int/lit8',4,3,9)
 c.add('div-int/lit8',4,4,10)""")
replace(""" c.add('iget',12,p0,(H,'lastWidth','I'))
 c.add('if-ge',12,6,'artwork_top_only')
 c.add('sub-int',10,10,4)
 c.add('div-int/lit8',10,10,2)""", """ # Phone and landscape use the native artwork TOP: centering a smaller
 # viewport within a square cover leaves it too low and overlaps lyrics.
 # Only fold portrait retains a centered artwork offset.
 c.add('iget',12,p0,(H,'lastWidth','I'))
 c.add('if-ge',12,6,'artwork_top_only')
 c.add('mul-int/lit8',9,6,2)
 c.add('div-int/lit8',9,9,3)
 c.add('if-le',12,9,'artwork_top_only')
 c.add('sub-int',10,10,4)
 c.add('div-int/lit8',10,10,2)""")
p.write_text(s)
print('Patched v2.2 Hook script:',len(s),'bytes')