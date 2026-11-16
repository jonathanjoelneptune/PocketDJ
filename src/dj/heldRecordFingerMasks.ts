/** Pixel-exact foreground fingertip regions extracted from original DJ NES
 * cinematic sprites, with the source color and alpha preserved at render time.
 * Each base36 'offset,length' run identifies pixels in the 582×652 sprite
 * canvas that must be painted ABOVE the held album. Region masks were built
 * against the approved v2 cover positions (circle/quad), with a one-pixel edge
 * allowance to preserve finger outlines. These do not include the old black
 * record or the sleeve artwork beneath it.
 *
 * A41 uses one mask for both independently calibrated left/right poses.
 * Masks are static data, never guessed from the user's album cover colors.
 */
const ENCODED_FINGER_MASKS: Readonly<Record<string, string>> = {
  "a41.png": "3ad3,3;3at9,4;3b9f,5;3bpl,5;3c5r,6;3cly,5;3d25,5;3dib,5;3dyh,6;3een,6;3euu,5;3fb0,5;3foc,g;3fqu,j;3g4i,i;3g6z,k;3gko,i;3gn4,l;3h0t,j;3h3a,m;3hgz,m;3hjf,n;3hx5,m;3hzk,o;3ida,n;3ifp,q;3itg,n;3ivv,q;3j9m,n;3jc1,q;3jps,n;3js8,p;3k5y,n;3k8e,p;3km3,6;3kmj,5;3kon,3;3kp0,a;3l29,j;3l4t,n;3lif,m;3lkz,i;3lli,4;3lyl,n;3m10,s;3mer,q;3mh6,s;3mux,r;3mxb,t;3nb3,r;3ndh,t;3nr9,r;3ntn,t;3o7f,r;3o9t,t;3onl,r;3opz,t;3p3q,s;3p65,u;3pjx,r;3pmc,s;3q03,q;3q2j,r;3qg9,j;3qj5,b;3qwf,n;3qyw,q;3rcl,o;3rf2,q;3rsr,o;3rv8,q;3s8x,o;3sbe,q;3sp3,o;3srk,q;3t59,o;3t7q,q;3tlf,o;3tnw,q;3u1m,n;3u42,p;3uhs,m;3uk9,o;3uxy,k;3v0h,m;3ve4,j;3vgo,l;3vua,h;3vwz,g;3wah,d;3wd2,i;3wqn,g;3wt6,k;3x6t,g;3x9b,l;3xn0,f;3xph,k;3y36,f;3y5n,k;3yjc,f;3ylt,k;3yzj,d;3z20,i;3zfp,c;3zi7,h;3zvw,a;3zyf,e;40c2,9;40el,e;40s9,7;40ut,b;418f,2;41b6,4;41rc,3;427i,3",
  "a11.png": "2pc9,8;2psd,c;2q8j,c;2qoo,d;2r4u,f;2rl0,f;2s16,h;2shd,g;2sxj,g;2tdq,h;2tr1,a;2ttx,g;2u77,j;2ua5,e;2und,k;2uqb,e;2v3j,k;2v6i,e;2vjp,k;2vm8,8;2vmr,b;2vzv,k;2w2d,c;2w2y,a;2wg1,k;2wii,f;2wj4,9;2ww6,l;2wyo,j;2wza,9;2xcd,k;2xeu,k;2xfg,8;2xsj,j;2xv0,l;2xvm,7;2y8p,g;2yb6,t;2yov,2;2yp1,4;2yrc,t;2z7j,s;2znq,r;301d,a;303v,6;3042,o;30hj,d;30jz,x;30xp,e;3105,x;31dv,j;31gb,x;31u1,k;31wh,x;32a8,k;32cn,w;32qe,n;32st,w;336k,n;338z,u;33mq,n;33p5,u;342x,m;345d,s;34j3,m;34lj,t;34z9,m;351m,w;35fg,7;35fr,a;35hr,6;35i0,n;35vm,9;35w2,3;35xx,w;36bs,a;36e3,v;36rz,a;36ua,t;3785,c;37ag,t;37ob,d;37qm,u;384i,c;386t,s;38ko,c;38mz,s;390v,b;3936,q;39h1,b;39jd,p;39x8,9;39zl,m;3ade,8;3afr,m;3atl,6;3avx,l;3b9s,5;3bc3,k;3bpy,5;3bs5,o;3c65,3;3c8a,o;3cmc,2;3cog,n;3d4k,p;3dkq,o;3e0w,k;3eh4,g;3exa,c;3fdg,b",
  "a12.png": "2a3e,4;2ajg,9;2awy,a;2azl,b;2azx,1;2bd3,b;2bfr,e;2bt2,i;2bvw,f;2c96,k;2cc2,f;2cpb,l;2cs8,f;2d5h,l;2d8e,f;2dln,k;2dok,f;2e1s,k;2e4q,f;2ehy,k;2ekx,e;2ey3,h;2f13,f;2fea,d;2fh9,e;2fug,c;2fx5,9;2fxg,3;2fxk,9;2gam,a;2gda,b;2gdq,9;2gqs,9;2gr4,e;2gtg,e;2gtx,8;2h6y,9;2h7a,i;2h9m,p;2hn4,u;2hps,p;2i3a,6;2i3h,o;2i5y,p;2ijg,4;2ijn,o;2im4,j;2imq,3;2izm,v;2j2a,p;2jfs,v;2jig,p;2jvy,v;2jyn,o;2kc5,u;2ket,n;2ksb,q;2kv1,l;2l8h,q;2lb2,a;2lbd,f;2lon,w;2lr7,r;2m4u,w;2m7d,q;2ml0,w;2mnj,q;2n16,w;2n3q,f;2n46,9;2nhd,v;2njw,o;2nxj,v;2o02,o;2odp,v;2og8,o;2otw,t;2owe,3;2owi,j;2pa2,r;2pco,j;2pq8,q;2psx,g;2q6f,o;2q94,e;2qml,l;2qpa,e;2r2s,n;2r57,m;2riy,n;2rlc,n;2rz5,n;2s1i,e;2s1x,7;2sfb,n;2sho,g;2si5,5;2svi,m;2sxu,h;2syc,3;2tbp,l;2te0,i;2tej,1;2trv,k;2tu7,j;2u82,j;2uad,i;2uo9,f;2uqj,h;2v4f,f;2v6t,d;2vkm,d;2vn2,9;2w0t,8;2w38,8;2wh0,5;2wjc,9;2wx6,2;2wzg,b;2xfl,b;2xvr,a;2ybu,c;2yrz,c;2z85,b;2zo7,e;304a,f;30kg,e;310m,d;31gs,b;31wy,a;32d4,8;32ta,7;339g,5",
  "a11m.png": "2p3w,5;2pk2,7;2q08,7;2qgd,9;2qwj,9;2rcp,9;2rsv,9;2s91,8;2sp7,8;2t5d,7;2tlj,6;2tob,b;2u1p,4;2u48,k;2uhv,4;2ukd,l;2uy0,4;2v0j,m;2vei,8;2vgp,l;2vul,c;2vwv,l;2wap,f;2wd1,l;2wqr,j;2wt7,l;2x6w,k;2x9d,l;2xn1,l;2xpk,k;2y37,l;2y5t,h;2yjd,l;2ym5,4;2ymd,3;2yzj,k;2z2k,2;2zfp,j;2ziq,2;2zvw,c;2zw9,6;2zyn,a;30c2,l;30eq,d;30s8,l;30uv,e;318e,l;31aw,j;31ol,k;31r1,j;324r,k;3276,k;32kx,k;32n9,n;3313,k;333f,n;33ha,j;33jl,m;33xg,h;33zr,m;34dn,g;34fx,l;34tt,j;34w3,l;359z,b;35ad,6;35c9,a;35cn,7;35q6,j;35sh,3;35sr,8;366c,j;368w,9;36mj,h;36p1,9;372p,h;3755,b;37iw,g;37la,b;37z3,e;381g,a;38f9,e;38hm,a;38vg,c;38xs,9;39bn,a;39dy,8;39rt,8;39u5,7;3a80,7;3aac,5;3ao7,6;3aqj,3;3b4e,5;3b6p,2;3bkk,9;3bmv,2;3c0r,9;3cgy,8;3cx5,9;3ddc,8;3dtj,7;3e9r,3;3epy,2;3f65,1",
  "a12m.png": "29tc,4;2a9h,a;2apn,a;2ase,a;2b5t,b;2b8k,b;2blz,b;2boq,i;2c25,c;2c4w,k;2cib,c;2cl2,l;2cyh,c;2d18,m;2dem,d;2dhf,l;2dut,b;2dxm,k;2dy8,2;2eaz,a;2eds,o;2er5,a;2eu2,k;2f7b,a;2fac,g;2fnh,6;2fnt,9;2fqi,g;2g3n,5;2g3y,b;2g6q,e;2gjt,4;2gk1,e;2gmj,b;2gmx,d;2gzz,m;2h2l,f;2h34,c;2hg5,n;2hin,z;2hwb,n;2hyt,o;2hzi,a;2ick,k;2iez,p;2ifp,9;2iso,l;2iv5,y;2j8u,l;2jbb,y;2jp0,k;2jrh,y;2k56,k;2k7n,y;2kld,h;2knw,u;2l1j,b;2l1v,b;2l43,t;2lhp,n;2lk2,10;2lxv,n;2m07,11;2me2,m;2mgd,10;2mu8,4;2mud,h;2mwj,10;2nae,m;2ncp,10;2nql,l;2nsv,z;2o6r,l;2o91,z;2omy,j;2op8,x;2p34,f;2p5h,u;2pjb,b;2pln,t;2pzh,a;2q1v,r;2qfo,8;2qi4,n;2qvu,j;2qy7,q;2rc1,i;2rec,q;2rs7,2;2rsb,e;2rui,q;2s8f,g;2sao,p;2sok,h;2squ,p;2t4r,g;2t70,o;2tky,f;2tn6,n;2u15,e;2u3d,l;2uhb,d;2ujl,j;2uxi,8;2uzs,h;2vdp,4;2vfy,g;2vtw,3;2vw9,a;2wa3,4;2wci,6;2wq9,6;2wsq,4;2x6g,6;2x8x,2;2xmn,6;2xp1,3;2y2u,7;2y57,2;2yj2,6;2yz9,5;2zfg,8;2zvn,a;30bv,9;30s2,8;3189,7;31oh,5;324p,2",
  "a11-2.png": "4m22,3;4m27,a;4mhk,6;4mhs,j;4mid,a;4mxn,9;4mxy,j;4myj,a;4ndt,9;4ne4,j;4ner,8;4ntz,a;4nua,k;4nux,8;4oa5,v;4ob4,7;4oqb,b;4oqn,j;4p6h,b;4p6t,j;4pmn,b;4pmz,j;4po0,1;4q2t,s;4q46,2;4qj0,b;4qjd,b;4qkc,2;4qz7,a;4qzk,a;4r0k,1;4rfd,a;4rfq,9;4rgq,2;4rvj,a;4rvw,9;4rww,3;4sd3,2;4sta,3;4t9g,3;4tpn,2;4u5t,2;4ulz,2;4v25,2;4vib,2;4vyh,2;4wen,2;4wut,2;4xaz,2",
  "a11-2m.png": "4mp5,8;4mph,j;4mq2,9;4n5b,8;4n5n,j;4n68,9;4nlh,8;4nls,k;4nmd,a;4o1n,7;4o1y,v;4oi4,j;4oio,b;4oya,j;4oyu,b;4peg,j;4pf0,b;4pup,s;4qay,b;4qbb,b;4qqc,2;4qr4,a;4qrh,a;4r6h,3;4r7b,9;4r7n,a;4rmn,3;4rnh,9;4rnt,a;4s2t,2;4siy,3;4sz3,3;4tf9,2;4tvf,2;4ubl,2;4urr,2;4v7x,2;4vo3,2;4w49,2;4wkf,2"
};

export const EXPECTED_FINGER_PIXELS: Readonly<Record<string, number>> = {
  "a41.png": 2142,
  "a11.png": 1987,
  "a12.png": 2224,
  "a11m.png": 1319,
  "a12m.png": 2110,
  "a11-2.png": 433,
  "a11-2m.png": 378,
};
const W = 582, H = 652;
const cache = new Map<string, Uint8Array>();

/** 1 = preserve original source pixel on TOP of the album. */
export function getHeldRecordFingerMask(pose: string): Uint8Array | null {
  const data = ENCODED_FINGER_MASKS[pose];
  if (!data) return null;
  const cached = cache.get(pose);
  if (cached) return cached;
  const mask = new Uint8Array(W * H);
  for (const segment of data.split(";")) {
    const [encodedStart, encodedLength] = segment.split(",");
    const start = Number.parseInt(encodedStart, 36);
    const length = Number.parseInt(encodedLength, 36);
    if (!Number.isInteger(start) || !Number.isInteger(length) ||
        start < 0 || length <= 0 || start + length > mask.length) {
      throw new Error("Invalid held-record finger mask for " + pose);
    }
    mask.fill(1, start, start + length);
  }
  cache.set(pose, mask);
  return mask;
}
