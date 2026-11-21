#!/usr/bin/env python3
"""WP7E: deterministic neutral, transparent material art for the festival.

The existing SVGs remain as alignment and light/shadow masks. These PNGs supply
visible organic detail without baking a sunrise, sunset, spotlights, or windows
into the physical materials. Pillow + NumPy are already used by PocketDJ CI.
"""
from __future__ import annotations

from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1764, 992
OUT = Path("public/assets/scenes/festival-textures")
SEED = 7207

def rgba():
    return Image.new("RGBA", (W,H), (0,0,0,0))

def rnd(seed):
    return random.Random(SEED+seed)

def poly(draw, points, color):
    draw.polygon([(int(x),int(y)) for x,y in points], fill=color)

def noisy_line(draw, rng, x1,y1,x2,y2,colors, width=1, drift=2):
    steps=max(3,int(math.hypot(x2-x1,y2-y1)//16))
    coords=[]
    for j in range(steps+1):
        t=j/steps
        coords.append((x1+(x2-x1)*t+rng.uniform(-drift,drift),
                       y1+(y2-y1)*t+rng.uniform(-drift,drift)))
    draw.line(coords,fill=rng.choice(colors),width=width,joint="curve")

def leafy_tree_art():
    im=rgba();d=ImageDraw.Draw(im,"RGBA");rng=rnd(11)
    palettes=[
        (38,63,55),(52,78,67),(65,91,78),(78,101,85),
        (95,113,94),(50,82,75),(76,103,93),(112,125,101)
    ]
    # Groups are deliberately restricted to the side vegetation and outer corners,
    # preserving the open sky behind the DJ.
    clusters=[
        (86,552,130,116),(220,550,136,104),(306,621,92,79),
        (0,661,120,84),(1700,559,141,112),(1550,565,136,111),
        (1447,623,91,75),(1770,656,126,99),
        (35,66,170,112),(188,21,136,101),(337,-29,104,73),
        (1714,53,168,111),(1561,3,137,95),(1434,-32,103,70)
    ]
    # Trunks and long irregular branches behind the foliage.
    for root, top, direction in [(144,788,-1),(1566,781,1),(25,728,-1),(1721,734,1)]:
        current=(root,top)
        for n in range(6):
            end=(root+direction*(6+n*n*5),top-55-n*41)
            noisy_line(d,rng,*current,*end,[(40,55,51,255),(64,73,62,255)],width=max(3,18-n*3),drift=5)
            noisy_line(d,rng,*current,*end,[(139,135,112,67)],width=max(1,4-n),drift=2)
            if n>1:
                branch=(end[0]-direction*rng.randint(30,100),end[1]-rng.randint(18,58))
                noisy_line(d,rng,*end,*branch,[(45,62,54,245),(62,77,61,225)],width=max(2,9-n),drift=5)
            current=end
    for ci,(cx,cy,rx,ry) in enumerate(clusters):
        # Dark under-canopy: connected irregular silhouettes, not circular blobs.
        for k in range(34):
            angle=rng.random()*math.tau
            radius=math.sqrt(rng.random())*.94
            px=cx+math.cos(angle)*rx*radius
            py=cy+math.sin(angle)*ry*radius
            rr=rng.uniform(13,38)
            pts=[]
            for j in range(9):
                aa=j*math.tau/9
                sr=rr*rng.uniform(.7,1.3)
                pts.append((px+math.cos(aa)*sr,py+math.sin(aa)*sr*.72))
            c=palettes[(ci+k)%len(palettes)]
            poly(d,pts,(*c,rng.randint(138,220)))
        # Detailed leaf lobes, pointed ends and backlit edge color variation.
        count=int(rx*ry/19)
        for k in range(count):
            angle=rng.random()*math.tau
            radius=math.sqrt(rng.random())
            x=cx+math.cos(angle)*rx*radius
            y=cy+math.sin(angle)*ry*radius
            if x<-22 or x>W+22 or y<-22 or y>850: continue
            length=rng.uniform(3.2,10.5) * (1.13 if ci<8 else 1)
            breadth=length*rng.uniform(.32,.72)
            theta=rng.uniform(-3.14,3.14)
            dx=math.cos(theta);dy=math.sin(theta)
            nx=-dy;ny=dx
            pts=[
                (x-length*dx*.60,y-length*dy*.60),
                (x+length*dx*.05+breadth*nx,y+length*dy*.05+breadth*ny),
                (x+length*dx*.56+breadth*.48*nx,y+length*dy*.56+breadth*.48*ny),
                (x+length*dx,y+length*dy),
                (x+length*dx*.46-breadth*.55*nx,y+length*dy*.46-breadth*.55*ny),
                (x-length*dx*.05-breadth*nx,y-length*dy*.05-breadth*ny)
            ]
            color=palettes[rng.randrange(len(palettes))]
            light=.55+(1-(y-cy+ry)/(2*ry))*.28
            variation=rng.randint(-12,14)
            c=tuple(max(0,min(255,round(ch*light+variation))) for ch in color)
            poly(d,pts,(*c,rng.randint(176,255)))
            if k%11==0:
                noisy_line(d,rng,x,y,x+dx*length*.74,y+dy*length*.74,
                           [(168,169,126,62),(24,43,35,68)],width=1,drift=0.7)
    # Very restrained brush texture; no bright baked lighting.
    return im

def mountain_art():
    im=rgba();d=ImageDraw.Draw(im,"RGBA");rng=rnd(22)
    layers=[(590,21,(145,162,173)),(639,27,(112,135,149)),
            (687,18,(82,109,122)),(718,14,(62,91,105))]
    for layer,(base,amp,color) in enumerate(layers):
        ridge=[]
        phase=layer*11.4
        for x in range(-20,W+25,9):
            broad=amp*(.75*math.sin(x/132+phase)+.46*math.sin(x/51+phase*.5))
            fine=rng.uniform(-3.4,3.4)
            # Peaks are irregular, but ridges stay legible at thumbnail size.
            height=base+broad+fine+(-26 if layer==0 and 400<x<650 else 0)
            ridge.append((x,height))
        poly(d,ridge+[(W+20,793),(-20,793)],(*color,255))
        # Shaded channels and geological strata, rather than smooth geometric triangles.
        for i in range(180):
            x=rng.randint(0,W-20)
            idx=max(0,min(len(ridge)-1,int((x+20)/9)))
            y=ridge[idx][1]+rng.uniform(5,100 if layer<3 else 55)
            if y>=788:continue
            span=rng.uniform(4,36)
            c=tuple(min(255,max(0,k+rng.randint(-20,22))) for k in color)
            noisy_line(d,rng,x,y,x+span,y+rng.uniform(-4,3),[(*c,rng.randint(23,70))],drift=1)
        for i in range(28):
            x=rng.randint(30,W-55)
            idx=max(0,min(len(ridge)-1,int((x+20)/9)))
            y=ridge[idx][1]+rng.uniform(7,48)
            if y>790:continue
            noisy_line(d,rng,x,y,x+rng.uniform(22,110),y+rng.uniform(-12,11),
                       [(199,203,189,37),(27,59,73,42)],drift=5)
    # Distance haze is material-only: no sky colored rectangular band.
    return im

def stage_wood_art():
    im=rgba();d=ImageDraw.Draw(im,"RGBA");rng=rnd(33)
    # Long planks run towards a shared vanishing point, with rough individual grain.
    d.rectangle((0,754,W,902),fill=(119,103,88,255))
    front_width=78
    for plank in range(-14,39):
        x0=882+plank*front_width
        x1=882+(x0-882)*.52
        xnext=882+(plank+1)*front_width
        xnext1=882+(xnext-882)*.52
        base=(120+rng.randint(-15,17),103+rng.randint(-13,14),87+rng.randint(-12,14))
        poly(d,[(x1,754),(xnext1,754),(xnext,902),(x0,902)],(*base,255))
        d.line([(x1,754),(x0,902)],fill=(39,39,38,117),width=2)
        d.line([(x1+2,755),(x0+3,901)],fill=(204,190,163,45),width=1)
    # Non-regular, staggered end-grain joints and gaps.
    for i in range(160):
        y=rng.randint(760,895)
        x=rng.randint(0,W-20)
        ww=rng.randint(9,60)
        if i%8==0:
            d.line((x,y,x+ww,y),fill=(40,38,37,90),width=2)
            d.line((x,y+2,x+ww-2,y+2),fill=(217,195,160,44),width=1)
    for i in range(3200):
        x=rng.randrange(W);y=rng.randint(755,899)
        length=rng.randint(7,90)
        # Grain becomes wider and more legible toward the front.
        intensity=rng.randint(12,61)
        shade=(43,44,40,intensity) if i%3 else (229,206,171,intensity//2)
        d.line((x,y,min(W,x+length),y+rng.choice([-1,0,0,1])),fill=shade,width=1)
    for i in range(52):
        x=rng.randint(10,W-10);y=rng.randint(763,892)
        rr=rng.randint(3,9)
        d.arc((x-rr*3,y-rr,x+rr*3,y+rr),180,355,fill=(48,43,41,90),width=1)
        d.ellipse((x-rr,y-rr*.35,x+rr,y+rr*.35),outline=(48,43,41,92),width=1)
    # Stage fascia: weathered vertical timber and metal fasteners.
    d.rectangle((0,901,W,991),fill=(62,55,52,255))
    d.rectangle((0,900,W,908),fill=(149,130,111,255))
    d.line((0,898,W,898),fill=(214,192,156,93),width=2)
    for x in range(0,W,51):
        base=rng.randint(-12,10)
        d.rectangle((x,910,min(W,x+50),991),fill=(65+base,57+base,54+base,255))
        d.line((x,908,x,991),fill=(25,29,32,153),width=3)
        d.line((x+3,908,x+3,990),fill=(166,146,120,45),width=1)
        for j in range(rng.randint(4,11)):
            sx=x+rng.randint(5,44)
            ys=rng.randint(911,974)
            d.line((sx,ys,sx+rng.randint(-2,2),min(990,ys+rng.randint(11,47))),
                    fill=(19,23,23,rng.randint(8,38)),width=1)
        d.ellipse((x+22,907,x+26,911),fill=(31,38,37,255))
    # Rail remains physically behind floor; represent exposed horizontal and posts.
    d.line((0,720,W,720),fill=(96,108,110,255),width=5)
    d.line((0,757,W,757),fill=(81,93,99,255),width=4)
    for x in range(6,W,77):
        d.line((x,721,x,757),fill=(111,128,130,255),width=4)
        d.ellipse((x-4,716,x+4,725),fill=(184,191,188,255))
    return im

def fabric_and_metal_details():
    im=rgba();d=ImageDraw.Draw(im,"RGBA");rng=rnd(44)
    # Transparent textile micrograin; precisely masked by canopy.svg in CSS.
    for i in range(8800):
        x=rng.randint(50,1711);y=rng.randint(25,275)
        # cloth weave with fine soft neutral threads
        alpha=rng.randint(6,31)
        light=i%3==0
        c=(222,228,222,alpha) if light else (32,49,59,alpha)
        length=rng.randint(2,10)
        d.line((x,y,x+length,y+rng.randint(-1,1)),fill=c,width=1)
    # Fabric seam stitching: convergence from ridge poles towards edges.
    for x,y,x2,y2 in [
        (882,32,882,217),(591,50,461,217),(1173,50,1311,218),
        (348,80,215,220),(1418,80,1549,220),
        (178,135,104,215),(1587,135,1664,218)
    ]:
        noisy_line(d,rng,x,y,x2,y2,[(29,45,56,38)],1,1.5)
        length=math.hypot(x2-x,y2-y)
        for t in np.arange(0,1,6/max(1,length)):
            sx=x+(x2-x)*t;sy=y+(y2-y)*t
            d.line((sx,sy,sx+2,sy+2),fill=(239,234,217,110),width=1)
    # Structural rivets, rust flecks, and metallic scuffs.
    for y in (175,208,239):
        for x in range(160,1620,35):
            d.ellipse((x-2,y-2,x+2,y+2),fill=(40,53,58,150))
            d.ellipse((x-1,y-2,x,y-1),fill=(219,219,207,105))
    for x in (139,1626):
        for y in range(260,761,24):
            d.line((x-23,y,x-10,y-1),fill=(219,220,209,79),width=1)
            d.line((x+19,y+2,x+26,y+3),fill=(40,50,55,90),width=1)
            d.ellipse((x-3,y-2,x+1,y+2),fill=(49,61,64,120))
        for i in range(190):
            xx=x+rng.randint(-28,28);yy=rng.randint(238,764)
            d.point((xx,yy),fill=(49,65,68,rng.randint(12,56)))
    return im

def skyline_details():
    im=rgba();d=ImageDraw.Draw(im,"RGBA");rng=rnd(55)
    # Detailed facade variation on top of the existing authored SVG skyline.
    for i,x in enumerate(range(361,1425,12)):
        ht=rng.randrange(31,118);y=738-ht
        if i%4==0:
            d.line((x,y+5,x,735),fill=(37,57,67,73),width=1)
        if i%3==0:
            d.line((x+3,y+2,x+9,y+2),fill=(199,196,176,79),width=1)
        if i%6==0:
            d.line((x+4,y-9,x+4,y),fill=(75,92,103,107),width=2)
        for wy in range(y+8,732,11):
            if rng.random()>.45:
                d.rectangle((x+3,wy,x+6,wy+3),fill=(31,54,66,rng.randint(40,125)))
    return im

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    layers={
        "trees-detail.png": leafy_tree_art(),
        "mountains-detail.png": mountain_art(),
        "stage-floor-detail.png": stage_wood_art(),
        "canopy-detail.png": fabric_and_metal_details(),
        "city-detail.png": skyline_details(),
    }
    for filename,im in layers.items():
        assert im.size==(W,H) and im.mode=="RGBA"
        assert im.getbbox() is not None
        alpha=np.asarray(im.getchannel("A"))
        assert int((alpha==0).sum())>W*H*.09, filename + " missing transparent area"
        im.save(OUT/filename,optimize=True,compress_level=7)
        print(f"{filename}: {W}x{H}, alpha coverage {(alpha>0).mean():.1%}, {((OUT/filename).stat().st_size/1024):.0f} KiB")

if __name__=="__main__":
    main()
