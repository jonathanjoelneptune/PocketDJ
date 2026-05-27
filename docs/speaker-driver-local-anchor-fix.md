# Pocket DJ Speaker Driver Local Anchor Fix

<span style="color:#16a34a;">Added:</span> A `.speaker-driver-anchor` wrapper inside each speaker.

<span style="color:#16a34a;">Changed:</span> Speaker driver X/Y/size now position the anchor relative to the speaker's own local canvas, not the overall room.

<span style="color:#16a34a;">Changed:</span> The pulse scale animation now runs on the driver image inside the anchor, so the anchor point itself does not move while pulsing.

<span style="color:#16a34a;">Changed:</span> Speaker container aspect ratio is locked to the speaker asset canvas and the speaker image uses `object-fit: fill`, keeping the base speaker and driver overlay in the same coordinate system.

<span style="color:#dc2626;">Removed:</span> The older direct-positioned `.speaker-driver` overlay that could drift when the room or browser window changed size.
