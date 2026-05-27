# Pocket DJ Speaker Driver PNG Implementation Changelog

<span style="color:#16a34a;">Added:</span> Support for `public/assets/Speaker Driver.png` as the cropped speaker cone/driver asset.

<span style="color:#16a34a;">Changed:</span> Speaker animation now scales the cropped driver PNG only, instead of clipping or warping a duplicate of the full speaker image.

<span style="color:#16a34a;">Changed:</span> Speaker pulse X/Y/size controls now position and size the isolated driver asset.

<span style="color:#16a34a;">Changed:</span> Driver opacity tuner now controls the cropped driver PNG opacity.

<span style="color:#dc2626;">Removed:</span> The clipped full-speaker duplicate warp implementation.
