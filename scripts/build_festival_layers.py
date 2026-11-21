#!/usr/bin/env python3
"""Create five pixel-aligned transparent festival PNG layers from the source illustration.
Run after the generated art has been placed in public/assets/scenes/.
The sky PNG contains neutral translucent cloud details; CSS supplies day/night color.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = Path("public/assets/scenes/festival-stage-illustrated-v1.png")
OUTPUT = Path("public/assets/scenes/festival-layers")
NAMES = ("festival-sky.png","festival-landscape.png","festival-city.png","festival-rafters.png","festival-floor.png")

def polygon(size, coords):
    w, h = size
    mask = Image.new("L",size,0)
    ImageDraw.Draw(mask).polygon([(round(x*w),round(y*h)) for x,y in coords],fill=255)
    return np.asarray(mask)>0

def generate(source=SOURCE, output=OUTPUT):
    image=Image.open(source).convert("RGB")
    w,h=image.size
    rgb=np.asarray(image)
    f=rgb.astype(np.float32)
    r,g,b=f[:,:,0],f[:,:,1],f[:,:,2]
    yy,xx=np.mgrid[:h,:w]
    x,y=xx/w,yy/h
    open_blue=(b>112)&(b>r*1.24)&(b>g*1.08)&(g>r*.90)&(g>65)
    roof=polygon((w,h),[(0,.194),(.035,.188),(.101,.116),(.2,.075),(.33,.048),(.5,.019),(.66,.048),(.81,.076),(.96,.115),(1,.194),(.976,.218),(.85,.205),(.7,.183),(.54,.17),(.44,.17),(.3,.18),(.17,.205),(.03,.228)])
    rafters=roof | ((y<.268) & ~open_blue) | (((x<.147)|(x>.853)) & (y<.767) & (y>=.215) & ~open_blue)
    horizon=polygon((w,h),[(0,.58),(.06,.61),(.14,.594),(.22,.57),(.26,.578),(.32,.606),(.41,.599),(.48,.615),(.55,.60),(.64,.571),(.69,.581),(.77,.608),(.86,.593),(.94,.598),(1,.58),(1,.775),(0,.775)])
    sides=((x<.225)|(x>.775)) & (y>.31) & (y<.765)
    foliage=sides & (r<145)&(g<165)&(b<155)&((g>=r*.75)|(r<75))&~open_blue
    foliage=np.asarray(Image.fromarray(foliage.astype("uint8")*255).filter(ImageFilter.MaxFilter(3)))>0
    landscape=horizon | foliage
    city=polygon((w,h),[(.23,.683),(.31,.662),(.41,.659),(.49,.643),(.57,.64),(.67,.648),(.77,.675),(.77,.764),(.23,.764)])
    floor=y>=.762
    remaining=np.ones((h,w),dtype=bool)
    groups={}
    for name,mask in [("festival-floor.png",floor),("festival-rafters.png",rafters),("festival-city.png",city),("festival-landscape.png",landscape)]:
        groups[name]=mask & remaining
        remaining &= ~mask
    output.mkdir(parents=True,exist_ok=True)
    cloud_zone=(y>.255)&(y<.61)&remaining
    white=np.clip((np.minimum(np.minimum(r,g),b)-138)/105,0,1)
    neutral=np.clip((95-(np.maximum(np.maximum(r,g),b)-np.minimum(np.minimum(r,g),b)))/65,0,1)
    cloud_alpha=(cloud_zone*white*(.35+.65*neutral)*82).astype("uint8")
    sky=Image.new("RGBA",(w,h),(238,243,248,0))
    sky.putalpha(Image.fromarray(cloud_alpha).filter(ImageFilter.GaussianBlur(.8)))
    sky.save(output/NAMES[0],optimize=True)
    for name in NAMES[1:]:
        mask=groups[name]
        layer=np.zeros((h,w,4),dtype="uint8")
        layer[mask,:3]=rgb[mask]
        layer[mask,3]=255
        Image.fromarray(layer,"RGBA").save(output/name,optimize=True)
    for name in NAMES:
        result=Image.open(output/name)
        assert result.size==(w,h) and result.mode=="RGBA", name
    print("Built five festival layers:",w,"x",h)

if __name__=="__main__":
    generate()
