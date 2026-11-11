from pathlib import Path
p=Path('/mnt/data/pdj_v20/src/SwipeRouter.java')
s=p.read_text()
def repl(a,b):
 global s
 assert s.count(a)==1,('expected one',s.count(a),a[:90]);s=s.replace(a,b)
repl('        int swipeDirection;\n', '        int swipeDirection;\n        Rect lastAlbumBounds; // Artwork-only region persists when the WebView becomes visible.\n')
repl('''            View target = locateGestureTarget(host);
            if (target == null) return FORWARD;
            Rect art = artworkRect(host, target);
            if (art == null || !art.contains((int)e.getRawX(), (int)e.getRawY())) return FORWARD;''','''            // Important: when PocketDJ is visible its WebView is shorter than
            // Spotify's square artwork on many phones. Hit testing the WebView
            // loses the lower part of the album's swipe region and lets Spotify
            // skip the song. Always prefer the native artwork bounds, including
            // while PocketDJ is shown. Reuse the previous album bounds if
            // Spotify has temporarily recycled its image view.
            boolean showingRoom = isRoomShown(host);
            Rect art = nativeArtworkRect(host);
            if (!showingRoom && art != null) state.lastAlbumBounds = new Rect(art);
            if (showingRoom && state.lastAlbumBounds != null &&
                    (art == null || art.height() < state.lastAlbumBounds.height())) {
                art = new Rect(state.lastAlbumBounds);
            }
            if (art == null) {
                View target = locateGestureTarget(host);
                if (target == null) return FORWARD;
                art = artworkRect(host, target);
            }
            if (art == null || !art.contains((int)e.getRawX(), (int)e.getRawY())) return FORWARD;
            Log.d(TAG, "artwork gesture region=" + art.toShortString() +
                    " room=" + showingRoom);''')
# NativeArtworkRect is now always used first: if carousel rectangle is invalid, fall back to image bounds.
repl('''        if (nativeCarousel != null && nativeCarousel.getWidth() > 100 &&
                nativeCarousel.getHeight() > 100) {
            return artworkRect(host, nativeCarousel);
        }''','''        if (nativeCarousel != null && nativeCarousel.getWidth() > 100 &&
                nativeCarousel.getHeight() > 100) {
            Rect rect = artworkRect(host, nativeCarousel);
            if (rect != null && rect.width() >= 140 && rect.height() >= 140) return rect;
        }''')
# Adjust rectangle max to image area (not controls) with cache; was prior 65% screen only
repl('''        int maxHeight=Math.min(h, Math.min(w,Math.round(windowHeight*0.65f)));''','''        int maxHeight=Math.min(h, Math.min(w,Math.round(windowHeight*0.72f)));''')
p.write_text(s)

# The native Hook stores the geometry. Phone portrait gets an actual taller
# WebView rather than scaling the room, enabling the web app's existing ceiling
# reveal. Tablet portrait only shifts existing room up; its width/height stay
# unchanged so no title or progress overlap.
p=Path('/mnt/data/pdj_v20/build_v20.py');s=p.read_text()
s=s.replace('PocketDJ Spotify v1.9: bidirectional native artwork/page animation and responsive scene viewport.', 'PocketDJ Spotify v2.0: artwork-native hitbox, tall room viewport, foldable alignment.')
s=s.replace("ROOT=Path('/mnt/data/pdj_v19')", "ROOT=Path('/mnt/data/pdj_v20')")
s=s.replace("DST=Path('/mnt/data/PocketDJ-Spotify-v1.9-BIDIRECTIONAL-SWIPE.apk')", "DST=Path('/mnt/data/PocketDJ-Spotify-v2.0-ARTWORK-BOUNDS.apk')")
# Landscape cap unchanged to protect seekbar. Tablet portrait cap unchanged.
s=s.replace("c.add('if-le',3,12,'room_size_chosen')\n c.add('mul-int/lit8',12,6,39)","c.add('if-le',3,12,'phone_tall')\n c.add('mul-int/lit8',12,6,39)")
s=s.replace("c.add('div-int/lit8',3,3,9)\n c.mark('room_size_chosen')", "c.add('div-int/lit8',3,3,9)\n c.add('goto/16','room_size_chosen')\n c.mark('phone_tall')\n # Phone portrait: 4:3 compact viewport, normal 16:9 scene kept intact,\n # ~33% extra viewport height reveals PocketDJ's existing ceiling strip.\n c.add('mul-int/lit8',4,3,3)\n c.add('div-int/lit8',4,4,4)\n c.mark('room_size_chosen')")
s=s.replace("c.mark('set_compact_layout')\n c.add('new-instance',8,FLP)", "c.mark('set_compact_layout')\n # Unfolded portrait: move the scene up ~3.1% of the host, clear of the\n # native track metadata row, without changing the existing page width.\n c.add('iget',9,p0,(H,'lastWidth','I'))\n c.add('mul-int/lit8',10,6,3)\n c.add('div-int/lit8',10,10,4)\n c.add('if-le',9,10,'layout_clear_portrait_lift')\n c.add('if-ge',9,6,'layout_clear_portrait_lift')\n c.add('div-int/lit8',10,6,32)\n c.add('sub-int',5,5,10)\n c.mark('layout_clear_portrait_lift')\n c.add('new-instance',8,FLP)")
assert "phone_tall" in s and "layout_clear_portrait_lift" in s
p.write_text(s)
print('v2.0 native/DEX patches applied')