<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Spotify Currently Playing</title>

  <!-- NES pixel-style font -->
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet"/>

  <style>
    * { box-sizing: border-box; }

    :root {
      --head-offset-x: 0%;
      --head-offset-y: 0%;
    }

    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #000;
      color: #fff;
      font-family: system-ui, sans-serif;
      overflow: hidden;
    }

    .stage {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }

    /* Background room image */
    .bg {
      position: absolute;
      width: 100%;
      height: 100%;
      object-fit: cover;
      top: 0;
      left: 0;
      image-rendering: pixelated;
    }

    /* ===========================================================
       DJ + poses
       =========================================================== */

    .dj-container {
      position: absolute;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .dj {
      position: absolute;

      /* Locked pixel-perfect position */
      left: 47.8%;
      top: 63.2%;

      transform: translate(-50%, -50%);
      width: 28%;
      image-rendering: pixelated;
    }

    /* Base bodies */
    .dj-base {
      position: absolute;
      width: 100%;
      image-rendering: pixelated;
      opacity: 0;
      transition: opacity 0.15s linear;
    }

    /* Heads */
    .dj-head {
      position: absolute;
      width: 7.5%;
      image-rendering: pixelated;
      opacity: 0;
      transition: opacity 0.15s linear;
    }

    /* Pose visibility */
    .pose-active {
      opacity: 1 !important;
    }

    /* Position for each pose */
    .dj-base.pose1 { top: 0; left: 0; }
    .dj-base.pose2 { top: 0; left: 0; }
    .dj-base.pose3 { top: 0; left: 0; }

    /* Head positions for each pose (matching your last version) */
    .dj-head.pose1 {
      left: calc(42.4% + var(--head-offset-x));
      top: calc(52.1% + var(--head-offset-y));
    }

    .dj-head.pose2 {
      left: calc(41.3% + var(--head-offset-x));
      top: calc(51.2% + var(--head-offset-y));
    }

    .dj-head.pose3 {
      left: calc(42% + var(--head-offset-x));
      top: calc(50.8% + var(--head-offset-y));
    }

    /* ===========================================================
       MARQUEE (unchanged from last good version)
       =========================================================== */

    .marquee-box {
      position: absolute;
      left: 50%;
      top: 4%;
      transform: translateX(-50%);
      width: 50%;
      height: 80px;
      border: 4px solid #111;
      background: #000;
      overflow: hidden;
      image-rendering: pixelated;
    }

    .marquee-inner {
      position: absolute;
      white-space: nowrap;
      font-family: "Press Start 2P", monospace;
      font-size: 26px;
      top: 50%;
      transform: translateY(-50%);
      animation: scroll 18s linear infinite steps(1);
    }

    @keyframes scroll {
      0% { transform: translate(100%, -50%); }
      100% { transform: translate(-200%, -50%); }
    }

  </style>
</head>

<body>
  <div class="stage">
    <img class="bg" src="room-bg.png" />

    <!-- ===========================================================
         DJ container
         =========================================================== -->
    <div class="dj-container">
      <div class="dj">

        <!-- ===========================
             BASES (3 poses)
             =========================== -->
        <img class="dj-base pose1 pose-active" src="dj-base1.png" />
        <img class="dj-base pose2" src="dj-base2.png" />
        <img class="dj-base pose3" src="dj-base3.png" />

        <!-- ===========================
             HEADS (all use chill face)
             =========================== -->
        <img class="dj-head pose1 pose-active" src="dj-head.png" />
        <img class="dj-head pose2" src="dj-head2.png" />
        <img class="dj-head pose3" src="dj-head2.png" />

      </div>
    </div>

    <!-- ===========================================================
         MARQUEE
         =========================================================== -->
    <div class="marquee-box">
      <div id="marquee" class="marquee-inner">Loading...</div>
    </div>

  </div>

  <script>
    /* ===========================================================
       POLLING SPOTIFY + ANIMATION LOGIC
       =========================================================== */

    let currentPose = 1;
    const totalPoses = 3;

    function swapPose(newPose) {
      document.querySelectorAll(".dj-base, .dj-head").forEach(el => {
        el.classList.remove("pose-active");
      });

      document.querySelector(".dj-base.pose" + newPose).classList.add("pose-active");
      document.querySelector(".dj-head.pose" + newPose).classList.add("pose-active");
    }

    function cyclePose() {
      currentPose++;
      if (currentPose > totalPoses) currentPose = 1;
      swapPose(currentPose);
    }

    setInterval(cyclePose, 4500);

    /* ===========================================================
       MARQUEE UPDATE
       =========================================================== */

    async function fetchTrack() {
      try {
        const r = await fetch("/current-track");
        const data = await r.json();

        let title = data?.item?.name || "No track";
        let artist = data?.item?.artists?.[0]?.name || "";

        document.getElementById("marquee").textContent = `${title} — ${artist}`;

      } catch (err) {
        console.error(err);
      }
    }

    setInterval(fetchTrack, 2000);
    fetchTrack();
  </script>

</body>
</html>
