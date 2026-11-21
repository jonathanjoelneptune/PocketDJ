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
    """Fine-grain decking, intentionally lower contrast than the former busy grid."""
    im=rgba();d=ImageDraw.Draw(im,"RGBA");rng=rnd(33)
    # Perspective is shared with the stage. Planks broaden naturally towards
    # the near lip instead of forming the old, distracting checkerboard.
    d.rectangle((0,754,W,902),fill=(120,103,88,255))
    for plank in range(-17,37):
        back_step=38.0
        front_step=73.0
        xl=882+(plank-11)*back_step
        xr=882+(plank-10)*back_step
        frontl=882+(plank-11)*front_step
        frontr=882+(plank-10)*front_step
        v=rng.randint(-9,10)
        grain=(117+v,100+v,86+v)
        poly(d,[(xl,754),(xr,754),(frontr,902),(frontl,902)],(*grain,255))
        # One real recess at each seam; edge catches only ambient light.
        d.line([(xl,754),(frontl,902)],fill=(41,39,40,105),width=2)
        d.line([(xl+2,754),(frontl+3,901)],fill=(209,184,155,52),width=1)
        # Grain fibers follow the plank direction and end at a distance-dependent Y.
        for i in range(43):
            y=rng.uniform(761,893)
            t=(y-754)/148
            left=xl+(frontl-xl)*t
            right=xr+(frontr-xr)*t
            if right-left<5:continue
            x=rng.uniform(left+2,right-2)
            length=rng.uniform(10,47) * (.44+.56*t)
            endy=min(899,y+length)
            # Preserve the vanishing point instead of scattering horizontal noise.
            xend=x+(x-882)*.0017*length+rng.uniform(-.35,.35)
            alpha=rng.randint(10,45)
            ink=(42,39,39,alpha) if i%3 else (228,203,164,max(5,alpha//2))
            d.line([(x,y),(xend,endy)],fill=ink,width=1)
        # Knots are infrequent and follow the plank's long axis.
        if rng.random()<.43:
            yy=rng.uniform(790,881)
            t=(yy-754)/148
            xx=rng.uniform(xl+(frontl-xl)*t+4,xr+(frontr-xr)*t-4)
            r=rng.uniform(1.4,3.4)
            d.ellipse((xx-r,yy-r*2,xx+r,yy+r*2),outline=(53,44,40,79),width=1)
            d.arc((xx-r*2,yy-r*4,xx+r*2,yy+r*4),300,180,fill=(53,44,40,34),width=1)
    # Staggered transverse cuts, dark enough to read but not form a repeating grid.
    for i in range(27):
        y=rng.uniform(773,886)
        x=rng.uniform(40,W-40)
        gap=rng.uniform(22,50)
        d.line((x,y,x+gap,y),fill=(37,37,39,62),width=1)
    # Occasional shallow wear patches; stage remains a neutral unlit material.
    for i in range(56):
        x=rng.randrange(W);y=rng.randrange(770,897)
        width=rng.uniform(7,21)
        d.arc((x-width/2,y-3,x+width/2,y+3),185,355,fill=(207,185,156,27),width=1)
    # Front lip and vertical fascia panels have a different material texture.
    d.rectangle((0,902,W,991),fill=(65,55,53,255))
    d.rectangle((0,897,W,906),fill=(147,129,110,255))
    d.line((0,899,W,899),fill=(213,190,160,93),width=2)
    for x in range(0,W,59):
        variation=rng.randint(-6,7)
        d.rectangle((x,910,min(W,x+58),991),fill=(66+variation,56+variation,54+variation,255))
        d.line((x,908,x,991),fill=(29,31,33,152),width=2)
        d.line((x+3,911,x+3,989),fill=(186,161,134,31),width=1)
        for j in range(6):
            sx=x+rng.randint(7,51);sy=rng.randint(915,977)
            d.line((sx,sy,sx+rng.randint(-2,2),min(990,sy+rng.randint(8,28))),
                   fill=(25,29,28,rng.randint(10,37)),width=1)
        d.ellipse((x+25,906,x+28,909),fill=(37,42,39,180))
    # Balcony rails, with separate highlights; lighting comes later.
    d.line((0,720,W,720),fill=(95,109,110,255),width=4)
    d.line((0,758,W,758),fill=(83,97,100,255),width=4)
    for x in range(7,W,77):
        d.line((x,721,x,757),fill=(108,124,126,255),width=4)
        d.ellipse((x-3,717,x+3,724),fill=(176,185,185,255))
    return im

def fabric_and_metal_details():
    """Canopy textile folds and truss distress: RGB-neutral, no baked spotlights."""
    im=rgba();d=ImageDraw.Draw(im,"RGBA");rng=rnd(44)
    # Broad canopy cloth folds: smooth tonal undulations, with no hard rings.
    # This whole surface is shape-clipped by canopy.svg in the scene renderer.
    for i in range(29):
        t=(i+.5)/29
        x=62+1640*t
        height=190-86*math.sin(t*math.pi)
        stroke=(232,231,224,24) if i%3 else (39,57,65,21)
        noisy_line(d,rng,x,height*.5+5,x+21,height+22,[stroke],width=rng.choice((3,4,5)),drift=9)
    # Weave microthreads form directional texture, avoiding perfectly smooth fills.
    for i in range(5700):
        x=rng.randint(55,1707)
        y=rng.randint(24,266)
        alpha=rng.randint(6,21)
        tone=(231,232,225,alpha) if i%2 else (31,51,64,alpha)
        length=rng.randint(3,8)
        d.line((x,y,x+length,y),fill=tone,width=1)
    # Stitched canvas seams and little seam folds; no glowing light is baked in.
    seams=[(178,135,85,216),(348,77,222,213),(588,49,455,207),
           (882,25,882,209),(1170,49,1310,207),
           (1422,78,1543,218),(1588,135,1681,217)]
    for x,y,xe,ye in seams:
        noisy_line(d,rng,x,y,xe,ye,[(42,58,65,48)],1,1.1)
        distance=math.hypot(xe-x,ye-y)
        for step in range(int(distance//6)):
            t=step/(distance/6)
            xx=x+(xe-x)*t; yy=y+(ye-y)*t
            d.line((xx,yy,xx+1,yy+2),fill=(231,230,216,80),width=1)
    # Cross-braces, rivets, scuffs and small fasteners become visible at full size.
    for y in (174,212,240):
        for x in range(159,1620,32):
            d.ellipse((x-2,y-2,x+2,y+2),fill=(41,58,63,167))
            d.ellipse((x-1,y-2,x,y-1),fill=(229,228,213,116))
            if x%3==0:
                d.line((x+4,y+3,x+14,y+3),fill=(224,223,210,55),width=1)
    for x in (139,1626):
        for y in range(259,759,23):
            d.line((x-24,y,x-7,y-1),fill=(212,212,199,79),width=1)
            d.line((x+9,y+2,x+26,y+3),fill=(35,50,59,97),width=1)
            d.ellipse((x-3,y-2,x+1,y+2),fill=(47,60,67,122))
        for i in range(190):
            xx=x+rng.randint(-28,28);yy=rng.randint(239,762)
            d.point((xx,yy),fill=(40,61,68,rng.randint(10,49)))
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
