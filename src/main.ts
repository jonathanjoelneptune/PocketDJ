import "./styles.css";
import { WALL_ALBUM_MASTER_LIST, type WallAlbumMasterItem } from "./data/wallAlbumMasterList";
import { DjController } from "./dj/djController";
import { getDemoTrack, stopDemo, toggleDemo } from "./demo";
import { emptyTrack, type AppState } from "./state/types";
import { addSpotifyUriToQueue, disconnectSpotify, getArtistTopTracks, getCurrentlyPlaying, getDefaultRedirectUri, getPlaylistTracks, getExternalTrackTempoBpm, getTrackTempoBpm, getRecentlyPlayed, getSavedTracks, getSpotifyAccessToken, getSpotifyQueue, getSpotifyDevices, getUserPlaylists, handleSpotifyCallback, nextSpotifyTrack, pauseSpotify, playSpotify, playSpotifyContext, playSpotifyContextShuffled, playSpotifyUri, previousSpotifyTrack, searchSpotifyCatalog, seekSpotify, setSpotifyRepeat, setSpotifyShuffle, setSpotifyVolume, startSpotifyLogin, transferSpotifyPlayback, type SpotifyCatalogAlbum, type SpotifyCatalogArtist, type SpotifyCatalogPlaylist, type SpotifyCatalogTrack, type SpotifyDevice } from "./spotify/spotifyClient";
import { loadClientId, loadTokens, saveClientId } from "./spotify/tokenStore";
import {
  emptyLyrics,
  fetchLyricsForTrack,
  getActiveLyricIndex,
  getLyricsTrackKey,
  type LyricsPayload,
} from "./lyrics/lyricsClient";
import { qs } from "./utils/dom";
import { renderShell, setControlPanelOpen, updateLyricsCeiling, updateLyricsToggleUi, updatePlaybackUi } from "./ui";

const STANDARD_SPOTIFY_CLIENT_ID = "37da51db24384ad3a07c222f71b1525e";
const SPOTIFY_WEB_PLAYBACK_SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const POCKET_DJ_DEVICE_NAME = "PocketDJ";
const PREFERRED_SPOTIFY_SOURCE_KEY = "pocketdj-preferred-spotify-source-v1";
const FLOOR_CONTROLS_LOCK_KEY = "pocketdj-floor-controls-locked-v1";
const GETSONGBPM_BROWSER_API_KEY = "adb657bcac29228727d5af3455947f33";

type SpotifyWebPlaybackPlayer = {
  addListener: (event: string, callback: (payload: any) => void) => boolean;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  activateElement?: () => Promise<void>;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyWebPlaybackPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let webPlaybackSdkPromise: Promise<void> | null = null;
let pocketDjPlayer: SpotifyWebPlaybackPlayer | null = null;
let pocketDjDeviceId: string | null = null;
let pocketDjDeviceReady = false;
let pocketDjDeviceActive = false;
let lastSpotifyDevices: SpotifyDevice[] = [];
let preferredSpotifySource = localStorage.getItem(PREFERRED_SPOTIFY_SOURCE_KEY) || "";
let lastDeviceRefreshAt = 0;


const state: AppState = {
  spotifyClientId: loadClientId() || STANDARD_SPOTIFY_CLIENT_ID,
  redirectUri: getDefaultRedirectUri(),
  playback: emptyTrack(),
  djMode: "idle",
  debugOpen: false
};

let useDemo = false;
let pollTimer: number | null = null;
let dj: DjController;
let lastPollError = "";
let panelAutoHiddenAfterConnect = false;
let compactPanelEnabled = false;
let devToolsClickTimer: number | null = null;
let devToolsClickCount = 0;
let devToolsLockClickCount = 0;
let devToolsLockClickTimer: number | null = null;
let aspectPocketClickCount = 0;
let aspectPocketClickTimer: number | null = null;
let menu2Open = false;
let menu2Locked = true;
let menu2HasOpened = localStorage.getItem("pocketdj-menu2-has-opened") === "true";
let menu2ActiveTab: "now" | "queue" | "playlists" | "search" | "devices" | "dev" = "now";
let menu2DevUnlocked = false;
let menu2LockClickCount = 0;
let menu2LockClickTimer: number | null = null;
let menu2BubbleHoverTimer: number | null = null;
let menu2StyleMode: "pocket" | "spotify" | "web" = (localStorage.getItem("pocketdj-menu2-style") as "pocket" | "spotify" | "web") || "pocket";
let menu2ArtSize: "large" | "medium" | "small" = (localStorage.getItem("pocketdj-menu2-art-size") as "large" | "medium" | "small") || "large";
let menu2PanelMode: "full" | "compact" = (localStorage.getItem("pocketdj-menu2-panel-mode") as "full" | "compact") || "full";
let menu2SearchResultTab: "tracks" | "artists" | "playlists" | "albums" = "tracks";
let menu2SearchTracks: SpotifyCatalogTrack[] = [];
let menu2SearchArtists: SpotifyCatalogArtist[] = [];
let menu2SearchPlaylists: SpotifyCatalogPlaylist[] = [];
let menu2SearchAlbums: SpotifyCatalogAlbum[] = [];
let menu2SelectedPlaylist: SpotifyCatalogPlaylist | null = null;
let menu2SelectedPlaylistTracks: SpotifyCatalogTrack[] = [];
let menu2QueueTracks: SpotifyCatalogTrack[] = [];
let menu2PlaylistCache: SpotifyCatalogPlaylist[] = [];
let sidePanelLocked = false;
let sidePanelHideTimer: number | null = null;
let floorControlsOpen = false;
let floorControlsLocked = window.localStorage.getItem(FLOOR_CONTROLS_LOCK_KEY) === "1";
let floorControlsHideTimer: number | null = null;
let phase2ShuffleEnabled = false;
let phase2RepeatMode: "off" | "context" | "track" = "off";
let phase2Volume = 70;
let lyricsState: LyricsPayload = emptyLyrics();
let lyricsFetchKey = "";
let lyricsEnabled = true;
let lyricAnimationRevision = 0;


type SpotifyBrowserTab = "home" | "playlists" | "vibes" | "search";
type SpotifyBrowserSort = "recent" | "alpha" | "artist" | "album";
type SpotifySearchResultTab = "tracks" | "artists" | "playlists" | "albums";

type VibePreset = {
  label: string;
  query: string;
};

const SPOTIFY_PINNED_PLAYLISTS_KEY = "pocketdj-pinned-playlists-v1";
const SPOTIFY_PLAYLIST_RECENCY_KEY = "pocketdj-playlist-recency-v1";
const SEARCH_PAGE_SIZE = 10;

const VIBE_PRESETS: VibePreset[] = [
  { label: "Late Night", query: 'genre:"r-n-b" OR genre:"chill"' },
  { label: "House Party", query: 'genre:"dance" OR genre:"house"' },
  { label: "Hip-Hop", query: 'genre:"hip-hop"' },
  { label: "Pop", query: 'genre:"pop"' },
  { label: "Throwbacks", query: 'year:1990-2012' },
  { label: "Indie", query: 'genre:"indie"' },
  { label: "Rock", query: 'genre:"rock"' },
  { label: "Focus", query: 'genre:"ambient" OR genre:"study"' },
  { label: "Workout", query: 'genre:"work-out" OR genre:"edm"' },
  { label: "Smooth", query: 'genre:"soul" OR genre:"jazz"' }
];

let spotifyBrowserTab: SpotifyBrowserTab = "home";
let spotifyBrowserBusy = false;
let spotifyBrowserStatus = "";
let spotifyBrowserTracks: SpotifyCatalogTrack[] = [];
let spotifyBrowserArtists: SpotifyCatalogArtist[] = [];
let spotifyBrowserAlbums: SpotifyCatalogAlbum[] = [];
let spotifySearchPlaylists: SpotifyCatalogPlaylist[] = [];
let spotifySearchResultTab: SpotifySearchResultTab = "tracks";
let spotifySearchQuery = "";
let spotifySearchType: "track" | "artist" | "playlist" | "album" | "all" = "all";
let spotifySearchOffset = 0;
let spotifyBrowserPlaylists: SpotifyCatalogPlaylist[] = [];
let currentPlaylistTracks: SpotifyCatalogTrack[] = [];
let currentHomeTracks: SpotifyCatalogTrack[] = [];
let currentLibraryTracks: SpotifyCatalogTrack[] = [];
let recentTrackIds: string[] = [];
let pinnedPlaylistIds = loadSpotifyPinnedPlaylists();
let playlistRecency = loadSpotifyPlaylistRecency();
let selectedPlaylist: SpotifyCatalogPlaylist | null = null;
let albumRevealPreloadTrackId: string | null = null;
let albumRevealPreloadUrl = "";
let albumRevealLoadedUrl = "";
let albumRevealPreloadStartedAt = 0;
let albumRevealPreloadImage: HTMLImageElement | null = null;
let placedAlbumCommittedTrackKey = "";
let placedAlbumCommittedUrl = "";
let placedAlbumPendingTrackKey = "";
let placedAlbumPendingUrl = "";
let placedAlbumPendingRequiresReveal = false;
let placedAlbumPendingRevealSeen = false;
let vinylClockTimer: number | null = null;
let speakerTempoTrackKey = "";
let speakerTempoFetchKey = "";
let speakerTempoBpm: number | null = null;
let speakerTempoSource: "getsongbpm" | "spotify" | "demo" | "estimate" | "fallback" | "lookup" | "nomatch" = "fallback";
const speakerTempoCache = new Map<string, number>();
const externalSpeakerTempoCache = new Map<string, number>();
const externalSpeakerTempoMisses = new Set<string>();
const ALBUM_REVEAL_MAX_WAIT_MS = 500;
const SPEAKER_PULSE_FALLBACK_BPM = 96;

type RgbTriple = [number, number, number];
type ReactiveRoomPalette = {
  core: RgbTriple;
  tint: RgbTriple;
  ambient: RgbTriple;
  roomGlow: RgbTriple;
  roomAccent: RgbTriple;
};

const DEFAULT_REACTIVE_ROOM_PALETTE: ReactiveRoomPalette = {
  core: [255, 221, 156],
  tint: [255, 179, 84],
  ambient: [244, 165, 92],
  roomGlow: [126, 82, 140],
  roomAccent: [255, 186, 108],
};

const reactiveRoomPaletteCache = new Map<string, ReactiveRoomPalette>();
let reactiveRoomPaletteUrl = "";
let reactiveRoomPalettePendingUrl = "";
let stringLightResizeTimer: number | null = null;
let ambientTwinkleResizeTimer: number | null = null;

type SceneFilter =
  | "none"
  | "warm-club"
  | "dreamy-blue"
  | "deep-night"
  | "retro-vhs"
  | "neon-purple"
  | "cinematic-amber"
  | "moody-lowlight";


type RoomUtilitySettings = {
  speakerLeftX: number;
  speakerRightX: number;
  speakerY: number;
  speakerScale: number;
  speakerOpacity: number;
  speakerPulse: number;
  speakerPulseX: number;
  speakerPulseY: number;
  speakerPulseSize: number;
  speakerWarpOpacity: number;
  mixerTempoLedX: number;
  mixerTempoLedY: number;
  mixerTempoLedSize: number;
  mixerLyricsLedX: number;
  mixerLyricsLedY: number;
  mixerLyricsLedSize: number;
  speakerPulseUseTempo: boolean;
  speakerPulseUseExternalTempo: boolean;
  sceneFilter: SceneFilter;
  filterStrength: number;
  vignetteStrength: number;
  shadowOpacity: number;
  tableShadowScale: number;
  floorControlsIdleOpacity: number;
  songChangeMode: boolean;
  songChangeAlbumX: number;
  songChangeAlbumY: number;
  songChangeAlbumSize: number;
  placedAlbumEnabled: boolean;
  placedAlbumX: number;
  placedAlbumY: number;
  placedAlbumSize: number;
  placedAlbumRotateX: number;
  placedAlbumRotateY: number;
  placedAlbumRotateZ: number;
  placedAlbumDepth: number;
  placedAlbumShadow: number;
  placedAlbumOpacity: number;
  panelStartY: number;
  panelHeightAdjustEnabled: boolean;
  roomFillStretchMode: boolean;
  utilityPanelLeftSide: boolean;
  vinylClockEnabled: boolean;
  vinylClockX: number;
  vinylClockY: number;
  vinylClockSize: number;
  vinylClockScale: number;
  vinylClockTilt: number;
  vinylClockOpacity: number;
  vinylClockGlow: number;
  vinylClockShadowX: number;
  vinylClockShadowY: number;
  vinylClockShadowBlur: number;
  vinylClockShadowOpacity: number;
  vinylClockRoomBlend: number;
  vinylClockWallFade: number;
  lyricPosterTopLeftX: number;
  lyricPosterTopLeftY: number;
  lyricPosterTopRightX: number;
  lyricPosterTopRightY: number;
  lyricPosterBottomLeftX: number;
  lyricPosterBottomLeftY: number;
  lyricPosterBottomRightX: number;
  lyricPosterBottomRightY: number;
  lyricPosterGuideOpacity: number;
  lyricPosterCenterGuideOpacity: number;
  lyricPosterShortGuideOpacity: number;
  lyricPosterTallGuideEnabled: boolean;
  lyricPosterTallGuideOpacity: number;
  lyricPosterTallClampTopLeftX: number;
  lyricPosterTallClampTopLeftY: number;
  lyricPosterTallClampTopRightX: number;
  lyricPosterTallClampTopRightY: number;
  lyricPosterShortTopLeftX: number;
  lyricPosterShortTopLeftY: number;
  lyricPosterShortTopRightX: number;
  lyricPosterShortTopRightY: number;
  lyricPosterShortBottomLeftX: number;
  lyricPosterShortBottomLeftY: number;
  lyricPosterShortBottomRightX: number;
  lyricPosterShortBottomRightY: number;
  lyricPosterShortVerticalStretch: number;
  lyricPosterShortPerspective: number;
  lyricPosterShortTilt: number;
  lyricPosterShortTextTopLeftX: number;
  lyricPosterShortTextTopLeftY: number;
  lyricPosterShortTextTopRightX: number;
  lyricPosterShortTextTopRightY: number;
  lyricPosterShortTextBottomLeftX: number;
  lyricPosterShortTextBottomLeftY: number;
  lyricPosterShortTextBottomRightX: number;
  lyricPosterShortTextBottomRightY: number;
  lyricPosterTwoRowBandGuideOpacity: number;
  lyricPosterThreeRowBandGuideOpacity: number;
  lyricPosterStroke: number;
  lyricPosterStrokeColor: string;
  lyricPosterFillColor: string;
  lyricPosterStrokeOpacity: number;
  lyricPosterFillOpacity: number;
  lyricPosterGlow: number;
  lyricPosterEffectDropShadow: boolean;
  lyricPosterEffectEmboss: boolean;
  lyricPosterEffectInsetEmboss: boolean;
  lyricPosterEffectBevel: boolean;
  lyricPosterEffectSoftBlur: boolean;
  lyricPosterOneRowVerticalStretch: number;
  lyricPosterOneRowTightness: number;
  lyricPosterOneRowPerspective: number;
  lyricPosterOneRowTilt: number;
  lyricPosterOneRowTextTopLeftX: number;
  lyricPosterOneRowTextTopLeftY: number;
  lyricPosterOneRowTextTopRightX: number;
  lyricPosterOneRowTextTopRightY: number;
  lyricPosterOneRowTextBottomLeftX: number;
  lyricPosterOneRowTextBottomLeftY: number;
  lyricPosterOneRowTextBottomRightX: number;
  lyricPosterOneRowTextBottomRightY: number;
  lyricPosterTwoRowVerticalStretch: number;
  lyricPosterTwoRowTopBandTopY: number;
  lyricPosterTwoRowTopBandBottomY: number;
  lyricPosterTwoRowBottomBandTopY: number;
  lyricPosterTwoRowBottomBandBottomY: number;
  lyricPosterTwoRowTopY: number;
  lyricPosterTwoRowBottomY: number;
  lyricPosterTwoRowTightness: number;
  lyricPosterTwoRowPerspective: number;
  lyricPosterTwoRowTilt: number;
  lyricPosterThreeRowVerticalStretch: number;
  lyricPosterThreeRowTopBandTopY: number;
  lyricPosterThreeRowTopBandBottomY: number;
  lyricPosterThreeRowMiddleBandTopY: number;
  lyricPosterThreeRowMiddleBandBottomY: number;
  lyricPosterThreeRowBottomBandTopY: number;
  lyricPosterThreeRowBottomBandBottomY: number;
  lyricPosterThreeRowTopY: number;
  lyricPosterThreeRowMiddleY: number;
  lyricPosterThreeRowBottomY: number;
  lyricPosterThreeRowTightness: number;
  lyricPosterThreeRowPerspective: number;
  lyricPosterThreeRowTilt: number;
  lyricPosterTwoRowTopTextTopLeftX: number;
  lyricPosterTwoRowTopTextTopLeftY: number;
  lyricPosterTwoRowTopTextTopRightX: number;
  lyricPosterTwoRowTopTextTopRightY: number;
  lyricPosterTwoRowTopTextBottomLeftX: number;
  lyricPosterTwoRowTopTextBottomLeftY: number;
  lyricPosterTwoRowTopTextBottomRightX: number;
  lyricPosterTwoRowTopTextBottomRightY: number;
  lyricPosterTwoRowBottomTextTopLeftX: number;
  lyricPosterTwoRowBottomTextTopLeftY: number;
  lyricPosterTwoRowBottomTextTopRightX: number;
  lyricPosterTwoRowBottomTextTopRightY: number;
  lyricPosterTwoRowBottomTextBottomLeftX: number;
  lyricPosterTwoRowBottomTextBottomLeftY: number;
  lyricPosterTwoRowBottomTextBottomRightX: number;
  lyricPosterTwoRowBottomTextBottomRightY: number;
  lyricPosterThreeRowTopTextTopLeftX: number;
  lyricPosterThreeRowTopTextTopLeftY: number;
  lyricPosterThreeRowTopTextTopRightX: number;
  lyricPosterThreeRowTopTextTopRightY: number;
  lyricPosterThreeRowTopTextBottomLeftX: number;
  lyricPosterThreeRowTopTextBottomLeftY: number;
  lyricPosterThreeRowTopTextBottomRightX: number;
  lyricPosterThreeRowTopTextBottomRightY: number;
  lyricPosterThreeRowMiddleTextTopLeftX: number;
  lyricPosterThreeRowMiddleTextTopLeftY: number;
  lyricPosterThreeRowMiddleTextTopRightX: number;
  lyricPosterThreeRowMiddleTextTopRightY: number;
  lyricPosterThreeRowMiddleTextBottomLeftX: number;
  lyricPosterThreeRowMiddleTextBottomLeftY: number;
  lyricPosterThreeRowMiddleTextBottomRightX: number;
  lyricPosterThreeRowMiddleTextBottomRightY: number;
  lyricPosterThreeRowBottomTextTopLeftX: number;
  lyricPosterThreeRowBottomTextTopLeftY: number;
  lyricPosterThreeRowBottomTextTopRightX: number;
  lyricPosterThreeRowBottomTextTopRightY: number;
  lyricPosterThreeRowBottomTextBottomLeftX: number;
  lyricPosterThreeRowBottomTextBottomLeftY: number;
  lyricPosterThreeRowBottomTextBottomRightX: number;
  lyricPosterThreeRowBottomTextBottomRightY: number;
  lyricPosterTallTopLeftX: number;
  lyricPosterTallTopLeftY: number;
  lyricPosterTallTopRightX: number;
  lyricPosterTallTopRightY: number;
  lyricPosterTallBottomLeftX: number;
  lyricPosterTallBottomLeftY: number;
  lyricPosterTallBottomRightX: number;
  lyricPosterTallBottomRightY: number;
  lyricPosterTallShortTopLeftX: number;
  lyricPosterTallShortTopLeftY: number;
  lyricPosterTallShortTopRightX: number;
  lyricPosterTallShortTopRightY: number;
  lyricPosterTallShortBottomLeftX: number;
  lyricPosterTallShortBottomLeftY: number;
  lyricPosterTallShortBottomRightX: number;
  lyricPosterTallShortBottomRightY: number;
  lyricPosterTallOneRowTextTopLeftX: number;
  lyricPosterTallOneRowTextTopLeftY: number;
  lyricPosterTallOneRowTextTopRightX: number;
  lyricPosterTallOneRowTextTopRightY: number;
  lyricPosterTallOneRowTextBottomLeftX: number;
  lyricPosterTallOneRowTextBottomLeftY: number;
  lyricPosterTallOneRowTextBottomRightX: number;
  lyricPosterTallOneRowTextBottomRightY: number;
  lyricPosterTallTwoRowTopBandTopY: number;
  lyricPosterTallTwoRowTopBandBottomY: number;
  lyricPosterTallTwoRowBottomBandTopY: number;
  lyricPosterTallTwoRowBottomBandBottomY: number;
  lyricPosterTallTwoRowTopTextTopLeftX: number;
  lyricPosterTallTwoRowTopTextTopLeftY: number;
  lyricPosterTallTwoRowTopTextTopRightX: number;
  lyricPosterTallTwoRowTopTextTopRightY: number;
  lyricPosterTallTwoRowTopTextBottomLeftX: number;
  lyricPosterTallTwoRowTopTextBottomLeftY: number;
  lyricPosterTallTwoRowTopTextBottomRightX: number;
  lyricPosterTallTwoRowTopTextBottomRightY: number;
  lyricPosterTallTwoRowBottomTextTopLeftX: number;
  lyricPosterTallTwoRowBottomTextTopLeftY: number;
  lyricPosterTallTwoRowBottomTextTopRightX: number;
  lyricPosterTallTwoRowBottomTextTopRightY: number;
  lyricPosterTallTwoRowBottomTextBottomLeftX: number;
  lyricPosterTallTwoRowBottomTextBottomLeftY: number;
  lyricPosterTallTwoRowBottomTextBottomRightX: number;
  lyricPosterTallTwoRowBottomTextBottomRightY: number;
  lyricPosterTallDirectOneRowTLX: number;
  lyricPosterTallDirectOneRowTLY: number;
  lyricPosterTallDirectOneRowTRX: number;
  lyricPosterTallDirectOneRowTRY: number;
  lyricPosterTallDirectOneRowBRX: number;
  lyricPosterTallDirectOneRowBRY: number;
  lyricPosterTallDirectOneRowBLX: number;
  lyricPosterTallDirectOneRowBLY: number;
  lyricPosterTallDirectTwoTopTLX: number;
  lyricPosterTallDirectTwoTopTLY: number;
  lyricPosterTallDirectTwoTopTRX: number;
  lyricPosterTallDirectTwoTopTRY: number;
  lyricPosterTallDirectTwoTopBRX: number;
  lyricPosterTallDirectTwoTopBRY: number;
  lyricPosterTallDirectTwoTopBLX: number;
  lyricPosterTallDirectTwoTopBLY: number;
  lyricPosterTallDirectTwoBottomTLX: number;
  lyricPosterTallDirectTwoBottomTLY: number;
  lyricPosterTallDirectTwoBottomTRX: number;
  lyricPosterTallDirectTwoBottomTRY: number;
  lyricPosterTallDirectTwoBottomBRX: number;
  lyricPosterTallDirectTwoBottomBRY: number;
  lyricPosterTallDirectTwoBottomBLX: number;
  lyricPosterTallDirectTwoBottomBLY: number;
  lyricPosterTallBaseShortTLX: number;
  lyricPosterTallBaseShortTLY: number;
  lyricPosterTallBaseShortTRX: number;
  lyricPosterTallBaseShortTRY: number;
  lyricPosterTallBaseShortBRX: number;
  lyricPosterTallBaseShortBRY: number;
  lyricPosterTallBaseShortBLX: number;
  lyricPosterTallBaseShortBLY: number;
  lyricPosterTallBaseOneRowTLX: number;
  lyricPosterTallBaseOneRowTLY: number;
  lyricPosterTallBaseOneRowTRX: number;
  lyricPosterTallBaseOneRowTRY: number;
  lyricPosterTallBaseOneRowBRX: number;
  lyricPosterTallBaseOneRowBRY: number;
  lyricPosterTallBaseOneRowBLX: number;
  lyricPosterTallBaseOneRowBLY: number;
  lyricPosterTallBaseTwoTopTLX: number;
  lyricPosterTallBaseTwoTopTLY: number;
  lyricPosterTallBaseTwoTopTRX: number;
  lyricPosterTallBaseTwoTopTRY: number;
  lyricPosterTallBaseTwoTopBRX: number;
  lyricPosterTallBaseTwoTopBRY: number;
  lyricPosterTallBaseTwoTopBLX: number;
  lyricPosterTallBaseTwoTopBLY: number;
  lyricPosterTallBaseTwoBottomTLX: number;
  lyricPosterTallBaseTwoBottomTLY: number;
  lyricPosterTallBaseTwoBottomTRX: number;
  lyricPosterTallBaseTwoBottomTRY: number;
  lyricPosterTallBaseTwoBottomBRX: number;
  lyricPosterTallBaseTwoBottomBRY: number;
  lyricPosterTallBaseTwoBottomBLX: number;
  lyricPosterTallBaseTwoBottomBLY: number;
  lyricPosterTallMidShortTLX: number;
  lyricPosterTallMidShortTLY: number;
  lyricPosterTallMidShortTRX: number;
  lyricPosterTallMidShortTRY: number;
  lyricPosterTallMidShortBRX: number;
  lyricPosterTallMidShortBRY: number;
  lyricPosterTallMidShortBLX: number;
  lyricPosterTallMidShortBLY: number;
  lyricPosterTallMidOneRowTLX: number;
  lyricPosterTallMidOneRowTLY: number;
  lyricPosterTallMidOneRowTRX: number;
  lyricPosterTallMidOneRowTRY: number;
  lyricPosterTallMidOneRowBRX: number;
  lyricPosterTallMidOneRowBRY: number;
  lyricPosterTallMidOneRowBLX: number;
  lyricPosterTallMidOneRowBLY: number;
  lyricPosterTallMidTwoTopTLX: number;
  lyricPosterTallMidTwoTopTLY: number;
  lyricPosterTallMidTwoTopTRX: number;
  lyricPosterTallMidTwoTopTRY: number;
  lyricPosterTallMidTwoTopBRX: number;
  lyricPosterTallMidTwoTopBRY: number;
  lyricPosterTallMidTwoTopBLX: number;
  lyricPosterTallMidTwoTopBLY: number;
  lyricPosterTallMidTwoBottomTLX: number;
  lyricPosterTallMidTwoBottomTLY: number;
  lyricPosterTallMidTwoBottomTRX: number;
  lyricPosterTallMidTwoBottomTRY: number;
  lyricPosterTallMidTwoBottomBRX: number;
  lyricPosterTallMidTwoBottomBRY: number;
  lyricPosterTallMidTwoBottomBLX: number;
  lyricPosterTallMidTwoBottomBLY: number;
  lyricPosterTallFinalShortTLX: number;
  lyricPosterTallFinalShortTLY: number;
  lyricPosterTallFinalShortTRX: number;
  lyricPosterTallFinalShortTRY: number;
  lyricPosterTallFinalShortBRX: number;
  lyricPosterTallFinalShortBRY: number;
  lyricPosterTallFinalShortBLX: number;
  lyricPosterTallFinalShortBLY: number;
  lyricPosterTallFinalOneRowTLX: number;
  lyricPosterTallFinalOneRowTLY: number;
  lyricPosterTallFinalOneRowTRX: number;
  lyricPosterTallFinalOneRowTRY: number;
  lyricPosterTallFinalOneRowBRX: number;
  lyricPosterTallFinalOneRowBRY: number;
  lyricPosterTallFinalOneRowBLX: number;
  lyricPosterTallFinalOneRowBLY: number;
  lyricPosterTallFinalTwoTopTLX: number;
  lyricPosterTallFinalTwoTopTLY: number;
  lyricPosterTallFinalTwoTopTRX: number;
  lyricPosterTallFinalTwoTopTRY: number;
  lyricPosterTallFinalTwoTopBRX: number;
  lyricPosterTallFinalTwoTopBRY: number;
  lyricPosterTallFinalTwoTopBLX: number;
  lyricPosterTallFinalTwoTopBLY: number;
  lyricPosterTallFinalTwoBottomTLX: number;
  lyricPosterTallFinalTwoBottomTLY: number;
  lyricPosterTallFinalTwoBottomTRX: number;
  lyricPosterTallFinalTwoBottomTRY: number;
  lyricPosterTallFinalTwoBottomBRX: number;
  lyricPosterTallFinalTwoBottomBRY: number;
  lyricPosterTallFinalTwoBottomBLX: number;
  lyricPosterTallFinalTwoBottomBLY: number;
  lyricPosterMaxRows: "auto" | "1" | "2" | "3";
  lyricPosterRowBreakpoint: number;
  lyricPosterTransition: "none" | "push-slide" | "fade-slide" | "shadow-slide" | "ceiling-stamp" | "soft-dissolve" | "ghost-drift" | "back-push";
};

const DEFAULT_ROOM_UTILITY: RoomUtilitySettings = {
  speakerLeftX: 33,
  speakerRightX: 68,
  speakerY: 71,
  speakerScale: 1.47,
  speakerOpacity: 1.00,
  speakerPulse: 1,
  speakerPulseX: 51,
  speakerPulseY: 49,
  speakerPulseSize: 55,
  speakerWarpOpacity: 1.00,
  mixerTempoLedX: 45,
  mixerTempoLedY: 63,
  mixerTempoLedSize: 2,
  mixerLyricsLedX: 57,
  mixerLyricsLedY: 63,
  mixerLyricsLedSize: 2,
  speakerPulseUseTempo: true,
  speakerPulseUseExternalTempo: true,
  sceneFilter: "neon-purple",
  filterStrength: 0.20,
  vignetteStrength: 0.20,
  shadowOpacity: 1.00,
  tableShadowScale: 1.16,
  floorControlsIdleOpacity: 0.15,
  songChangeMode: false,
  songChangeAlbumX: 49,
  songChangeAlbumY: 45,
  songChangeAlbumSize: 12,
  placedAlbumEnabled: true,
  placedAlbumX: 44,
  placedAlbumY: 60,
  placedAlbumSize: 4,
  placedAlbumRotateX: 33,
  placedAlbumRotateY: 0,
  placedAlbumRotateZ: 0,
  placedAlbumDepth: 0,
  placedAlbumShadow: 1,
  placedAlbumOpacity: 1,
  panelStartY: 39,
  panelHeightAdjustEnabled: false,
  roomFillStretchMode: false,
  utilityPanelLeftSide: false,
  vinylClockEnabled: false,
  vinylClockX: 544,
  vinylClockY: 382,
  vinylClockSize: 86,
  vinylClockScale: 1,
  vinylClockTilt: -1,
  vinylClockOpacity: 1,
  vinylClockGlow: 0.10,
  vinylClockShadowX: -18,
  vinylClockShadowY: 22,
  vinylClockShadowBlur: 18,
  vinylClockShadowOpacity: 0.34,
  vinylClockRoomBlend: 0.42,
  vinylClockWallFade: 0.18,
  lyricPosterTopLeftX: 221,
  lyricPosterTopLeftY: 18,
  lyricPosterTopRightX: 1562,
  lyricPosterTopRightY: 3,
  lyricPosterBottomLeftX: 454,
  lyricPosterBottomLeftY: 195,
  lyricPosterBottomRightX: 1343,
  lyricPosterBottomRightY: 189,
  lyricPosterGuideOpacity: 0.00,
  lyricPosterCenterGuideOpacity: 0.00,
  lyricPosterShortGuideOpacity: 0.00,
  lyricPosterTallGuideEnabled: false,
  lyricPosterTallGuideOpacity: 0.60,
  lyricPosterTallClampTopLeftX: 12,
  lyricPosterTallClampTopLeftY: -139,
  lyricPosterTallClampTopRightX: 1764,
  lyricPosterTallClampTopRightY: -133,
  lyricPosterShortTopLeftX: 221,
  lyricPosterShortTopLeftY: 18,
  lyricPosterShortTopRightX: 1460,
  lyricPosterShortTopRightY: 3,
  lyricPosterShortBottomLeftX: 454,
  lyricPosterShortBottomLeftY: 195,
  lyricPosterShortBottomRightX: 1343,
  lyricPosterShortBottomRightY: 189,
  lyricPosterShortVerticalStretch: 0.78,
  lyricPosterShortPerspective: 1.20,
  lyricPosterShortTilt: -26,
  lyricPosterShortTextTopLeftX: -160,
  lyricPosterShortTextTopLeftY: 0,
  lyricPosterShortTextTopRightX: 160,
  lyricPosterShortTextTopRightY: 0,
  lyricPosterShortTextBottomLeftX: 0,
  lyricPosterShortTextBottomLeftY: 0,
  lyricPosterShortTextBottomRightX: 0,
  lyricPosterShortTextBottomRightY: 0,
  lyricPosterTwoRowBandGuideOpacity: 0.00,
  lyricPosterThreeRowBandGuideOpacity: 0.00,
  lyricPosterStroke: 7.6,
  lyricPosterStrokeColor: "#000000",
  lyricPosterFillColor: "#000000",
  lyricPosterStrokeOpacity: 0.30,
  lyricPosterFillOpacity: 0.70,
  lyricPosterGlow: 0,
  lyricPosterEffectDropShadow: false,
  lyricPosterEffectEmboss: false,
  lyricPosterEffectInsetEmboss: false,
  lyricPosterEffectBevel: false,
  lyricPosterEffectSoftBlur: false,
  lyricPosterOneRowVerticalStretch: 0.86,
  lyricPosterOneRowTightness: 0.00,
  lyricPosterOneRowPerspective: 1.33,
  lyricPosterOneRowTilt: -32,
  lyricPosterOneRowTextTopLeftX: -242,
  lyricPosterOneRowTextTopLeftY: 0,
  lyricPosterOneRowTextTopRightX: 242,
  lyricPosterOneRowTextTopRightY: 0,
  lyricPosterOneRowTextBottomLeftX: 6,
  lyricPosterOneRowTextBottomLeftY: -1,
  lyricPosterOneRowTextBottomRightX: 0,
  lyricPosterOneRowTextBottomRightY: 0,
  lyricPosterTwoRowVerticalStretch: 1.06,
  lyricPosterTwoRowTopBandTopY: 18,
  lyricPosterTwoRowTopBandBottomY: 106,
  lyricPosterTwoRowBottomBandTopY: 106,
  lyricPosterTwoRowBottomBandBottomY: 195,
  lyricPosterTwoRowTopY: 0,
  lyricPosterTwoRowBottomY: 0,
  lyricPosterTwoRowTightness: 0.19,
  lyricPosterTwoRowPerspective: 1.00,
  lyricPosterTwoRowTilt: -10,
  lyricPosterThreeRowVerticalStretch: 0.51,
  lyricPosterThreeRowTopBandTopY: 18,
  lyricPosterThreeRowTopBandBottomY: 76,
  lyricPosterThreeRowMiddleBandTopY: 76,
  lyricPosterThreeRowMiddleBandBottomY: 136,
  lyricPosterThreeRowBottomBandTopY: 136,
  lyricPosterThreeRowBottomBandBottomY: 195,
  lyricPosterThreeRowTopY: 0,
  lyricPosterThreeRowMiddleY: 0,
  lyricPosterThreeRowBottomY: 0,
  lyricPosterThreeRowTightness: 0.52,
  lyricPosterThreeRowPerspective: 1.00,
  lyricPosterThreeRowTilt: -12,
  lyricPosterTwoRowTopTextTopLeftX: -148,
  lyricPosterTwoRowTopTextTopLeftY: 0,
  lyricPosterTwoRowTopTextTopRightX: 147,
  lyricPosterTwoRowTopTextTopRightY: 0,
  lyricPosterTwoRowTopTextBottomLeftX: 0,
  lyricPosterTwoRowTopTextBottomLeftY: 0,
  lyricPosterTwoRowTopTextBottomRightX: 0,
  lyricPosterTwoRowTopTextBottomRightY: 0,
  lyricPosterTwoRowBottomTextTopLeftX: -148,
  lyricPosterTwoRowBottomTextTopLeftY: 0,
  lyricPosterTwoRowBottomTextTopRightX: 143,
  lyricPosterTwoRowBottomTextTopRightY: 0,
  lyricPosterTwoRowBottomTextBottomLeftX: 0,
  lyricPosterTwoRowBottomTextBottomLeftY: 0,
  lyricPosterTwoRowBottomTextBottomRightX: 0,
  lyricPosterTwoRowBottomTextBottomRightY: 0,
  lyricPosterThreeRowTopTextTopLeftX: -278,
  lyricPosterThreeRowTopTextTopLeftY: 0,
  lyricPosterThreeRowTopTextTopRightX: 278,
  lyricPosterThreeRowTopTextTopRightY: 0,
  lyricPosterThreeRowTopTextBottomLeftX: 0,
  lyricPosterThreeRowTopTextBottomLeftY: 0,
  lyricPosterThreeRowTopTextBottomRightX: 0,
  lyricPosterThreeRowTopTextBottomRightY: 0,
  lyricPosterThreeRowMiddleTextTopLeftX: -183,
  lyricPosterThreeRowMiddleTextTopLeftY: 0,
  lyricPosterThreeRowMiddleTextTopRightX: 183,
  lyricPosterThreeRowMiddleTextTopRightY: 0,
  lyricPosterThreeRowMiddleTextBottomLeftX: 0,
  lyricPosterThreeRowMiddleTextBottomLeftY: 0,
  lyricPosterThreeRowMiddleTextBottomRightX: 0,
  lyricPosterThreeRowMiddleTextBottomRightY: 0,
  lyricPosterThreeRowBottomTextTopLeftX: -116,
  lyricPosterThreeRowBottomTextTopLeftY: 0,
  lyricPosterThreeRowBottomTextTopRightX: 116,
  lyricPosterThreeRowBottomTextTopRightY: 0,
  lyricPosterThreeRowBottomTextBottomLeftX: 0,
  lyricPosterThreeRowBottomTextBottomLeftY: 0,
  lyricPosterThreeRowBottomTextBottomRightX: 0,
  lyricPosterThreeRowBottomTextBottomRightY: 0,
  lyricPosterTallTopLeftX: 12,
  lyricPosterTallTopLeftY: -139,
  lyricPosterTallTopRightX: 1764,
  lyricPosterTallTopRightY: -133,
  lyricPosterTallBottomLeftX: 453,
  lyricPosterTallBottomLeftY: 187,
  lyricPosterTallBottomRightX: 1332,
  lyricPosterTallBottomRightY: 191,
  lyricPosterTallShortTopLeftX: -3,
  lyricPosterTallShortTopLeftY: -145,
  lyricPosterTallShortTopRightX: 1759,
  lyricPosterTallShortTopRightY: -132,
  lyricPosterTallShortBottomLeftX: 453,
  lyricPosterTallShortBottomLeftY: 188,
  lyricPosterTallShortBottomRightX: 1332,
  lyricPosterTallShortBottomRightY: 186,
  lyricPosterTallOneRowTextTopLeftX: 66,
  lyricPosterTallOneRowTextTopLeftY: 40,
  lyricPosterTallOneRowTextTopRightX: -93,
  lyricPosterTallOneRowTextTopRightY: 40,
  lyricPosterTallOneRowTextBottomLeftX: 8,
  lyricPosterTallOneRowTextBottomLeftY: -31,
  lyricPosterTallOneRowTextBottomRightX: 0,
  lyricPosterTallOneRowTextBottomRightY: -31,
  lyricPosterTallTwoRowTopBandTopY: -150,
  lyricPosterTallTwoRowTopBandBottomY: 20,
  lyricPosterTallTwoRowBottomBandTopY: 20,
  lyricPosterTallTwoRowBottomBandBottomY: 195,
  lyricPosterTallTwoRowTopTextTopLeftX: 71,
  lyricPosterTallTwoRowTopTextTopLeftY: 58,
  lyricPosterTallTwoRowTopTextTopRightX: -88,
  lyricPosterTallTwoRowTopTextTopRightY: 56,
  lyricPosterTallTwoRowTopTextBottomLeftX: 136,
  lyricPosterTallTwoRowTopTextBottomLeftY: 65,
  lyricPosterTallTwoRowTopTextBottomRightX: -142,
  lyricPosterTallTwoRowTopTextBottomRightY: 59,
  lyricPosterTallTwoRowBottomTextTopLeftX: 146,
  lyricPosterTallTwoRowBottomTextTopLeftY: 76,
  lyricPosterTallTwoRowBottomTextTopRightX: -152,
  lyricPosterTallTwoRowBottomTextTopRightY: 76,
  lyricPosterTallTwoRowBottomTextBottomLeftX: 46,
  lyricPosterTallTwoRowBottomTextBottomLeftY: -11,
  lyricPosterTallTwoRowBottomTextBottomRightX: -132,
  lyricPosterTallTwoRowBottomTextBottomRightY: -11,
  lyricPosterTallDirectOneRowTLX: 70,
  lyricPosterTallDirectOneRowTLY: 84,
  lyricPosterTallDirectOneRowTRX: 1694,
  lyricPosterTallDirectOneRowTRY: 84,
  lyricPosterTallDirectOneRowBRX: 1342,
  lyricPosterTallDirectOneRowBRY: 310,
  lyricPosterTallDirectOneRowBLX: 460,
  lyricPosterTallDirectOneRowBLY: 310,
  lyricPosterTallDirectTwoTopTLX: 86,
  lyricPosterTallDirectTwoTopTLY: 64,
  lyricPosterTallDirectTwoTopTRX: 1678,
  lyricPosterTallDirectTwoTopTRY: 64,
  lyricPosterTallDirectTwoTopBRX: 1420,
  lyricPosterTallDirectTwoTopBRY: 186,
  lyricPosterTallDirectTwoTopBLX: 362,
  lyricPosterTallDirectTwoTopBLY: 186,
  lyricPosterTallDirectTwoBottomTLX: 372,
  lyricPosterTallDirectTwoBottomTLY: 205,
  lyricPosterTallDirectTwoBottomTRX: 1409,
  lyricPosterTallDirectTwoBottomTRY: 205,
  lyricPosterTallDirectTwoBottomBRX: 1200,
  lyricPosterTallDirectTwoBottomBRY: 322,
  lyricPosterTallDirectTwoBottomBLX: 499,
  lyricPosterTallDirectTwoBottomBLY: 322,
  lyricPosterTallBaseShortTLX: 0,
  lyricPosterTallBaseShortTLY: 0,
  lyricPosterTallBaseShortTRX: 0,
  lyricPosterTallBaseShortTRY: 0,
  lyricPosterTallBaseShortBRX: 19,
  lyricPosterTallBaseShortBRY: 0,
  lyricPosterTallBaseShortBLX: 0,
  lyricPosterTallBaseShortBLY: 0,
  lyricPosterTallBaseOneRowTLX: -163,
  lyricPosterTallBaseOneRowTLY: -152,
  lyricPosterTallBaseOneRowTRX: 150,
  lyricPosterTallBaseOneRowTRY: -152,
  lyricPosterTallBaseOneRowBRX: -122,
  lyricPosterTallBaseOneRowBRY: 19,
  lyricPosterTallBaseOneRowBLX: 120,
  lyricPosterTallBaseOneRowBLY: 19,
  lyricPosterTallBaseTwoTopTLX: -82,
  lyricPosterTallBaseTwoTopTLY: -72,
  lyricPosterTallBaseTwoTopTRX: 100,
  lyricPosterTallBaseTwoTopTRY: -72,
  lyricPosterTallBaseTwoTopBRX: 0,
  lyricPosterTallBaseTwoTopBRY: 29,
  lyricPosterTallBaseTwoTopBLX: 39,
  lyricPosterTallBaseTwoTopBLY: 29,
  lyricPosterTallBaseTwoBottomTLX: -52,
  lyricPosterTallBaseTwoBottomTLY: -70,
  lyricPosterTallBaseTwoBottomTRX: 69,
  lyricPosterTallBaseTwoBottomTRY: -70,
  lyricPosterTallBaseTwoBottomBRX: 9,
  lyricPosterTallBaseTwoBottomBRY: 20,
  lyricPosterTallBaseTwoBottomBLX: 0,
  lyricPosterTallBaseTwoBottomBLY: 20,
  lyricPosterTallMidShortTLX: -400,
  lyricPosterTallMidShortTLY: -359,
  lyricPosterTallMidShortTRX: 29,
  lyricPosterTallMidShortTRY: -359,
  lyricPosterTallMidShortBRX: -11,
  lyricPosterTallMidShortBRY: -63,
  lyricPosterTallMidShortBLX: 121,
  lyricPosterTallMidShortBLY: -63,
  lyricPosterTallMidOneRowTLX: -390,
  lyricPosterTallMidOneRowTLY: -492,
  lyricPosterTallMidOneRowTRX: 285,
  lyricPosterTallMidOneRowTRY: -492,
  lyricPosterTallMidOneRowBRX: -83,
  lyricPosterTallMidOneRowBRY: -32,
  lyricPosterTallMidOneRowBLX: 91,
  lyricPosterTallMidOneRowBLY: -32,
  lyricPosterTallMidTwoTopTLX: -180,
  lyricPosterTallMidTwoTopTLY: -238,
  lyricPosterTallMidTwoTopTRX: 180,
  lyricPosterTallMidTwoTopTRY: -238,
  lyricPosterTallMidTwoTopBRX: -8,
  lyricPosterTallMidTwoTopBRY: 0,
  lyricPosterTallMidTwoTopBLX: 0,
  lyricPosterTallMidTwoTopBLY: 0,
  lyricPosterTallMidTwoBottomTLX: -144,
  lyricPosterTallMidTwoBottomTLY: -144,
  lyricPosterTallMidTwoBottomTRX: 203,
  lyricPosterTallMidTwoBottomTRY: -144,
  lyricPosterTallMidTwoBottomBRX: 91,
  lyricPosterTallMidTwoBottomBRY: -52,
  lyricPosterTallMidTwoBottomBLX: -52,
  lyricPosterTallMidTwoBottomBLY: -52,
  lyricPosterTallFinalShortTLX: -287,
  lyricPosterTallFinalShortTLY: -630,
  lyricPosterTallFinalShortTRX: 0,
  lyricPosterTallFinalShortTRY: -663,
  lyricPosterTallFinalShortBRX: -58,
  lyricPosterTallFinalShortBRY: 23,
  lyricPosterTallFinalShortBLX: 101,
  lyricPosterTallFinalShortBLY: 23,
  lyricPosterTallFinalOneRowTLX: -686,
  lyricPosterTallFinalOneRowTLY: -839,
  lyricPosterTallFinalOneRowTRX: 632,
  lyricPosterTallFinalOneRowTRY: -819,
  lyricPosterTallFinalOneRowBRX: -63,
  lyricPosterTallFinalOneRowBRY: 29,
  lyricPosterTallFinalOneRowBLX: 89,
  lyricPosterTallFinalOneRowBLY: 29,
  lyricPosterTallFinalTwoTopTLX: -361,
  lyricPosterTallFinalTwoTopTLY: -476,
  lyricPosterTallFinalTwoTopTRX: 359,
  lyricPosterTallFinalTwoTopTRY: -475,
  lyricPosterTallFinalTwoTopBRX: 60,
  lyricPosterTallFinalTwoTopBRY: -63,
  lyricPosterTallFinalTwoTopBLX: 0,
  lyricPosterTallFinalTwoTopBLY: -63,
  lyricPosterTallFinalTwoBottomTLX: -287,
  lyricPosterTallFinalTwoBottomTLY: -328,
  lyricPosterTallFinalTwoBottomTRX: 275,
  lyricPosterTallFinalTwoBottomTRY: -328,
  lyricPosterTallFinalTwoBottomBRX: 101,
  lyricPosterTallFinalTwoBottomBRY: 9,
  lyricPosterTallFinalTwoBottomBLX: 40,
  lyricPosterTallFinalTwoBottomBLY: 9,
  lyricPosterMaxRows: "auto",
  lyricPosterRowBreakpoint: 28,
  lyricPosterTransition: "none"};

const ROOM_UTILITY_KEY = "pocketdj-room-utility-v65a";
const CLOCK_DISABLED_MIGRATION_KEY = "pocketdj-v65m-clock-disabled-default-applied";
const MIXER_LED_TUNING_MIGRATION_KEY = "pocketdj-v65y-mixer-led-tuning-applied";
const TALL_LYRIC_CALIBRATION_MIGRATION_KEY = "pocketdj-final-16x9-lyric-offsets-2026-06-02";
const FINAL_TALL_LYRIC_CALIBRATION_MIGRATION_KEY = "pocketdj-final-full-tall-lyric-offsets-effects-disabled-2026-06-02";
const PLACED_ACTIVE_ALBUM_TUNING_MIGRATION_KEY = "pocketdj-v66b-placed-active-album-tuned-2026-06-03";
const AMBIENT_TWINKLE_VISIBILITY_MIGRATION_KEY = "pocketdj-v66b-ambient-twinkles-visibility-2026-06-03";
const PLACED_ACTIVE_ALBUM_DIM_MIGRATION_KEY = "pocketdj-v66c-placed-active-album-dim-shelf-2026-06-03";
const PLACED_ACTIVE_ALBUM_OPAQUE_MIGRATION_KEY = "pocketdj-v66e-placed-active-album-opaque-shared-filter-2026-06-03";
const AMBIENT_TWINKLE_USER_EDIT_MIGRATION_KEY = "pocketdj-v66c-ambient-twinkles-user-edit-2026-06-03";
let roomUtility = loadRoomUtilitySettings();

function setUtilityLabel(id: string, value: number): void {
  const decimals =
    id.includes("LedSize")
      ? 2
      : id.includes("Opacity") ||
    id.includes("Scale") ||
    id.includes("Strength") ||
    id.includes("Stretch") ||
    id.includes("Blend") ||
    id.includes("Fade") ||
    id.includes("Glow")
      ? 2
      : id.includes("Tilt")
        ? 1
        : 0;
  const label = document.querySelector<HTMLElement>(`#${id}`);
  if (label) label.textContent = value.toFixed(decimals);
}

function loadRoomUtilitySettings(): RoomUtilitySettings {
  try {
    const raw = window.localStorage.getItem(ROOM_UTILITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RoomUtilitySettings>;
      return { ...DEFAULT_ROOM_UTILITY, ...parsed };
    }
  } catch (error) {
    console.warn("Could not load PocketDJ room utility settings", error);
  }

  return { ...DEFAULT_ROOM_UTILITY };
}

function saveRoomUtilitySettings(): void {
  window.localStorage.setItem(ROOM_UTILITY_KEY, JSON.stringify(roomUtility));
}

function applyClockDisabledDefaultMigration(): void {
  try {
    if (window.localStorage.getItem(CLOCK_DISABLED_MIGRATION_KEY)) return;
    roomUtility = { ...roomUtility, vinylClockEnabled: false };
    saveRoomUtilitySettings();
    window.localStorage.setItem(CLOCK_DISABLED_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply vinyl clock disabled migration", error);
  }
}

function applyMixerLedTuningMigration(): void {
  try {
    if (window.localStorage.getItem(MIXER_LED_TUNING_MIGRATION_KEY)) return;
    roomUtility = {
      ...roomUtility,
      mixerTempoLedX: 45,
      mixerTempoLedY: 63,
      mixerTempoLedSize: 2,
      mixerLyricsLedX: 57,
      mixerLyricsLedY: 63,
      mixerLyricsLedSize: 2,
    };
    saveRoomUtilitySettings();
    window.localStorage.setItem(MIXER_LED_TUNING_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply mixer LED tuning migration", error);
  }
}

function applyTallLyricCalibrationMigration(): void {
  try {
    if (window.localStorage.getItem(TALL_LYRIC_CALIBRATION_MIGRATION_KEY)) return;
    roomUtility = {
      ...roomUtility,
      lyricPosterTallGuideOpacity: 1,
      lyricPosterTallClampTopLeftX: 12,
      lyricPosterTallClampTopLeftY: -139,
      lyricPosterTallClampTopRightX: 1764,
      lyricPosterTallClampTopRightY: -133,
      lyricPosterTallTopLeftX: 12,
      lyricPosterTallTopLeftY: -139,
      lyricPosterTallTopRightX: 1764,
      lyricPosterTallTopRightY: -133,
      lyricPosterTallBottomLeftX: 453,
      lyricPosterTallBottomLeftY: 187,
      lyricPosterTallBottomRightX: 1332,
      lyricPosterTallBottomRightY: 191,
      lyricPosterTallShortTopLeftX: -3,
      lyricPosterTallShortTopLeftY: -145,
      lyricPosterTallShortTopRightX: 1759,
      lyricPosterTallShortTopRightY: -132,
      lyricPosterTallShortBottomLeftX: 453,
      lyricPosterTallShortBottomLeftY: 188,
      lyricPosterTallShortBottomRightX: 1332,
      lyricPosterTallShortBottomRightY: 186,
      lyricPosterTallOneRowTextTopLeftX: 66,
      lyricPosterTallOneRowTextTopLeftY: 40,
      lyricPosterTallOneRowTextTopRightX: -93,
      lyricPosterTallOneRowTextTopRightY: 40,
      lyricPosterTallOneRowTextBottomLeftX: 8,
      lyricPosterTallOneRowTextBottomLeftY: -31,
      lyricPosterTallOneRowTextBottomRightX: 0,
      lyricPosterTallOneRowTextBottomRightY: -31,
      lyricPosterTallTwoRowTopBandTopY: -150,
      lyricPosterTallTwoRowTopBandBottomY: 20,
      lyricPosterTallTwoRowBottomBandTopY: 20,
      lyricPosterTallTwoRowBottomBandBottomY: 195,
      lyricPosterTallTwoRowTopTextTopLeftX: 71,
      lyricPosterTallTwoRowTopTextTopLeftY: 58,
      lyricPosterTallTwoRowTopTextTopRightX: -88,
      lyricPosterTallTwoRowTopTextTopRightY: 56,
      lyricPosterTallTwoRowTopTextBottomLeftX: 136,
      lyricPosterTallTwoRowTopTextBottomLeftY: 65,
      lyricPosterTallTwoRowTopTextBottomRightX: -142,
      lyricPosterTallTwoRowTopTextBottomRightY: 59,
      lyricPosterTallTwoRowBottomTextTopLeftX: 146,
      lyricPosterTallTwoRowBottomTextTopLeftY: 76,
      lyricPosterTallTwoRowBottomTextTopRightX: -152,
      lyricPosterTallTwoRowBottomTextTopRightY: 76,
      lyricPosterTallTwoRowBottomTextBottomLeftX: 46,
      lyricPosterTallTwoRowBottomTextBottomLeftY: -11,
      lyricPosterTallTwoRowBottomTextBottomRightX: -132,
      lyricPosterTallTwoRowBottomTextBottomRightY: -11,
      lyricPosterTallBaseShortTLX: 0,
      lyricPosterTallBaseShortTLY: 0,
      lyricPosterTallBaseShortTRX: 0,
      lyricPosterTallBaseShortTRY: 0,
      lyricPosterTallBaseShortBRX: 19,
      lyricPosterTallBaseShortBRY: 0,
      lyricPosterTallBaseShortBLX: 0,
      lyricPosterTallBaseShortBLY: 0,
      lyricPosterTallBaseOneRowTLX: -163,
      lyricPosterTallBaseOneRowTLY: -152,
      lyricPosterTallBaseOneRowTRX: 150,
      lyricPosterTallBaseOneRowTRY: -152,
      lyricPosterTallBaseOneRowBRX: -122,
      lyricPosterTallBaseOneRowBRY: 19,
      lyricPosterTallBaseOneRowBLX: 120,
      lyricPosterTallBaseOneRowBLY: 19,
      lyricPosterTallBaseTwoTopTLX: -82,
      lyricPosterTallBaseTwoTopTLY: -72,
      lyricPosterTallBaseTwoTopTRX: 100,
      lyricPosterTallBaseTwoTopTRY: -72,
      lyricPosterTallBaseTwoTopBRX: 0,
      lyricPosterTallBaseTwoTopBRY: 29,
      lyricPosterTallBaseTwoTopBLX: 39,
      lyricPosterTallBaseTwoTopBLY: 29,
      lyricPosterTallBaseTwoBottomTLX: -52,
      lyricPosterTallBaseTwoBottomTLY: -70,
      lyricPosterTallBaseTwoBottomTRX: 69,
      lyricPosterTallBaseTwoBottomTRY: -70,
      lyricPosterTallBaseTwoBottomBRX: 9,
      lyricPosterTallBaseTwoBottomBRY: 20,
      lyricPosterTallBaseTwoBottomBLX: 0,
      lyricPosterTallBaseTwoBottomBLY: 20,

  lyricPosterTallMidShortTLX: -400,
  lyricPosterTallMidShortTLY: -359,
  lyricPosterTallMidShortTRX: 29,
  lyricPosterTallMidShortTRY: -359,
  lyricPosterTallMidShortBRX: -11,
  lyricPosterTallMidShortBRY: -63,
  lyricPosterTallMidShortBLX: 121,
  lyricPosterTallMidShortBLY: -63,
  lyricPosterTallMidOneRowTLX: -390,
  lyricPosterTallMidOneRowTLY: -492,
  lyricPosterTallMidOneRowTRX: 285,
  lyricPosterTallMidOneRowTRY: -492,
  lyricPosterTallMidOneRowBRX: -83,
  lyricPosterTallMidOneRowBRY: -32,
  lyricPosterTallMidOneRowBLX: 91,
  lyricPosterTallMidOneRowBLY: -32,
  lyricPosterTallMidTwoTopTLX: -180,
  lyricPosterTallMidTwoTopTLY: -238,
  lyricPosterTallMidTwoTopTRX: 180,
  lyricPosterTallMidTwoTopTRY: -238,
  lyricPosterTallMidTwoTopBRX: -8,
  lyricPosterTallMidTwoTopBRY: 0,
  lyricPosterTallMidTwoTopBLX: 0,
  lyricPosterTallMidTwoTopBLY: 0,
  lyricPosterTallMidTwoBottomTLX: -144,
  lyricPosterTallMidTwoBottomTLY: -144,
  lyricPosterTallMidTwoBottomTRX: 203,
  lyricPosterTallMidTwoBottomTRY: -144,
  lyricPosterTallMidTwoBottomBRX: 91,
  lyricPosterTallMidTwoBottomBRY: -52,
  lyricPosterTallMidTwoBottomBLX: -52,
  lyricPosterTallMidTwoBottomBLY: -52,
  lyricPosterTallFinalShortTLX: -287,
  lyricPosterTallFinalShortTLY: -630,
  lyricPosterTallFinalShortTRX: 0,
  lyricPosterTallFinalShortTRY: -663,
  lyricPosterTallFinalShortBRX: -58,
  lyricPosterTallFinalShortBRY: 23,
  lyricPosterTallFinalShortBLX: 101,
  lyricPosterTallFinalShortBLY: 23,
  lyricPosterTallFinalOneRowTLX: -686,
  lyricPosterTallFinalOneRowTLY: -839,
  lyricPosterTallFinalOneRowTRX: 632,
  lyricPosterTallFinalOneRowTRY: -819,
  lyricPosterTallFinalOneRowBRX: -63,
  lyricPosterTallFinalOneRowBRY: 29,
  lyricPosterTallFinalOneRowBLX: 89,
  lyricPosterTallFinalOneRowBLY: 29,
  lyricPosterTallFinalTwoTopTLX: -361,
  lyricPosterTallFinalTwoTopTLY: -476,
  lyricPosterTallFinalTwoTopTRX: 359,
  lyricPosterTallFinalTwoTopTRY: -475,
  lyricPosterTallFinalTwoTopBRX: 60,
  lyricPosterTallFinalTwoTopBRY: -63,
  lyricPosterTallFinalTwoTopBLX: 0,
  lyricPosterTallFinalTwoTopBLY: -63,
  lyricPosterTallFinalTwoBottomTLX: -287,
  lyricPosterTallFinalTwoBottomTLY: -328,
  lyricPosterTallFinalTwoBottomTRX: 275,
  lyricPosterTallFinalTwoBottomTRY: -328,
  lyricPosterTallFinalTwoBottomBRX: 101,
  lyricPosterTallFinalTwoBottomBRY: 9,
  lyricPosterTallFinalTwoBottomBLX: 40,
  lyricPosterTallFinalTwoBottomBLY: 9,    };
    saveRoomUtilitySettings();
    window.localStorage.setItem(TALL_LYRIC_CALIBRATION_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply tall lyric calibration migration", error);
  }
}

function applyFinalTallLyricCalibrationMigration(): void {
  try {
    if (window.localStorage.getItem(FINAL_TALL_LYRIC_CALIBRATION_MIGRATION_KEY)) return;
    roomUtility = {
      ...roomUtility,
      lyricPosterEffectDropShadow: false,
      lyricPosterEffectEmboss: false,
      lyricPosterEffectInsetEmboss: false,
      lyricPosterEffectBevel: false,
      lyricPosterEffectSoftBlur: false,
      lyricPosterTallFinalShortTLX: -287,
      lyricPosterTallFinalShortTLY: -630,
      lyricPosterTallFinalShortTRX: 0,
      lyricPosterTallFinalShortTRY: -663,
      lyricPosterTallFinalShortBRX: -58,
      lyricPosterTallFinalShortBRY: 23,
      lyricPosterTallFinalShortBLX: 101,
      lyricPosterTallFinalShortBLY: 23,
      lyricPosterTallFinalOneRowTLX: -686,
      lyricPosterTallFinalOneRowTLY: -839,
      lyricPosterTallFinalOneRowTRX: 632,
      lyricPosterTallFinalOneRowTRY: -819,
      lyricPosterTallFinalOneRowBRX: -63,
      lyricPosterTallFinalOneRowBRY: 29,
      lyricPosterTallFinalOneRowBLX: 89,
      lyricPosterTallFinalOneRowBLY: 29,
      lyricPosterTallFinalTwoTopTLX: -361,
      lyricPosterTallFinalTwoTopTLY: -476,
      lyricPosterTallFinalTwoTopTRX: 359,
      lyricPosterTallFinalTwoTopTRY: -475,
      lyricPosterTallFinalTwoTopBRX: 60,
      lyricPosterTallFinalTwoTopBRY: -63,
      lyricPosterTallFinalTwoTopBLX: 0,
      lyricPosterTallFinalTwoTopBLY: -63,
      lyricPosterTallFinalTwoBottomTLX: -287,
      lyricPosterTallFinalTwoBottomTLY: -328,
      lyricPosterTallFinalTwoBottomTRX: 275,
      lyricPosterTallFinalTwoBottomTRY: -328,
      lyricPosterTallFinalTwoBottomBRX: 101,
      lyricPosterTallFinalTwoBottomBRY: 9,
      lyricPosterTallFinalTwoBottomBLX: 40,
      lyricPosterTallFinalTwoBottomBLY: 9,
    };
    saveRoomUtilitySettings();
    window.localStorage.setItem(FINAL_TALL_LYRIC_CALIBRATION_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply final full-tall lyric calibration migration", error);
  }
}

function updateVinylClockDecor(): void {
  const hourHand = document.querySelector<HTMLElement>("#vinylClockHourHand");
  const minuteHand = document.querySelector<HTMLElement>("#vinylClockMinuteHand");
  const secondHand = document.querySelector<HTMLElement>("#vinylClockSecondHand");
  const digitalReadout = document.querySelector<HTMLElement>("#vinylClockDigitalReadout");
  if (!hourHand || !minuteHand || !secondHand || !digitalReadout) return;

  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  hourHand.style.transform = `translateX(-50%) rotate(${((hours % 12) + minutes / 60 + seconds / 3600) * 30}deg)`;
  minuteHand.style.transform = `translateX(-50%) rotate(${(minutes + seconds / 60) * 6}deg)`;
  secondHand.style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;

  const formattedHours = String(hours % 12 || 12);
  const formattedMinutes = String(minutes).padStart(2, "0");
  digitalReadout.textContent = `${formattedHours}:${formattedMinutes} ${hours >= 12 ? "PM" : "AM"}`;
}

function scheduleVinylClockDecorTick(): void {
  if (vinylClockTimer) window.clearTimeout(vinylClockTimer);
  const loop = () => {
    updateVinylClockDecor();
    const now = new Date();
    vinylClockTimer = window.setTimeout(loop, Math.max(120, 1000 - now.getMilliseconds()));
  };
  loop();
}

function updateSpeakerPulse(isPlaying: boolean): void {
  const left = qs<HTMLElement>("#leftSpeaker");
  const right = qs<HTMLElement>("#rightSpeaker");
  left.classList.toggle("playing", isPlaying);
  right.classList.toggle("playing", isPlaying);
}


type SessionAlbumCornerKey = "tl" | "tr" | "bl" | "br";
type SessionAlbumSlotKind = "full" | "partial";
type SessionAlbumPartialSide = "left" | "right";

type SessionAlbumSlot = {
  id: number;
  label: string;
  kind: SessionAlbumSlotKind;
  partialSide?: SessionAlbumPartialSide;
  partialOverhang?: number;
  tlX: number;
  tlY: number;
  trX: number;
  trY: number;
  blX: number;
  blY: number;
  brX: number;
  brY: number;
};

type SessionAlbumSettings = {
  showGuides: boolean;
  placeAlbumsInFrames: boolean;
  albumPixelAmount: number;
  albumWarmBlend: number;
  albumWarpMode: boolean;
  v64wQuintessentialDefault?: boolean;
  v65aWarpDefault?: boolean;
  v65ePartialWallDefault?: boolean;
  v65fPartialPositionDefault?: boolean;
  nextId: number;
  slots: SessionAlbumSlot[];
};

type SessionAlbumCornerTarget = {
  slotId: number;
  corner: SessionAlbumCornerKey;
} | null;

const SESSION_ALBUM_KEY = "pocketdj-session-wall-albums-v1";
const ROOM_COORD_WIDTH = 1764;
const ROOM_COORD_HEIGHT = 992;
const PARTIAL_ALBUM_X_MARGIN = 520;
const PARTIAL_ALBUM_Y_MARGIN = 160;
const DEFAULT_PARTIAL_ALBUM_OVERHANG = 0.55;
const MIN_PARTIAL_ALBUM_OVERHANG = 0.1;
const MAX_PARTIAL_ALBUM_OVERHANG = 0.85;


function applyPlacedActiveAlbumTuningMigration(): void {
  try {
    if (window.localStorage.getItem(PLACED_ACTIVE_ALBUM_TUNING_MIGRATION_KEY)) return;
    roomUtility = {
      ...roomUtility,
      placedAlbumEnabled: true,
      placedAlbumX: 44,
      placedAlbumY: 60,
      placedAlbumSize: 4,
      placedAlbumRotateX: 33,
      placedAlbumRotateY: 0,
      placedAlbumRotateZ: 0,
      placedAlbumDepth: 0,
      placedAlbumShadow: 1,
      placedAlbumOpacity: 1,
      panelStartY: 39,
    };
    saveRoomUtilitySettings();
    window.localStorage.setItem(PLACED_ACTIVE_ALBUM_TUNING_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply placed active album tuning migration", error);
  }
}

function applyAmbientTwinkleVisibilityMigration(): void {
  try {
    if (window.localStorage.getItem(AMBIENT_TWINKLE_VISIBILITY_MIGRATION_KEY)) return;
    ambientTwinkleSettings = {
      ...DEFAULT_AMBIENT_TWINKLE_SETTINGS,
      points: DEFAULT_AMBIENT_TWINKLE_POINTS.map((point) => ({ ...point })),
    };
    saveAmbientTwinkleSettings();
    window.localStorage.setItem(AMBIENT_TWINKLE_VISIBILITY_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply ambient twinkle visibility migration", error);
  }
}

function applyPlacedActiveAlbumDimMigration(): void {
  try {
    if (window.localStorage.getItem(PLACED_ACTIVE_ALBUM_DIM_MIGRATION_KEY)) return;
    roomUtility = {
      ...roomUtility,
      placedAlbumEnabled: true,
      placedAlbumX: 44,
      placedAlbumY: 60,
      placedAlbumSize: 4,
      placedAlbumRotateX: 33,
      placedAlbumRotateY: 0,
      placedAlbumRotateZ: 0,
      placedAlbumDepth: 0,
      placedAlbumShadow: 1,
      placedAlbumOpacity: 1,
      panelStartY: 39,
    };
    saveRoomUtilitySettings();
    window.localStorage.setItem(PLACED_ACTIVE_ALBUM_DIM_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply placed active album dim migration", error);
  }
}

function applyAmbientTwinkleUserEditMigration(): void {
  try {
    if (window.localStorage.getItem(AMBIENT_TWINKLE_USER_EDIT_MIGRATION_KEY)) return;
    ambientTwinkleSettings = {
      ...DEFAULT_AMBIENT_TWINKLE_SETTINGS,
      points: DEFAULT_AMBIENT_TWINKLE_POINTS.map((point) => ({ ...point })),
    };
    saveAmbientTwinkleSettings();
    window.localStorage.setItem(AMBIENT_TWINKLE_USER_EDIT_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply ambient twinkle user edit migration", error);
  }
}


function applyPlacedActiveAlbumOpaqueMigration(): void {
  try {
    if (window.localStorage.getItem(PLACED_ACTIVE_ALBUM_OPAQUE_MIGRATION_KEY)) return;
    roomUtility = {
      ...roomUtility,
      placedAlbumOpacity: 1,
    };
    saveRoomUtilitySettings();
    window.localStorage.setItem(PLACED_ACTIVE_ALBUM_OPAQUE_MIGRATION_KEY, "true");
  } catch (error) {
    console.warn("Could not apply placed active album opaque migration", error);
  }
}

type StringLightPoint = {
  id: number;
  x: number;
  y: number;
  size: number;
  intensity: number;
  warmth: number;
  flicker: number;
  phase: number;
};

type StringLightSettings = {
  enabled: boolean;
  editMode: boolean;
  showGuides: boolean;
  glow: number;
  pulse: number;
  flicker: number;
  selectedId: number | null;
  nextId: number;
  points: StringLightPoint[];
};

const STRING_LIGHT_KEY = "pocketdj-string-light-points-v1";
const STRING_LIGHT_PRESET_MIGRATION_KEY = "pocketdj-v65u-string-light-preset-applied";
const DEFAULT_STRING_LIGHT_POINTS: StringLightPoint[] = [
  { id: 1, x: 591, y: 331, size: 13, intensity: 0.95, warmth: 0.72, flicker: 0.18, phase: 0.02 },
  { id: 2, x: 639, y: 327, size: 15, intensity: 1.05, warmth: 0.76, flicker: 0.16, phase: 0.19 },
  { id: 3, x: 681, y: 313, size: 13, intensity: 0.90, warmth: 0.68, flicker: 0.22, phase: 0.38 },
  { id: 4, x: 724, y: 326, size: 14, intensity: 1.02, warmth: 0.74, flicker: 0.14, phase: 0.53 },
  { id: 5, x: 762, y: 326, size: 13, intensity: 0.88, warmth: 0.69, flicker: 0.20, phase: 0.71 },
  { id: 6, x: 800, y: 316, size: 15, intensity: 1.10, warmth: 0.78, flicker: 0.16, phase: 0.87 },
  { id: 7, x: 839, y: 325, size: 13, intensity: 0.92, warmth: 0.73, flicker: 0.24, phase: 0.31 },
  { id: 8, x: 876, y: 329, size: 14, intensity: 1.06, warmth: 0.76, flicker: 0.17, phase: 0.62 },
  { id: 9, x: 915, y: 333, size: 13, intensity: 0.96, warmth: 0.70, flicker: 0.19, phase: 0.44 },
  { id: 10, x: 954, y: 330, size: 12, intensity: 0.82, warmth: 0.66, flicker: 0.25, phase: 0.79 },
  { id: 11, x: 985, y: 326, size: 12, intensity: 0.82, warmth: 0.66, flicker: 0.25, phase: 0.00 },
  { id: 12, x: 1020, y: 314, size: 12, intensity: 0.82, warmth: 0.66, flicker: 0.25, phase: 0.09090909090909091 },
  { id: 13, x: 1055, y: 326, size: 12, intensity: 0.82, warmth: 0.66, flicker: 0.25, phase: 0.18181818181818182 },
  { id: 14, x: 1092, y: 326, size: 12, intensity: 0.82, warmth: 0.66, flicker: 0.25, phase: 0.2727272727272727 },
  { id: 15, x: 1126, y: 315, size: 12, intensity: 0.82, warmth: 0.66, flicker: 0.25, phase: 0.36363636363636365 },
  { id: 16, x: 1160, y: 326, size: 12, intensity: 0.82, warmth: 0.66, flicker: 0.25, phase: 0.45454545454545453 },
  { id: 18, x: 1197, y: 331, size: 13, intensity: 0.95, warmth: 0.72, flicker: 0.18, phase: 0.6363636363636364 },
];

const DEFAULT_STRING_LIGHT_SETTINGS: StringLightSettings = {
  enabled: true,
  editMode: false,
  showGuides: false,
  glow: 0.75,
  pulse: 0.36,
  flicker: 0.74,
  selectedId: 16,
  nextId: 19,
  points: DEFAULT_STRING_LIGHT_POINTS.map((point) => ({ ...point })),
};

let stringLightSettings = loadStringLightSettings();

type AmbientTwinkleKind = "star" | "city";

type AmbientTwinklePoint = {
  id: number;
  kind: AmbientTwinkleKind;
  x: number;
  y: number;
  size: number;
  intensity: number;
  phase: number;
};

type AmbientTwinkleSettings = {
  enabled: boolean;
  editMode: boolean;
  showGuides: boolean;
  starOpacity: number;
  cityOpacity: number;
  twinkle: number;
  selectedId: number | null;
  nextId: number;
  points: AmbientTwinklePoint[];
};

const AMBIENT_TWINKLE_KEY = "pocketdj-ambient-stars-city-lights-v1";
const DEFAULT_AMBIENT_TWINKLE_POINTS: AmbientTwinklePoint[] = [
  { id: 1, kind: "star", x: 689, y: 375, size: 2.9, intensity: 0.68, phase: 0.02 },
  { id: 2, kind: "star", x: 754, y: 392, size: 2.4, intensity: 0.58, phase: 0.22 },
  { id: 3, kind: "star", x: 829, y: 371, size: 1.9, intensity: 0.64, phase: 0.41 },
  { id: 4, kind: "star", x: 906, y: 386, size: 1.5, intensity: 0.52, phase: 0.73 },
  { id: 5, kind: "star", x: 982, y: 369, size: 1.8, intensity: 0.6, phase: 0.31 },
  { id: 6, kind: "star", x: 1056, y: 393, size: 1.6, intensity: 0.55, phase: 0.62 },
  { id: 7, kind: "star", x: 1130, y: 377, size: 1.9, intensity: 0.62, phase: 0.88 },
  { id: 8, kind: "star", x: 744, y: 430, size: 1.4, intensity: 0.48, phase: 0.54 },
  { id: 9, kind: "star", x: 947.0289877374792, y: 411.88594297148575, size: 1.5, intensity: 0.5, phase: 0.13 },
  { id: 10, kind: "city", x: 689, y: 514, size: 2.1, intensity: 0.72, phase: 0.1 },
  { id: 11, kind: "city", x: 722, y: 496, size: 2.4, intensity: 0.82, phase: 0.27 },
  { id: 12, kind: "city", x: 751, y: 530, size: 1.8, intensity: 0.62, phase: 0.46 },
  { id: 13, kind: "city", x: 790, y: 502, size: 2.2, intensity: 0.76, phase: 0.67 },
  { id: 14, kind: "city", x: 833, y: 535, size: 1.9, intensity: 0.66, phase: 0.38 },
  { id: 15, kind: "city", x: 868, y: 483, size: 2.5, intensity: 0.88, phase: 0.84 },
  { id: 16, kind: "city", x: 910, y: 517, size: 2.1, intensity: 0.75, phase: 0.06 },
  { id: 17, kind: "city", x: 948, y: 492, size: 2.4, intensity: 0.8, phase: 0.57 },
  { id: 18, kind: "city", x: 986, y: 529, size: 1.8, intensity: 0.64, phase: 0.24 },
  { id: 19, kind: "city", x: 1039.851091052185, y: 554.8054027013507, size: 2.3, intensity: 0.78, phase: 0.74 },
  { id: 20, kind: "city", x: 1068, y: 532, size: 1.9, intensity: 0.68, phase: 0.44 },
  { id: 21, kind: "city", x: 1108, y: 498, size: 2.2, intensity: 0.74, phase: 0.91 },
  { id: 22, kind: "city", x: 1150, y: 521, size: 1.8, intensity: 0.62, phase: 0.19 },
  { id: 23, kind: "star", x: 842, y: 425, size: 1.8, intensity: 0.62, phase: 0.15100000000000025 },
  { id: 24, kind: "star", x: 893, y: 410, size: 1.6, intensity: 0.56, phase: 0.95 },
  { id: 25, kind: "star", x: 1092, y: 421, size: 1.5, intensity: 0.53, phase: 0.36 },
  { id: 26, kind: "city", x: 705, y: 545, size: 1.8, intensity: 0.64, phase: 0.32 },
  { id: 27, kind: "city", x: 821, y: 486, size: 1.7, intensity: 0.6, phase: 0.58 },
  { id: 28, kind: "city", x: 965, y: 474, size: 1.9, intensity: 0.66, phase: 0.05 },
  { id: 29, kind: "city", x: 1086, y: 485, size: 1.8, intensity: 0.62, phase: 0.72 },
  { id: 30, kind: "city", x: 801, y: 507, size: 2.4, intensity: 0.39, phase: 0.11000000000000032 },
  { id: 31, kind: "city", x: 798.1165225267213, y: 421.81090545272633, size: 2.2, intensity: 0.74, phase: 0.2469999999999999 },
  { id: 32, kind: "city", x: 665.0880536051108, y: 460.51825912956474, size: 1.2, intensity: 0.74, phase: 0.38400000000000034 },
  { id: 33, kind: "city", x: 735, y: 409.40470235117556, size: 1.9, intensity: 0.74, phase: 0.5210000000000008 },
  { id: 34, kind: "city", x: 836.3373885974825, y: 448.11205602801397, size: 2.2, intensity: 1.09, phase: 0.6580000000000004 },
  { id: 35, kind: "city", x: 1037, y: 427.76588294147075, size: 2.2, intensity: 0.74, phase: 0.7949999999999999 },
  { id: 36, kind: "city", x: 984, y: 409.9009504752376, size: 2.2, intensity: 0.74, phase: 0.9320000000000004 },
  { id: 37, kind: "city", x: 1066.6553347901213, y: 439.1795897948975, size: 2.2, intensity: 0.74, phase: 0.06900000000000084 },
  { id: 38, kind: "city", x: 1109.8399497012413, y: 439.6758379189595, size: 2.2, intensity: 0.74, phase: 0.2060000000000004 },
];

const DEFAULT_AMBIENT_TWINKLE_SETTINGS: AmbientTwinkleSettings = {
  enabled: true,
  editMode: false,
  showGuides: false,
  starOpacity: 0.88,
  cityOpacity: 1.06,
  twinkle: 0.55,
  selectedId: 36,
  nextId: 39,
  points: DEFAULT_AMBIENT_TWINKLE_POINTS.map((point) => ({ ...point })),
};

let ambientTwinkleSettings = loadAmbientTwinkleSettings();

const DEFAULT_SESSION_ALBUM_SETTINGS: SessionAlbumSettings = {
  showGuides: false,
  placeAlbumsInFrames: true,
  albumPixelAmount: 0.25,
  albumWarmBlend: 0.54,
  albumWarpMode: true,
  v64wQuintessentialDefault: true,
  v65aWarpDefault: true,
  v65ePartialWallDefault: true,
  v65fPartialPositionDefault: true,
  nextId: 64,
  slots: [
    { id: 1, label: "A-1", kind: "full", tlX: 77, tlY: 12, trX: 177, trY: 70, blX: 78, blY: 141, brX: 173, brY: 182 },
    { id: 2, label: "A-2", kind: "full", tlX: 187, tlY: 77, trX: 258, trY: 118, blX: 182, blY: 186, brX: 260, brY: 218 },
    { id: 3, label: "A-3", kind: "full", tlX: 266, tlY: 125, trX: 329, trY: 161, blX: 271, blY: 224, brX: 329, brY: 251 },
    { id: 4, label: "A-4", kind: "full", tlX: 336, tlY: 164, trX: 384, trY: 195, blX: 337, blY: 255, brX: 386, brY: 273 },
    { id: 5, label: "A-5", kind: "full", tlX: 391, tlY: 200, trX: 439, trY: 227, blX: 392, blY: 277, brX: 435, brY: 297 },
    { id: 11, label: "B-1", kind: "full", tlX: 81, tlY: 177, trX: 174, trY: 213, blX: 81, blY: 300, brX: 173, brY: 324 },
    { id: 12, label: "B-2", kind: "full", tlX: 183, tlY: 215, trX: 260, trY: 249, blX: 186, blY: 326, brX: 262, brY: 343 },
    { id: 13, label: "B-3", kind: "full", tlX: 269, tlY: 250, trX: 327, trY: 275, blX: 271, blY: 346, brX: 327, brY: 359 },
    { id: 14, label: "B-4", kind: "full", tlX: 337, tlY: 277, trX: 386, trY: 297, blX: 336, blY: 362, brX: 386, brY: 373 },
    { id: 15, label: "B-5", kind: "full", tlX: 392, tlY: 300, trX: 435, trY: 320, blX: 392, blY: 375, brX: 437, brY: 385 },
    { id: 17, label: "A-17", kind: "full", tlX: 81, tlY: 330, trX: 173, trY: 349, blX: 79, blY: 452, brX: 174, brY: 457 },
    { id: 18, label: "A-18", kind: "full", tlX: 187, tlY: 352, trX: 258, trY: 369, blX: 185, blY: 458, brX: 260, brY: 464 },
    { id: 19, label: "A-19", kind: "full", tlX: 269, tlY: 369, trX: 326, trY: 382, blX: 268, blY: 463, brX: 324, brY: 466 },
    { id: 20, label: "A-20", kind: "full", tlX: 335, tlY: 383, trX: 386, trY: 392, blX: 336, blY: 466, brX: 385, brY: 470 },
    { id: 21, label: "A-21", kind: "full", tlX: 392, tlY: 395, trX: 437, trY: 405, blX: 389, blY: 471, brX: 435, brY: 475 },
    { id: 22, label: "A-22", kind: "full", tlX: 78, tlY: 478, trX: 174, trY: 483, blX: 81, blY: 598, brX: 174, brY: 589 },
    { id: 23, label: "A-23", kind: "full", tlX: 186, tlY: 483, trX: 258, trY: 484, blX: 185, blY: 587, brX: 260, brY: 580 },
    { id: 24, label: "A-24", kind: "full", tlX: 269, tlY: 487, trX: 329, trY: 489, blX: 268, blY: 578, brX: 328, brY: 571 },
    { id: 25, label: "A-25", kind: "full", tlX: 335, tlY: 487, trX: 386, trY: 492, blX: 336, blY: 572, brX: 384, brY: 566 },
    { id: 26, label: "A-26", kind: "full", tlX: 392, tlY: 492, trX: 439, trY: 493, blX: 390, blY: 564, brX: 439, brY: 561 },
    { id: 27, label: "A-27", kind: "full", tlX: 81, tlY: 627, trX: 175, trY: 614, blX: 81, blY: 727, brX: 174, brY: 699 },
    { id: 28, label: "A-28", kind: "full", tlX: 184, tlY: 610, trX: 258, trY: 603, blX: 187, blY: 696, brX: 260, brY: 676 },
    { id: 29, label: "A-29", kind: "full", tlX: 269, tlY: 601, trX: 331, trY: 592, blX: 271, blY: 674, brX: 330, brY: 658 },
    { id: 30, label: "A-30", kind: "full", tlX: 1610, tlY: 68, trX: 1703, trY: 12, blX: 1608, blY: 184, brX: 1703, brY: 141 },
    { id: 31, label: "A-31", kind: "full", tlX: 1523, tlY: 123, trX: 1598, trY: 75, blX: 1521, blY: 221, brX: 1598, brY: 188 },
    { id: 32, label: "A-32", kind: "full", tlX: 1448, tlY: 167, trX: 1514, trY: 126, blX: 1445, blY: 256, brX: 1513, brY: 224 },
    { id: 33, label: "A-33", kind: "full", tlX: 1394, tlY: 202, trX: 1441, trY: 169, blX: 1391, blY: 280, brX: 1439, brY: 257 },
    { id: 34, label: "A-34", kind: "full", tlX: 1344, tlY: 231, trX: 1386, trY: 203, blX: 1345, blY: 299, brX: 1385, brY: 280 },
    { id: 35, label: "A-35", kind: "full", tlX: 1610, tlY: 212, trX: 1702, trY: 175, blX: 1608, blY: 323, brX: 1702, brY: 300 },
    { id: 36, label: "A-36", kind: "full", tlX: 1524, tlY: 247, trX: 1602, trY: 215, blX: 1523, blY: 344, brX: 1602, brY: 325 },
    { id: 37, label: "A-37", kind: "full", tlX: 1447, tlY: 278, trX: 1517, trY: 250, blX: 1447, blY: 362, brX: 1517, brY: 345 },
    { id: 38, label: "A-38", kind: "full", tlX: 1392, tlY: 303, trX: 1441, trY: 280, blX: 1392, blY: 375, brX: 1441, brY: 362 },
    { id: 39, label: "A-39", kind: "full", tlX: 1345, tlY: 322, trX: 1385, trY: 303, blX: 1340, blY: 387, brX: 1385, brY: 377 },
    { id: 40, label: "A-40", kind: "full", tlX: 1609, tlY: 349, trX: 1701, trY: 329, blX: 1607, blY: 459, brX: 1699, brY: 454 },
    { id: 41, label: "A-41", kind: "full", tlX: 1521, tlY: 369, trX: 1600, trY: 351, blX: 1521, blY: 465, brX: 1600, brY: 460 },
    { id: 42, label: "A-42", kind: "full", tlX: 1448, tlY: 384, trX: 1513, trY: 370, blX: 1447, blY: 469, brX: 1514, brY: 464 },
    { id: 43, label: "A-43", kind: "full", tlX: 1395, tlY: 395, trX: 1442, trY: 383, blX: 1392, blY: 473, brX: 1441, brY: 468 },
    { id: 44, label: "A-44", kind: "full", tlX: 1347, tlY: 407, trX: 1388, trY: 397, blX: 1342, blY: 476, brX: 1384, brY: 474 },
    { id: 45, label: "A-45", kind: "full", tlX: 1610, tlY: 486, trX: 1700, trY: 481, blX: 1609, blY: 590, brX: 1703, brY: 600 },
    { id: 46, label: "A-46", kind: "full", tlX: 1522, tlY: 488, trX: 1597, trY: 485, blX: 1523, blY: 582, brX: 1600, brY: 588 },
    { id: 47, label: "A-47", kind: "full", tlX: 1448, tlY: 491, trX: 1515, trY: 488, blX: 1450, blY: 575, brX: 1516, brY: 581 },
    { id: 48, label: "A-48", kind: "full", tlX: 1393, tlY: 494, trX: 1441, trY: 490, blX: 1391, blY: 567, brX: 1444, brY: 574 },
    { id: 49, label: "A-49", kind: "full", tlX: 1342, tlY: 494, trX: 1386, trY: 492, blX: 1343, blY: 560, brX: 1385, brY: 568 },
    { id: 50, label: "A-50", kind: "full", tlX: 1610, tlY: 616, trX: 1701, trY: 630, blX: 1611, blY: 711, brX: 1703, brY: 737 },
    { id: 51, label: "A-51", kind: "full", tlX: 1521, tlY: 606, trX: 1600, trY: 613, blX: 1522, blY: 686, brX: 1603, brY: 709 },
    { id: 52, label: "A-52", kind: "full", tlX: 1448, tlY: 596, trX: 1514, trY: 603, blX: 1446, blY: 664, brX: 1514, brY: 682 },
    { id: 53, label: "P-53", kind: "partial", partialSide: "left", partialOverhang: 0.55, tlX: -26, tlY: -31, trX: 67, trY: 7, blX: -79, blY: 71, brX: 65, brY: 133 },
    { id: 54, label: "P-54", kind: "partial", partialSide: "left", partialOverhang: 0.55, tlX: -88, tlY: 106, trX: 63, trY: 168, blX: -88, blY: 258, brX: 63, brY: 295 },
    { id: 55, label: "P-55", kind: "partial", partialSide: "left", partialOverhang: 0.55, tlX: -88, tlY: 296, trX: 66, trY: 328, blX: -88, blY: 442, brX: 67, brY: 452 },
    { id: 57, label: "P-57", kind: "partial", partialSide: "left", partialOverhang: 0.55, tlX: -88, tlY: 474, trX: 67, trY: 478, blX: -88, blY: 617, brX: 69, brY: 599 },
    { id: 58, label: "P-58", kind: "partial", partialSide: "left", partialOverhang: 0.55, tlX: -88, tlY: 645, trX: 71, trY: 627, blX: -88, blY: 786, brX: 71, brY: 731 },
    { id: 59, label: "P-59", kind: "partial", partialSide: "right", partialOverhang: 0.55, tlX: 1716, tlY: 2, trX: 1852, trY: -50, blX: 1719, blY: 133, brX: 1852, brY: 80 },
    { id: 60, label: "P-60", kind: "partial", partialSide: "right", partialOverhang: 0.55, tlX: 1715, tlY: 168, trX: 1852, trY: 112, blX: 1716, blY: 294, brX: 1852, brY: 261 },
    { id: 61, label: "P-61", kind: "partial", partialSide: "right", partialOverhang: 0.55, tlX: 1715, tlY: 326, trX: 1872, trY: 287, blX: 1714, blY: 453, brX: 1852, brY: 442 },
    { id: 62, label: "P-62", kind: "partial", partialSide: "right", partialOverhang: 0.55, tlX: 1715, tlY: 481, trX: 1852, trY: 474, blX: 1716, blY: 602, brX: 1852, brY: 617 },
    { id: 63, label: "P-63", kind: "partial", partialSide: "right", partialOverhang: 0.55, tlX: 1715, tlY: 631, trX: 1852, trY: 651, blX: 1715, blY: 740, brX: 1852, brY: 785 },
  ],
};

let sessionAlbumSettings = loadSessionAlbumSettings();
let sessionAlbumCornerTarget: SessionAlbumCornerTarget = null;

type SessionAlbumPlaceholder = {
  title: string;
  artist: string;
  imageUrl: string;
};

let sessionAlbumPlaceholderPool: SessionAlbumPlaceholder[] = [];
let sessionAlbumPlaceholderFetchStarted = false;
const sessionAlbumPixelCache = new Map<string, string>();
const sessionAlbumPixelPending = new Set<string>();
let sessionWallAlbumAssignments: SessionAlbumPlaceholder[] = [];
let sessionWallAlbumAssignmentsBySlot = new Map<number, SessionAlbumPlaceholder>();
const sessionWallAlbumUrlCacheKey = "pocketdj-wall-album-url-cache-v1";
const SESSION_ALBUM_FALLBACK_ART_URL = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b1a12"/>
      <stop offset="0.52" stop-color="#111018"/>
      <stop offset="1" stop-color="#4a2412"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="50%" r="42%">
      <stop offset="0" stop-color="#d08b31" stop-opacity=".34"/>
      <stop offset=".55" stop-color="#271810" stop-opacity=".42"/>
      <stop offset=".58" stop-color="#08070a"/>
      <stop offset="1" stop-color="#060508"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <rect x="28" y="28" width="544" height="544" rx="18" fill="none" stroke="#2f1a10" stroke-width="24"/>
  <circle cx="300" cy="300" r="176" fill="url(#r)" stroke="#050505" stroke-width="14"/>
  <circle cx="300" cy="300" r="34" fill="#d29438"/>
  <text x="300" y="98" text-anchor="middle" font-family="monospace" font-size="34" font-weight="700" fill="#f1b95d" opacity=".84">POCKET DJ</text>
  <text x="300" y="520" text-anchor="middle" font-family="monospace" font-size="26" font-weight="700" fill="#f1b95d" opacity=".58">VINYL DREAMS</text>
</svg>
`)}`;
const sessionAlbumImageCache = new Map<string, HTMLImageElement>();
const sessionAlbumImagePending = new Map<string, Promise<HTMLImageElement | null>>();
const sessionAlbumWarpLoadRequested = new Set<string>();
let sessionAlbumWarpRenderQueued = false;
let sessionAlbumWarpRenderInProgress = false;






function applySessionAlbumSlotMigrations(slots: SessionAlbumSlot[]): SessionAlbumSlot[] {
  return slots.map((slot) => {
    if (slot.label !== "B-3") return slot;

    // B-3 had an early corner-ordering issue in localStorage on some browsers.
    // Keep it locked to the corrected wall-frame orientation so warp mode does not rotate it.
    return {
      ...slot,
      tlX: 269,
      tlY: 250,
      trX: 327,
      trY: 275,
      blX: 271,
      blY: 346,
      brX: 327,
      brY: 359,
    };
  });
}


function loadSessionAlbumSettings(): SessionAlbumSettings {
  try {
    const raw = localStorage.getItem(SESSION_ALBUM_KEY);
    if (!raw) return { ...DEFAULT_SESSION_ALBUM_SETTINGS, slots: applySessionAlbumSlotMigrations([...DEFAULT_SESSION_ALBUM_SETTINGS.slots]) };
    const parsed = JSON.parse(raw) as Partial<SessionAlbumSettings>;
    const slots = Array.isArray(parsed.slots)
      ? parsed.slots
          .map((slot) => normalizeSessionAlbumSlot(slot as Partial<SessionAlbumSlot>))
          .filter((slot): slot is SessionAlbumSlot => Boolean(slot))
      : [];

    const hasV64WDefault = Boolean((parsed as { v64wQuintessentialDefault?: boolean }).v64wQuintessentialDefault);
    const hasV65AWarpDefault = Boolean((parsed as { v65aWarpDefault?: boolean }).v65aWarpDefault);
    const hasV65EPartialWallDefault = Boolean((parsed as { v65ePartialWallDefault?: boolean }).v65ePartialWallDefault);
    const hasV65FPartialPositionDefault = Boolean((parsed as { v65fPartialPositionDefault?: boolean }).v65fPartialPositionDefault);
    const activeSlots = hasV65EPartialWallDefault && hasV65FPartialPositionDefault && slots.length
      ? slots
      : DEFAULT_SESSION_ALBUM_SETTINGS.slots.map((slot) => ({ ...slot }));
    const maxId = activeSlots.reduce((max, slot) => Math.max(max, slot.id), 0);
    return {
      showGuides: Boolean(parsed.showGuides),
      placeAlbumsInFrames: hasV64WDefault ? Boolean(parsed.placeAlbumsInFrames) : true,
      albumPixelAmount: clamp01(Number(parsed.albumPixelAmount ?? DEFAULT_SESSION_ALBUM_SETTINGS.albumPixelAmount)),
      albumWarmBlend: clamp01(Number(parsed.albumWarmBlend ?? DEFAULT_SESSION_ALBUM_SETTINGS.albumWarmBlend)),
      albumWarpMode: hasV65AWarpDefault ? Boolean(parsed.albumWarpMode) : true,
      v64wQuintessentialDefault: true,
      v65aWarpDefault: true,
      v65ePartialWallDefault: true,
      v65fPartialPositionDefault: true,
      nextId: Math.max(Number(parsed.nextId || DEFAULT_SESSION_ALBUM_SETTINGS.nextId), maxId + 1, DEFAULT_SESSION_ALBUM_SETTINGS.nextId),
      slots: applySessionAlbumSlotMigrations(activeSlots),
    };
  } catch (error) {
    console.warn("Could not load session wall album settings.", error);
    return { ...DEFAULT_SESSION_ALBUM_SETTINGS, slots: applySessionAlbumSlotMigrations([...DEFAULT_SESSION_ALBUM_SETTINGS.slots]) };
  }
}

function normalizeSessionAlbumSlot(slot: Partial<SessionAlbumSlot>): SessionAlbumSlot | null {
  const id = Number(slot.id);
  if (!Number.isFinite(id) || id < 1) return null;
  const kind: SessionAlbumSlotKind = slot.kind === "partial" ? "partial" : "full";
  const normalized: SessionAlbumSlot = {
    id,
    label: slot.label || `${kind === "partial" ? "P" : "A"}-${id}`,
    kind,
    partialSide: kind === "partial" ? normalizeSessionAlbumPartialSide(slot.partialSide, slot) : undefined,
    partialOverhang: kind === "partial" ? clampPartialAlbumOverhang(Number(slot.partialOverhang ?? DEFAULT_PARTIAL_ALBUM_OVERHANG)) : undefined,
    tlX: clampSessionAlbumX(Number(slot.tlX ?? 720), kind),
    tlY: clampSessionAlbumY(Number(slot.tlY ?? 260), kind),
    trX: clampSessionAlbumX(Number(slot.trX ?? 860), kind),
    trY: clampSessionAlbumY(Number(slot.trY ?? 260), kind),
    blX: clampSessionAlbumX(Number(slot.blX ?? 720), kind),
    blY: clampSessionAlbumY(Number(slot.blY ?? 400), kind),
    brX: clampSessionAlbumX(Number(slot.brX ?? 860), kind),
    brY: clampSessionAlbumY(Number(slot.brY ?? 400), kind),
  };

  if (normalized.kind === "partial") normalizePartialAlbumMetadata(normalized);
  return normalized;
}

function normalizeSessionAlbumPartialSide(side: unknown, slot: Partial<SessionAlbumSlot>): SessionAlbumPartialSide {
  if (side === "left" || side === "right") return side;
  const averageX = (Number(slot.tlX ?? 0) + Number(slot.trX ?? 0) + Number(slot.blX ?? 0) + Number(slot.brX ?? 0)) / 4;
  return averageX < ROOM_COORD_WIDTH / 2 ? "left" : "right";
}

function clampPartialAlbumOverhang(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PARTIAL_ALBUM_OVERHANG;
  return Math.max(MIN_PARTIAL_ALBUM_OVERHANG, Math.min(MAX_PARTIAL_ALBUM_OVERHANG, value));
}

function partialAlbumHiddenDepth(visibleWidth: number, overhang: number): number {
  const cleanOverhang = clampPartialAlbumOverhang(overhang);
  const cleanVisibleWidth = Math.max(1, Math.abs(visibleWidth));
  return Math.round(cleanVisibleWidth * cleanOverhang / (1 - cleanOverhang));
}

function normalizePartialAlbumMetadata(slot: SessionAlbumSlot): void {
  if (slot.kind !== "partial") return;
  slot.partialSide = slot.partialSide || normalizeSessionAlbumPartialSide(undefined, slot);
  slot.partialOverhang = clampPartialAlbumOverhang(slot.partialOverhang ?? DEFAULT_PARTIAL_ALBUM_OVERHANG);
}

function syncPartialAlbumHiddenCorners(slot: SessionAlbumSlot): void {
  if (slot.kind !== "partial") return;
  normalizePartialAlbumMetadata(slot);
  const side = slot.partialSide || "left";
  const overhang = clampPartialAlbumOverhang(slot.partialOverhang ?? DEFAULT_PARTIAL_ALBUM_OVERHANG);

  if (side === "left") {
    const visibleTopWidth = Math.max(1, slot.trX);
    const visibleBottomWidth = Math.max(1, slot.brX);
    slot.tlX = clampSessionAlbumX(-partialAlbumHiddenDepth(visibleTopWidth, overhang), "partial");
    slot.blX = clampSessionAlbumX(-partialAlbumHiddenDepth(visibleBottomWidth, overhang), "partial");
  } else {
    const visibleTopWidth = Math.max(1, ROOM_COORD_WIDTH - slot.tlX);
    const visibleBottomWidth = Math.max(1, ROOM_COORD_WIDTH - slot.blX);
    slot.trX = clampSessionAlbumX(ROOM_COORD_WIDTH + partialAlbumHiddenDepth(visibleTopWidth, overhang), "partial");
    slot.brX = clampSessionAlbumX(ROOM_COORD_WIDTH + partialAlbumHiddenDepth(visibleBottomWidth, overhang), "partial");
  }
}

function saveSessionAlbumSettings(): void {
  localStorage.setItem(SESSION_ALBUM_KEY, JSON.stringify(sessionAlbumSettings));
}

function clampSessionAlbumX(value: number, kind: SessionAlbumSlotKind = "full"): number {
  const min = kind === "partial" ? -PARTIAL_ALBUM_X_MARGIN : 0;
  const max = kind === "partial" ? ROOM_COORD_WIDTH + PARTIAL_ALBUM_X_MARGIN : ROOM_COORD_WIDTH;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampSessionAlbumY(value: number, kind: SessionAlbumSlotKind = "full"): number {
  const min = kind === "partial" ? -PARTIAL_ALBUM_Y_MARGIN : 0;
  const max = kind === "partial" ? ROOM_COORD_HEIGHT + PARTIAL_ALBUM_Y_MARGIN : ROOM_COORD_HEIGHT;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampRoomX(value: number): number {
  return clampSessionAlbumX(value, "full");
}

function clampRoomY(value: number): number {
  return clampSessionAlbumY(value, "full");
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function createSessionAlbumSlot(): SessionAlbumSlot {
  const id = sessionAlbumSettings.nextId;
  const offset = ((id - 1) % 8) * 28;
  const baseX = 640 + offset;
  const baseY = 210 + offset;
  return {
    id,
    label: `A-${id}`,
    kind: "full",
    tlX: clampSessionAlbumX(baseX, "full"),
    tlY: clampSessionAlbumY(baseY, "full"),
    trX: clampSessionAlbumX(baseX + 150, "full"),
    trY: clampSessionAlbumY(baseY + 8, "full"),
    blX: clampSessionAlbumX(baseX + 8, "full"),
    blY: clampSessionAlbumY(baseY + 150, "full"),
    brX: clampSessionAlbumX(baseX + 158, "full"),
    brY: clampSessionAlbumY(baseY + 158, "full"),
  };
}

function createPartialSessionAlbumSlot(side: "left" | "right"): SessionAlbumSlot {
  const id = sessionAlbumSettings.nextId;
  const partialIndex = sessionAlbumSettings.slots.filter((slot) => slot.kind === "partial").length;
  const yOffset = (partialIndex % 5) * 118;
  const baseY = 74 + yOffset;

  if (side === "left") {
    return {
      id,
      label: `P-${id}`,
      kind: "partial",
      partialSide: "left",
      partialOverhang: DEFAULT_PARTIAL_ALBUM_OVERHANG,
      tlX: -88,
      tlY: clampSessionAlbumY(baseY, "partial"),
      trX: 38,
      trY: clampSessionAlbumY(baseY + 10, "partial"),
      blX: -88,
      blY: clampSessionAlbumY(baseY + 124, "partial"),
      brX: 40,
      brY: clampSessionAlbumY(baseY + 132, "partial"),
    };
  }

  return {
    id,
    label: `P-${id}`,
    kind: "partial",
    partialSide: "right",
    partialOverhang: DEFAULT_PARTIAL_ALBUM_OVERHANG,
    tlX: ROOM_COORD_WIDTH - 38,
    tlY: clampSessionAlbumY(baseY + 10, "partial"),
    trX: ROOM_COORD_WIDTH + 88,
    trY: clampSessionAlbumY(baseY, "partial"),
    blX: ROOM_COORD_WIDTH - 40,
    blY: clampSessionAlbumY(baseY + 132, "partial"),
    brX: ROOM_COORD_WIDTH + 88,
    brY: clampSessionAlbumY(baseY + 124, "partial"),
  };
}

function getSessionAlbumSlotCenter(slot: SessionAlbumSlot): { x: number; y: number } {
  return {
    x: (slot.tlX + slot.trX + slot.blX + slot.brX) / 4,
    y: (slot.tlY + slot.trY + slot.blY + slot.brY) / 4,
  };
}

function sessionAlbumPoints(slot: SessionAlbumSlot): string {
  return `${slot.tlX},${slot.tlY} ${slot.trX},${slot.trY} ${slot.brX},${slot.brY} ${slot.blX},${slot.blY}`;
}


function updateSessionAlbumExportText(): void {
  const exportText = document.querySelector<HTMLTextAreaElement>("#sessionAlbumExportText");
  if (!exportText) return;

  const payload = {
    version: 1,
    coordinateSystem: {
      width: ROOM_COORD_WIDTH,
      height: ROOM_COORD_HEIGHT,
    },
    fillOrder: sessionAlbumSettings.slots
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((slot) => slot.label),
    slots: sessionAlbumSettings.slots
      .slice()
      .sort((a, b) => a.id - b.id),
  };

  exportText.value = JSON.stringify(payload, null, 2);
}

async function copySessionAlbumExport(): Promise<void> {
  updateSessionAlbumExportText();
  const exportText = document.querySelector<HTMLTextAreaElement>("#sessionAlbumExportText");
  if (!exportText) return;

  try {
    await navigator.clipboard.writeText(exportText.value);
    const status = document.querySelector<HTMLElement>("#sessionAlbumTargetStatus");
    if (status) status.textContent = "Session album slot JSON copied to clipboard.";
  } catch {
    exportText.select();
    document.execCommand("copy");
  }
}


function shuffleSessionAlbumArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function readWallAlbumUrlCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(sessionWallAlbumUrlCacheKey);
    return raw ? JSON.parse(raw) as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeWallAlbumUrlCache(cache: Record<string, string>): void {
  try {
    localStorage.setItem(sessionWallAlbumUrlCacheKey, JSON.stringify(cache));
  } catch {
    // Ignore storage limits.
  }
}

function wallAlbumKey(item: WallAlbumMasterItem): string {
  return `${item.artist}__${item.album}`;
}

function normalizeAlbumText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreWallAlbumResult(item: WallAlbumMasterItem, result: { collectionName?: string; artistName?: string; artworkUrl100?: string }): number {
  const targetAlbum = normalizeAlbumText(item.album);
  const targetArtist = normalizeAlbumText(item.artist);
  const foundAlbum = normalizeAlbumText(result.collectionName || "");
  const foundArtist = normalizeAlbumText(result.artistName || "");
  let score = 0;

  if (targetAlbum === foundAlbum) score += 120;
  else if (foundAlbum.includes(targetAlbum) || targetAlbum.includes(foundAlbum)) score += 70;

  targetArtist.split(" ").filter(Boolean).forEach((part) => {
    if (foundArtist.includes(part)) score += 8;
  });

  if (result.artworkUrl100) score += 10;
  return score;
}

async function resolveWallAlbumArtworkUrl(item: WallAlbumMasterItem, cache: Record<string, string>): Promise<string | null> {
  if (item.artworkUrl) return item.artworkUrl;
  const key = wallAlbumKey(item);
  if (cache[key]) return cache[key];

  try {
    const response = await fetch(item.searchUrl);
    if (!response.ok) return null;
    const json = await response.json() as {
      results?: Array<{
        collectionName?: string;
        artistName?: string;
        artworkUrl100?: string;
      }>;
    };

    const best = (json.results || [])
      .filter((result) => Boolean(result.artworkUrl100))
      .sort((a, b) => scoreWallAlbumResult(item, b) - scoreWallAlbumResult(item, a))[0];

    if (!best?.artworkUrl100) return null;

    const artworkUrl = best.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/i, "/1000x1000bb.$1");
    cache[key] = artworkUrl;
    writeWallAlbumUrlCache(cache);
    return artworkUrl;
  } catch (error) {
    console.warn("Could not resolve wall album art.", item.artist, item.album, error);
    return null;
  }
}


async function resolveWallAlbumArtworkUrlWithRetry(item: WallAlbumMasterItem, cache: Record<string, string>, attempts = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const artworkUrl = await resolveWallAlbumArtworkUrl(item, cache);
    if (artworkUrl) return artworkUrl;
    if (attempt < attempts) {
      await new Promise((resolve) => window.setTimeout(resolve, 600 + attempt * 900));
    }
  }
  return null;
}



function usedWallAlbumKeys(): Set<string> {
  const used = new Set<string>();
  sessionWallAlbumAssignmentsBySlot.forEach((placeholder) => {
    used.add(`${placeholder.artist}__${placeholder.title}`);
  });
  return used;
}

function findReplacementWallAlbum(cache: Record<string, string>): WallAlbumMasterItem | null {
  const used = usedWallAlbumKeys();
  const candidates = shuffleSessionAlbumArray(WALL_ALBUM_MASTER_LIST).filter((item) => !used.has(wallAlbumKey(item)));
  return candidates.find((item) => Boolean(item.artworkUrl || cache[wallAlbumKey(item)])) || candidates[0] || null;
}


function assignWallAlbumsForRefresh(): void {
  const eligibleSlots = sessionAlbumSettings.slots.slice().sort((a, b) => a.id - b.id);
  if (!eligibleSlots.length) {
    sessionWallAlbumAssignments = [];
    sessionWallAlbumAssignmentsBySlot = new Map<number, SessionAlbumPlaceholder>();
    return;
  }

  const shuffledSlots = shuffleSessionAlbumArray(eligibleSlots);
  const shuffledAlbums = shuffleSessionAlbumArray(WALL_ALBUM_MASTER_LIST);
  const cache = readWallAlbumUrlCache();

  sessionWallAlbumAssignmentsBySlot = new Map<number, SessionAlbumPlaceholder>();
  sessionWallAlbumAssignments = shuffledSlots.map((slot, index) => {
    const item = shuffledAlbums[index % shuffledAlbums.length];
    const cachedOrStaticUrl = item.artworkUrl || cache[wallAlbumKey(item)];
    const placeholder: SessionAlbumPlaceholder = {
      title: item.album,
      artist: item.artist,
      imageUrl: cachedOrStaticUrl || SESSION_ALBUM_FALLBACK_ART_URL,
    };

    sessionWallAlbumAssignmentsBySlot.set(slot.id, placeholder);
    requestSessionAlbumImageLoad(placeholder.imageUrl);

    if (!cachedOrStaticUrl) {
      void resolveWallAlbumArtworkUrlWithRetry(item, cache, 2).then((artworkUrl) => {
        if (!artworkUrl) {
        const replacement = findReplacementWallAlbum(cache);
        const replacementUrl = replacement ? replacement.artworkUrl || cache[wallAlbumKey(replacement)] : "";
        if (!replacement || !replacementUrl) return;
        void loadSessionAlbumImage(replacementUrl).then(() => {
          const resolved: SessionAlbumPlaceholder = {
            title: replacement.album,
            artist: replacement.artist,
            imageUrl: replacementUrl,
          };
          sessionWallAlbumAssignments[index] = resolved;
          sessionWallAlbumAssignmentsBySlot.set(slot.id, resolved);
          scheduleSessionAlbumRender();
        });
        return;
      }
        void loadSessionAlbumImage(artworkUrl).then(() => {
          const resolved: SessionAlbumPlaceholder = {
            title: item.album,
            artist: item.artist,
            imageUrl: artworkUrl,
          };
          sessionWallAlbumAssignments[index] = resolved;
          sessionWallAlbumAssignmentsBySlot.set(slot.id, resolved);
          scheduleSessionAlbumRender();
        });
      });
    } else if (cachedOrStaticUrl !== placeholder.imageUrl) {
      // Reserved for future static artwork path support.
      requestSessionAlbumImageLoad(cachedOrStaticUrl);
    }

    return placeholder;
  });
}

async function loadSessionAlbumPlaceholderAlbums(): Promise<void> {
  if (!sessionWallAlbumAssignments.length) assignWallAlbumsForRefresh();
  sessionAlbumPlaceholderPool = sessionWallAlbumAssignments;
  renderSessionAlbumSlotGuides();
}

function sessionAlbumPixelCacheKey(imageUrl: string, amount: number): string {
  return `${imageUrl}::${Math.round(clamp01(amount) * 100)}`;
}

function getSessionAlbumDisplayImageUrl(placeholder: SessionAlbumPlaceholder): string {
  const amount = clamp01(sessionAlbumSettings.albumPixelAmount);
  const imageUrl = placeholder.imageUrl || SESSION_ALBUM_FALLBACK_ART_URL;
  if (sessionAlbumSettings.albumWarpMode) return imageUrl;
  if (amount <= 0.01) return imageUrl;

  const key = sessionAlbumPixelCacheKey(imageUrl, amount);
  const cached = sessionAlbumPixelCache.get(key);
  if (cached) return cached;

  if (!sessionAlbumPixelPending.has(key)) {
    sessionAlbumPixelPending.add(key);
    void createPixelatedSessionAlbumImage(imageUrl, amount, key);
  }

  return imageUrl;
}

async function createPixelatedSessionAlbumImage(imageUrl: string, amount: number, key: string): Promise<void> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load album image for pixelation."));
    });
    image.src = imageUrl;
    await loaded;

    const outputSize = 640;
    const pixelSize = Math.max(18, Math.round(outputSize / (1 + clamp01(amount) * 22)));
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = pixelSize;
    smallCanvas.height = pixelSize;
    const smallCtx = smallCanvas.getContext("2d");
    if (!smallCtx) return;

    smallCtx.imageSmoothingEnabled = amount < 0.08;
    smallCtx.clearRect(0, 0, pixelSize, pixelSize);
    smallCtx.drawImage(image, 0, 0, pixelSize, pixelSize);

    const bigCanvas = document.createElement("canvas");
    bigCanvas.width = outputSize;
    bigCanvas.height = outputSize;
    const bigCtx = bigCanvas.getContext("2d");
    if (!bigCtx) return;

    bigCtx.imageSmoothingEnabled = false;
    bigCtx.clearRect(0, 0, outputSize, outputSize);
    bigCtx.drawImage(smallCanvas, 0, 0, outputSize, outputSize);

    sessionAlbumPixelCache.set(key, bigCanvas.toDataURL("image/png"));
    scheduleSessionAlbumRender();
  } catch (error) {
    console.warn("Could not generate pixelated album preview.", error);
  } finally {
    sessionAlbumPixelPending.delete(key);
  }
}


function placeholderAlbumForSlot(slot: SessionAlbumSlot): SessionAlbumPlaceholder | null {
  return sessionWallAlbumAssignmentsBySlot.get(slot.id) || null;
}

function sessionAlbumSlotBounds(slot: SessionAlbumSlot): { x: number; y: number; width: number; height: number } {
  const xs = [slot.tlX, slot.trX, slot.blX, slot.brX];
  const ys = [slot.tlY, slot.trY, slot.blY, slot.brY];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}



function cssMatrixForQuad(slot: SessionAlbumSlot): string {
  const room = document.querySelector<HTMLElement>(".room");
  const rect = room?.getBoundingClientRect();
  const scaleX = rect ? rect.width / ROOM_COORD_WIDTH : 1;
  const scaleY = rect ? rect.height / ROOM_COORD_HEIGHT : 1;

  const x0 = slot.tlX * scaleX;
  const y0 = slot.tlY * scaleY;
  const x1 = slot.trX * scaleX;
  const y1 = slot.trY * scaleY;
  const x2 = slot.brX * scaleX;
  const y2 = slot.brY * scaleY;
  const x3 = slot.blX * scaleX;
  const y3 = slot.blY * scaleY;

  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const dx2 = x3 - x2;
  const dy2 = y3 - y2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;

  let a: number;
  let b: number;
  let c: number;
  let d: number;
  let e: number;
  let f: number;
  let g: number;
  let h: number;

  if (Math.abs(dx3) < 0.0001 && Math.abs(dy3) < 0.0001) {
    a = x1 - x0;
    b = x3 - x0;
    c = x0;
    d = y1 - y0;
    e = y3 - y0;
    f = y0;
    g = 0;
    h = 0;
  } else {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 0.0001) {
      a = x1 - x0;
      b = x3 - x0;
      c = x0;
      d = y1 - y0;
      e = y3 - y0;
      f = y0;
      g = 0;
      h = 0;
    } else {
      g = (dx3 * dy2 - dx2 * dy3) / det;
      h = (dx1 * dy3 - dx3 * dy1) / det;
      a = x1 - x0 + g * x1;
      b = x3 - x0 + h * x3;
      c = x0;
      d = y1 - y0 + g * y1;
      e = y3 - y0 + h * y3;
      f = y0;
    }
  }

  return `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}

function renderSessionAlbumFramePreviews(): void {
  const overlay = document.querySelector<HTMLElement>("#sessionAlbumFrameOverlay");
  if (!overlay) return;

  overlay.classList.toggle("session-album-frames-visible", sessionAlbumSettings.placeAlbumsInFrames);
  overlay.innerHTML = "";

  if (!sessionAlbumSettings.placeAlbumsInFrames) return;

  const sorted = sessionAlbumSettings.slots.slice().sort((a, b) => a.id - b.id);
  for (const slot of sorted) {
    const placeholder = placeholderAlbumForSlot(slot);
    if (!placeholder) continue;

    const frame = document.createElement("div");
    frame.className = "session-album-frame-preview";
    frame.style.transform = cssMatrixForQuad(slot);
    frame.title = `${slot.label}: ${placeholder.artist} - ${placeholder.title}`;

    const img = document.createElement("img");
    img.src = placeholder.imageUrl;
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    frame.appendChild(img);

    overlay.appendChild(frame);
  }
}



function scheduleSessionAlbumRender(): void {
  if (sessionAlbumWarpRenderQueued) return;
  sessionAlbumWarpRenderQueued = true;
  window.requestAnimationFrame(() => {
    sessionAlbumWarpRenderQueued = false;
    renderSessionAlbumSlotGuides();
  });
}

function requestSessionAlbumImageLoad(imageUrl: string): void {
  const resolvedUrl = imageUrl || SESSION_ALBUM_FALLBACK_ART_URL;
  if (sessionAlbumWarpLoadRequested.has(resolvedUrl)) return;
  if (sessionAlbumImageCache.has(resolvedUrl)) return;
  sessionAlbumWarpLoadRequested.add(resolvedUrl);
  void loadSessionAlbumImage(resolvedUrl).then(() => scheduleSessionAlbumRender());
}

function loadSessionAlbumImage(imageUrl: string): Promise<HTMLImageElement | null> {
  const resolvedUrl = imageUrl || SESSION_ALBUM_FALLBACK_ART_URL;
  const cached = sessionAlbumImageCache.get(resolvedUrl);
  if (cached?.complete && cached.naturalWidth > 0) return Promise.resolve(cached);

  const pending = sessionAlbumImagePending.get(resolvedUrl);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.onload = () => {
      sessionAlbumImageCache.set(resolvedUrl, image);
      sessionAlbumImagePending.delete(resolvedUrl);
      resolve(image);
    };
    image.onerror = () => {
      sessionAlbumImagePending.delete(resolvedUrl);
      if (resolvedUrl !== SESSION_ALBUM_FALLBACK_ART_URL) {
        void loadSessionAlbumImage(SESSION_ALBUM_FALLBACK_ART_URL).then(resolve);
      } else {
        resolve(null);
      }
    };
    image.src = resolvedUrl;
  });

  sessionAlbumImagePending.set(resolvedUrl, promise);
  return promise;
}

function sessionAlbumQuadPoint(slot: SessionAlbumSlot, u: number, v: number): { x: number; y: number } {
  const topX = slot.tlX + (slot.trX - slot.tlX) * u;
  const topY = slot.tlY + (slot.trY - slot.tlY) * u;
  const bottomX = slot.blX + (slot.brX - slot.blX) * u;
  const bottomY = slot.blY + (slot.brY - slot.blY) * u;
  return {
    x: topX + (bottomX - topX) * v,
    y: topY + (bottomY - topY) * v,
  };
}

function bleedTrianglePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  amount: number,
): { x: number; y: number } {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.00001) return point;

  return {
    x: point.x + (dx / length) * amount,
    y: point.y + (dy / length) * amount,
  };
}

function drawAffineImageTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  s0: { x: number; y: number },
  s1: { x: number; y: number },
  s2: { x: number; y: number },
  d0: { x: number; y: number },
  d1: { x: number; y: number },
  d2: { x: number; y: number },
): void {
  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denom) < 0.00001) return;

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denom;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denom;

  // Canvas anti-aliasing can leave faint diagonal/vertical seams where the warp mesh triangles meet.
  // Slightly expanding only the clip path lets neighboring triangles overlap by about a pixel while
  // keeping the actual image transform unchanged, which hides the construction lines in playback.
  const bleed = 1.15;
  const center = {
    x: (d0.x + d1.x + d2.x) / 3,
    y: (d0.y + d1.y + d2.y) / 3,
  };
  const c0 = bleedTrianglePoint(d0, center, bleed);
  const c1 = bleedTrianglePoint(d1, center, bleed);
  const c2 = bleedTrianglePoint(d2, center, bleed);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0, image.naturalWidth || image.width, image.naturalHeight || image.height);
  ctx.restore();
}

function drawWarpedAlbumImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, slot: SessionAlbumSlot): void {
  const sourceWidth = image.naturalWidth || image.width || 600;
  const sourceHeight = image.naturalHeight || image.height || 600;
  const grid = 3;

  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const u0 = x / grid;
      const v0 = y / grid;
      const u1 = (x + 1) / grid;
      const v1 = (y + 1) / grid;

      const d00 = sessionAlbumQuadPoint(slot, u0, v0);
      const d10 = sessionAlbumQuadPoint(slot, u1, v0);
      const d01 = sessionAlbumQuadPoint(slot, u0, v1);
      const d11 = sessionAlbumQuadPoint(slot, u1, v1);

      const s00 = { x: u0 * sourceWidth, y: v0 * sourceHeight };
      const s10 = { x: u1 * sourceWidth, y: v0 * sourceHeight };
      const s01 = { x: u0 * sourceWidth, y: v1 * sourceHeight };
      const s11 = { x: u1 * sourceWidth, y: v1 * sourceHeight };

      drawAffineImageTriangle(ctx, image, s00, s10, s11, d00, d10, d11);
      drawAffineImageTriangle(ctx, image, s00, s11, s01, d00, d11, d01);
    }
  }
}

function drawSessionAlbumPolygon(ctx: CanvasRenderingContext2D, slot: SessionAlbumSlot): void {
  ctx.beginPath();
  ctx.moveTo(slot.tlX, slot.tlY);
  ctx.lineTo(slot.trX, slot.trY);
  ctx.lineTo(slot.brX, slot.brY);
  ctx.lineTo(slot.blX, slot.blY);
  ctx.closePath();
}


function drawSessionAlbumFallbackSleeve(ctx: CanvasRenderingContext2D, slot: SessionAlbumSlot): void {
  const bounds = sessionAlbumSlotBounds(slot);
  const gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
  gradient.addColorStop(0, "#2b1a12");
  gradient.addColorStop(0.52, "#111018");
  gradient.addColorStop(1, "#4a2412");

  ctx.save();
  drawSessionAlbumPolygon(ctx, slot);
  ctx.clip();

  ctx.fillStyle = gradient;
  ctx.fillRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);

  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const r = Math.max(8, Math.min(bounds.width, bounds.height) * 0.32);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(5, 5, 8, 0.82)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r * 0.18), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(210, 148, 56, 0.78)";
  ctx.fill();

  ctx.fillStyle = "rgba(241, 185, 93, 0.72)";
  ctx.font = "700 16px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (bounds.width > 42 && bounds.height > 42) {
    ctx.fillText("POCKET", cx, bounds.y + Math.max(12, bounds.height * 0.18));
    ctx.fillText("DJ", cx, bounds.y + Math.max(26, bounds.height * 0.32));
  }

  ctx.restore();
}


function drawSessionAlbumCanvasDepth(ctx: CanvasRenderingContext2D, slot: SessionAlbumSlot): void {
  const center = getSessionAlbumSlotCenter(slot);
  const shadowDx = center.x > ROOM_COORD_WIDTH / 2 ? -4 : 4;

  ctx.save();
  ctx.translate(shadowDx, 5);
  drawSessionAlbumPolygon(ctx, slot);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fill();
  ctx.restore();
}

function drawSessionAlbumCanvasFinish(ctx: CanvasRenderingContext2D, slot: SessionAlbumSlot): void {
  ctx.save();
  drawSessionAlbumPolygon(ctx, slot);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgba(74, 36, 18, ${sessionAlbumSettings.albumWarmBlend})`;
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawSessionAlbumPolygon(ctx, slot);
  ctx.strokeStyle = "rgba(3, 3, 5, 0.82)";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(slot.blX, slot.blY);
  ctx.lineTo(slot.tlX, slot.tlY);
  ctx.lineTo(slot.trX, slot.trY);
  ctx.strokeStyle = "rgba(255, 224, 170, 0.12)";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(slot.trX, slot.trY);
  ctx.lineTo(slot.brX, slot.brY);
  ctx.lineTo(slot.blX, slot.blY);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.46)";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
}

function applySessionAlbumCanvasWarmFilter(ctx: CanvasRenderingContext2D): void {
  ctx.filter = "saturate(0.86) contrast(0.98) brightness(0.90) sepia(0.14)";
}

function clearSessionAlbumWarpCanvas(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#sessionAlbumWarpCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.classList.remove("session-album-warp-visible");
}

function renderSessionAlbumWarpCanvas(): void {
  if (sessionAlbumWarpRenderInProgress) return;
  sessionAlbumWarpRenderInProgress = true;

  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#sessionAlbumWarpCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== ROOM_COORD_WIDTH) canvas.width = ROOM_COORD_WIDTH;
    if (canvas.height !== ROOM_COORD_HEIGHT) canvas.height = ROOM_COORD_HEIGHT;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    canvas.classList.toggle("session-album-warp-visible", sessionAlbumSettings.placeAlbumsInFrames && sessionAlbumSettings.albumWarpMode);
    if (!sessionAlbumSettings.placeAlbumsInFrames || !sessionAlbumSettings.albumWarpMode) return;

    const activeSlots = sessionAlbumSettings.slots
      .slice()
      .sort((a, b) => a.id - b.id)
      .filter((slot) => Boolean(placeholderAlbumForSlot(slot)));

    const fallback = sessionAlbumImageCache.get(SESSION_ALBUM_FALLBACK_ART_URL);
    if (!fallback?.complete || fallback.naturalWidth <= 0) {
      requestSessionAlbumImageLoad(SESSION_ALBUM_FALLBACK_ART_URL);
    }

    activeSlots.forEach((slot) => {
      const placeholder = placeholderAlbumForSlot(slot);
      if (!placeholder) return;

      const displayUrl = placeholder.imageUrl || SESSION_ALBUM_FALLBACK_ART_URL;
      let image = sessionAlbumImageCache.get(displayUrl);

      if (!image?.complete || image.naturalWidth <= 0) {
        requestSessionAlbumImageLoad(displayUrl);
        image = fallback;
      }

      drawSessionAlbumCanvasDepth(ctx, slot);
      if (!image?.complete || image.naturalWidth <= 0) {
        drawSessionAlbumFallbackSleeve(ctx, slot);
        drawSessionAlbumCanvasFinish(ctx, slot);
        return;
      }

      ctx.save();
      applySessionAlbumCanvasWarmFilter(ctx);
      drawWarpedAlbumImage(ctx, image, slot);
      ctx.restore();
      drawSessionAlbumCanvasFinish(ctx, slot);
    });
  } finally {
    sessionAlbumWarpRenderInProgress = false;
  }
}


function renderSessionAlbumSlotGuides(): void {
  const overlay = document.querySelector<SVGSVGElement>("#sessionAlbumGuideOverlay");
  if (!overlay) return;

  const visible = sessionAlbumSettings.showGuides || sessionAlbumSettings.placeAlbumsInFrames;
  overlay.classList.toggle("session-album-guides-visible", visible);
  overlay.innerHTML = "";

  updateSessionAlbumExportText();

  if (sessionAlbumSettings.albumWarpMode) {
    renderSessionAlbumWarpCanvas();
  } else {
    clearSessionAlbumWarpCanvas();
  }

  const frameOverlay = document.querySelector<HTMLElement>("#sessionAlbumFrameOverlay");
  if (frameOverlay) {
    frameOverlay.classList.remove("session-album-frames-visible");
    frameOverlay.innerHTML = "";
  }

  if (!visible) return;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

  const warmFilter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  warmFilter.setAttribute("id", "sessionAlbumWarmFilter");
  warmFilter.setAttribute("color-interpolation-filters", "sRGB");

  const colorMatrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
  colorMatrix.setAttribute("type", "matrix");
  colorMatrix.setAttribute("values", "0.82 0.08 0.03 0 0.025  0.05 0.74 0.04 0 0.012  0.02 0.06 0.66 0 0.000  0 0 0 1 0");
  warmFilter.appendChild(colorMatrix);

  const component = document.createElementNS("http://www.w3.org/2000/svg", "feComponentTransfer");
  const rFunc = document.createElementNS("http://www.w3.org/2000/svg", "feFuncR");
  rFunc.setAttribute("type", "gamma");
  rFunc.setAttribute("amplitude", "0.86");
  rFunc.setAttribute("exponent", "1.08");
  rFunc.setAttribute("offset", "0.02");
  const gFunc = document.createElementNS("http://www.w3.org/2000/svg", "feFuncG");
  gFunc.setAttribute("type", "gamma");
  gFunc.setAttribute("amplitude", "0.80");
  gFunc.setAttribute("exponent", "1.10");
  gFunc.setAttribute("offset", "0.01");
  const bFunc = document.createElementNS("http://www.w3.org/2000/svg", "feFuncB");
  bFunc.setAttribute("type", "gamma");
  bFunc.setAttribute("amplitude", "0.66");
  bFunc.setAttribute("exponent", "1.18");
  bFunc.setAttribute("offset", "0.00");
  component.append(rFunc, gFunc, bFunc);
  warmFilter.appendChild(component);
  defs.appendChild(warmFilter);

  overlay.appendChild(defs);

  for (const slot of sessionAlbumSettings.slots.slice().sort((a, b) => a.id - b.id)) {
    if (sessionAlbumSettings.placeAlbumsInFrames && !sessionAlbumSettings.albumWarpMode) {
      const placeholder = placeholderAlbumForSlot(slot);
      if (placeholder) {
        const clipId = `session-album-clip-${slot.id}`;
        const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clip.setAttribute("id", clipId);

        const clipPolygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        clipPolygon.setAttribute("points", sessionAlbumPoints(slot));
        clip.appendChild(clipPolygon);
        defs.appendChild(clip);

        const bounds = sessionAlbumSlotBounds(slot);
        const imageBleed = 2;
        const center = getSessionAlbumSlotCenter(slot);
        const shadowDx = center.x > ROOM_COORD_WIDTH / 2 ? -4 : 4;
        const shadow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        shadow.setAttribute("points", sessionAlbumPoints(slot));
        shadow.setAttribute("class", "session-album-depth-shadow");
        shadow.setAttribute("transform", `translate(${shadowDx} 5)`);
        overlay.appendChild(shadow);

        const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
        image.setAttribute("href", getSessionAlbumDisplayImageUrl({ ...placeholder, imageUrl: placeholder.imageUrl || SESSION_ALBUM_FALLBACK_ART_URL }));
        image.setAttribute("x", String(bounds.x - imageBleed));
        image.setAttribute("y", String(bounds.y - imageBleed));
        image.setAttribute("width", String(bounds.width + imageBleed * 2));
        image.setAttribute("height", String(bounds.height + imageBleed * 2));
        image.setAttribute("preserveAspectRatio", "none");
        image.setAttribute("clip-path", `url(#${clipId})`);
        image.setAttribute("class", "session-album-placeholder-image");
        image.setAttribute("filter", "url(#sessionAlbumWarmFilter)");
        overlay.appendChild(image);

        const warmOverlay = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        warmOverlay.setAttribute("points", sessionAlbumPoints(slot));
        warmOverlay.setAttribute("class", "session-album-warm-overlay");
        warmOverlay.setAttribute("opacity", String(sessionAlbumSettings.albumWarmBlend));
        overlay.appendChild(warmOverlay);

        const stroke = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        stroke.setAttribute("points", sessionAlbumPoints(slot));
        stroke.setAttribute("class", "session-album-depth-stroke");
        overlay.appendChild(stroke);

        const highlight = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        highlight.setAttribute("points", `${slot.blX},${slot.blY} ${slot.tlX},${slot.tlY} ${slot.trX},${slot.trY}`);
        highlight.setAttribute("class", "session-album-emboss-highlight");
        overlay.appendChild(highlight);

        const shade = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        shade.setAttribute("points", `${slot.trX},${slot.trY} ${slot.brX},${slot.brY} ${slot.blX},${slot.blY}`);
        shade.setAttribute("class", "session-album-emboss-shadow");
        overlay.appendChild(shade);
      }
    }

    if (sessionAlbumSettings.showGuides) {
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("points", sessionAlbumPoints(slot));
      polygon.setAttribute("class", `session-album-guide-polygon ${slot.kind === "partial" ? "session-album-guide-partial" : ""}`.trim());
      overlay.appendChild(polygon);

      const center = getSessionAlbumSlotCenter(slot);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(center.x));
      label.setAttribute("y", String(center.y));
      label.setAttribute("class", "session-album-guide-label");
      label.textContent = slot.label;
      overlay.appendChild(label);
    }
  }
}

function setSessionAlbumTarget(slotId: number, corner: SessionAlbumCornerKey): void {
  sessionAlbumCornerTarget = { slotId, corner };
  const status = document.querySelector<HTMLElement>("#sessionAlbumTargetStatus");
  const slot = sessionAlbumSettings.slots.find((item) => item.id === slotId);
  if (status) {
    const helper = slot?.kind === "partial" ? " Use the visible edge for onscreen clicks, then tune the hidden perspective edge with the offscreen numeric controls." : "";
    status.textContent = slot ? `Click the room to set ${slot.label} ${corner.toUpperCase()} corner.${helper}` : "No corner target selected.";
  }
}

function clearSessionAlbumTarget(): void {
  sessionAlbumCornerTarget = null;
  const status = document.querySelector<HTMLElement>("#sessionAlbumTargetStatus");
  if (status) status.textContent = "No corner target selected.";
}

function updateSessionAlbumSlotCorner(slotId: number, corner: SessionAlbumCornerKey, x: number, y: number): void {
  const slot = sessionAlbumSettings.slots.find((item) => item.id === slotId);
  if (!slot) return;

  const cleanX = clampSessionAlbumX(x, slot.kind);
  const cleanY = clampSessionAlbumY(y, slot.kind);
  let xKey: keyof SessionAlbumSlot;
  let yKey: keyof SessionAlbumSlot;

  if (corner === "tl") {
    slot.tlX = cleanX;
    slot.tlY = cleanY;
    xKey = "tlX";
    yKey = "tlY";
  } else if (corner === "tr") {
    slot.trX = cleanX;
    slot.trY = cleanY;
    xKey = "trX";
    yKey = "trY";
  } else if (corner === "bl") {
    slot.blX = cleanX;
    slot.blY = cleanY;
    xKey = "blX";
    yKey = "blY";
  } else {
    slot.brX = cleanX;
    slot.brY = cleanY;
    xKey = "brX";
    yKey = "brY";
  }

  if (slot.kind === "partial") normalizePartialAlbumMetadata(slot);
  saveSessionAlbumSettings();
  syncSessionAlbumAllCoordinateInputs(slotId);
  renderSessionAlbumSlotGuides();
}

function setSessionAlbumCoordinate(slotId: number, key: keyof SessionAlbumSlot, value: number): void {
  const slot = sessionAlbumSettings.slots.find((item) => item.id === slotId);
  if (!slot) return;
  const nextValue = String(key).endsWith("X") ? clampSessionAlbumX(value, slot.kind) : clampSessionAlbumY(value, slot.kind);
  (slot as unknown as Record<string, number>)[key as string] = nextValue;
  if (slot.kind === "partial") normalizePartialAlbumMetadata(slot);
  saveSessionAlbumSettings();
  renderSessionAlbumSlotGuides();
  syncSessionAlbumAllCoordinateInputs(slotId);
}

function isSessionAlbumHiddenEdgeCorner(slot: SessionAlbumSlot, corner: SessionAlbumCornerKey): boolean {
  if (slot.kind !== "partial") return false;
  const side = slot.partialSide || "left";
  return side === "left" ? corner === "tl" || corner === "bl" : corner === "tr" || corner === "br";
}

function sessionAlbumCornerRole(slot: SessionAlbumSlot, corner: SessionAlbumCornerKey): string {
  if (slot.kind !== "partial") return "Corner";
  return isSessionAlbumHiddenEdgeCorner(slot, corner) ? "Hidden perspective edge" : "Visible room edge";
}

function setSessionAlbumPartialOverhang(slotId: number, valuePercent: number): void {
  const slot = sessionAlbumSettings.slots.find((item) => item.id === slotId);
  if (!slot || slot.kind !== "partial") return;
  slot.partialOverhang = clampPartialAlbumOverhang(valuePercent / 100);
  saveSessionAlbumSettings();
  renderSessionAlbumSlotGuides();
  syncSessionAlbumPartialOverhangInputs(slotId, Math.round(slot.partialOverhang * 100));
}

function syncSessionAlbumCoordinateInputs(slotId: number, key: keyof SessionAlbumSlot, value: number): void {
  document.querySelectorAll<HTMLInputElement>(`[data-session-slot-id="${slotId}"][data-session-key="${String(key)}"]`).forEach((input) => {
    input.value = String(value);
  });
}

function syncSessionAlbumAllCoordinateInputs(slotId: number): void {
  const slot = sessionAlbumSettings.slots.find((item) => item.id === slotId);
  if (!slot) return;
  (["tlX", "tlY", "trX", "trY", "blX", "blY", "brX", "brY"] as Array<keyof SessionAlbumSlot>).forEach((key) => {
    syncSessionAlbumCoordinateInputs(slotId, key, slot[key] as number);
  });
}

function syncSessionAlbumPartialOverhangInputs(slotId: number, value: number): void {
  document.querySelectorAll<HTMLInputElement>(`[data-session-partial-overhang="${slotId}"]`).forEach((input) => {
    input.value = String(value);
  });
}

function renderSessionAlbumSlotPanels(): void {
  const container = document.querySelector<HTMLElement>("#sessionAlbumSlotPanels");
  const showGuides = document.querySelector<HTMLInputElement>("#sessionAlbumShowGuides");
  const placeFrames = document.querySelector<HTMLInputElement>("#sessionAlbumPlaceFrames");
  const albumWarpMode = document.querySelector<HTMLInputElement>("#sessionAlbumWarpMode");
  const albumPixelAmount = document.querySelector<HTMLInputElement>("#sessionAlbumPixelAmount");
  const albumPixelAmountValue = document.querySelector<HTMLElement>("#sessionAlbumPixelAmountValue");
  const albumWarmBlend = document.querySelector<HTMLInputElement>("#sessionAlbumWarmBlend");
  const albumWarmBlendValue = document.querySelector<HTMLElement>("#sessionAlbumWarmBlendValue");
  if (!container) return;

  if (showGuides) showGuides.checked = sessionAlbumSettings.showGuides;
  if (placeFrames) placeFrames.checked = sessionAlbumSettings.placeAlbumsInFrames;
  if (albumWarpMode) albumWarpMode.checked = sessionAlbumSettings.albumWarpMode;
  if (albumPixelAmount) albumPixelAmount.value = sessionAlbumSettings.albumPixelAmount.toFixed(2);
  if (albumPixelAmountValue) albumPixelAmountValue.textContent = sessionAlbumSettings.albumPixelAmount.toFixed(2);
  if (albumWarmBlend) albumWarmBlend.value = sessionAlbumSettings.albumWarmBlend.toFixed(2);
  if (albumWarmBlendValue) albumWarmBlendValue.textContent = sessionAlbumSettings.albumWarmBlend.toFixed(2);
  updateSessionAlbumExportText();

  if (!sessionAlbumSettings.slots.length) {
    container.innerHTML = `<div class="session-album-empty">No album slots defined yet.</div>`;
    return;
  }

  container.innerHTML = sessionAlbumSettings.slots
    .sort((a, b) => a.id - b.id)
    .map((slot) => renderSessionAlbumSlotPanel(slot))
    .join("");

  bindSessionAlbumSlotPanelEvents(container);
}

function renderSessionAlbumSlotPanel(slot: SessionAlbumSlot): string {
  const rows: Array<[SessionAlbumCornerKey, string, keyof SessionAlbumSlot, keyof SessionAlbumSlot]> = [
    ["tl", "Upper left", "tlX", "tlY"],
    ["tr", "Upper right", "trX", "trY"],
    ["bl", "Bottom left", "blX", "blY"],
    ["br", "Bottom right", "brX", "brY"],
  ];

  const targetRows = slot.kind === "partial"
    ? rows.filter(([corner]) => !isSessionAlbumHiddenEdgeCorner(slot, corner))
    : rows;

  const targetButtons = targetRows.map(([corner, label]) => `
    <button class="session-album-target-button" type="button" data-session-target="${slot.id}:${corner}">Select ${label}</button>
  `).join("");

  const partialOverhang = clampPartialAlbumOverhang(slot.partialOverhang ?? DEFAULT_PARTIAL_ALBUM_OVERHANG);
  const partialControls = slot.kind === "partial" ? `
    <div class="session-album-partial-helper">
      <div class="session-album-partial-helper-title">Partial perspective helper</div>
      <p class="session-album-partial-note">Click the visible ${slot.partialSide === "right" ? "left" : "right"} corners on the room. Then tune the hidden ${slot.partialSide === "right" ? "right" : "left"} corners below with negative/beyond-edge X values so the album keeps the wall tilt.</p>
      <label class="session-album-point-control">Auto-fit crop %
        <input class="session-album-range" type="range" min="10" max="85" step="1" value="${Math.round(partialOverhang * 100)}" data-session-partial-overhang="${slot.id}" />
        <input class="session-album-number" type="number" min="10" max="85" step="1" value="${Math.round(partialOverhang * 100)}" data-session-partial-overhang="${slot.id}" />
      </label>
      <button class="session-album-target-button" type="button" data-session-sync-partial="${slot.id}">Auto-place hidden edge from crop %</button>
    </div>
  ` : "";

  const controls = rows.map(([corner, label, xKey, yKey]) => {
    const role = sessionAlbumCornerRole(slot, corner);
    return `
      <div class="session-album-corner-row ${slot.kind === "partial" && isSessionAlbumHiddenEdgeCorner(slot, corner) ? "session-album-hidden-edge-row" : ""}">
        <div class="session-album-corner-title">${label}${slot.kind === "partial" ? `<span>${role}</span>` : ""}</div>
        ${renderSessionAlbumNumberControl(slot, xKey, `${label} X`, ROOM_COORD_WIDTH)}
        ${renderSessionAlbumNumberControl(slot, yKey, `${label} Y`, ROOM_COORD_HEIGHT)}
      </div>
    `;
  }).join("");

  return `
    <details class="session-album-slot-panel session-album-slot-${slot.kind}">
      <summary>${slot.label}<span class="session-album-kind-pill">${slot.kind === "partial" ? "PARTIAL" : "FULL"}</span></summary>
      <div class="session-album-slot-controls">
        ${slot.kind === "partial" ? `<p class="session-album-partial-note">Partial slots keep all four corners. The offscreen edge is manual so the side albums can follow the wall perspective instead of flattening.</p>` : ""}
        ${partialControls}
        <div class="session-album-target-grid">${targetButtons}</div>
        ${controls}
        <button class="session-album-delete-button" type="button" data-session-delete-slot="${slot.id}">Delete ${slot.label}</button>
      </div>
    </details>
  `;
}

function renderSessionAlbumNumberControl(slot: SessionAlbumSlot, key: keyof SessionAlbumSlot, label: string, max: number): string {
  const value = slot[key] as number;
  const isX = String(key).endsWith("X");
  const min = slot.kind === "partial" ? (isX ? -PARTIAL_ALBUM_X_MARGIN : -PARTIAL_ALBUM_Y_MARGIN) : 0;
  const adjustedMax = slot.kind === "partial" ? max + (isX ? PARTIAL_ALBUM_X_MARGIN : PARTIAL_ALBUM_Y_MARGIN) : max;
  return `
    <label class="session-album-point-control">${label}
      <input class="session-album-range" type="range" min="${min}" max="${adjustedMax}" step="1" value="${value}" data-session-slot-id="${slot.id}" data-session-key="${String(key)}" />
      <input class="session-album-number" type="number" min="${min}" max="${adjustedMax}" step="1" value="${value}" data-session-slot-id="${slot.id}" data-session-key="${String(key)}" />
    </label>
  `;
}

function bindSessionAlbumSlotPanelEvents(container: HTMLElement): void {
  container.querySelectorAll<HTMLInputElement>("[data-session-slot-id][data-session-key]").forEach((input) => {
    input.addEventListener("input", () => {
      const slotId = Number(input.dataset.sessionSlotId);
      const key = input.dataset.sessionKey as keyof SessionAlbumSlot;
      setSessionAlbumCoordinate(slotId, key, Number(input.value));
    });
  });

  container.querySelectorAll<HTMLInputElement>("[data-session-partial-overhang]").forEach((input) => {
    input.addEventListener("input", () => {
      setSessionAlbumPartialOverhang(Number(input.dataset.sessionPartialOverhang), Number(input.value));
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-session-sync-partial]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const slotId = Number(button.dataset.sessionSyncPartial);
      const slot = sessionAlbumSettings.slots.find((item) => item.id === slotId);
      if (!slot || slot.kind !== "partial") return;
      syncPartialAlbumHiddenCorners(slot);
      saveSessionAlbumSettings();
      renderSessionAlbumSlotGuides();
      syncSessionAlbumAllCoordinateInputs(slotId);
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-session-target]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const [slotIdRaw, cornerRaw] = String(button.dataset.sessionTarget || "").split(":");
      setSessionAlbumTarget(Number(slotIdRaw), cornerRaw as SessionAlbumCornerKey);
    });
  });

  container.querySelectorAll<HTMLButtonElement>("[data-session-delete-slot]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const slotId = Number(button.dataset.sessionDeleteSlot);
      sessionAlbumSettings = {
        ...sessionAlbumSettings,
        slots: sessionAlbumSettings.slots.filter((slot) => slot.id !== slotId),
      };
      if (sessionAlbumCornerTarget?.slotId === slotId) clearSessionAlbumTarget();
      saveSessionAlbumSettings();
      renderSessionAlbumSlotPanels();
      renderSessionAlbumSlotGuides();
    });
  });
}


function getSessionAlbumPrefix(slot: SessionAlbumSlot): string {
  const match = slot.label.match(/^([A-Za-z]+)-\d+$/);
  return match ? match[1].toUpperCase() : "";
}

function duplicateSessionAlbumPrefix(sourcePrefix: string, targetPrefix: string, offsetX = 0, offsetY = 0): void {
  const source = sessionAlbumSettings.slots
    .filter((slot) => getSessionAlbumPrefix(slot) === sourcePrefix.toUpperCase())
    .sort((a, b) => a.id - b.id);

  if (!source.length) return;

  let nextId = Math.max(sessionAlbumSettings.nextId, ...sessionAlbumSettings.slots.map((slot) => slot.id + 1), 1);
  const targetUpper = targetPrefix.toUpperCase();
  const existingTargetLabels = new Set(
    sessionAlbumSettings.slots
      .filter((slot) => getSessionAlbumPrefix(slot) === targetUpper)
      .map((slot) => slot.label)
  );

  const duplicates = source.map((slot, index) => {
    const numberPart = slot.label.split("-")[1] || String(index + 1);
    const label = `${targetUpper}-${numberPart}`;
    if (existingTargetLabels.has(label)) return null;
    return {
      ...slot,
      id: nextId++,
      label,
      tlX: clampSessionAlbumX(slot.tlX + offsetX, slot.kind),
      tlY: clampSessionAlbumY(slot.tlY + offsetY, slot.kind),
      trX: clampSessionAlbumX(slot.trX + offsetX, slot.kind),
      trY: clampSessionAlbumY(slot.trY + offsetY, slot.kind),
      blX: clampSessionAlbumX(slot.blX + offsetX, slot.kind),
      blY: clampSessionAlbumY(slot.blY + offsetY, slot.kind),
      brX: clampSessionAlbumX(slot.brX + offsetX, slot.kind),
      brY: clampSessionAlbumY(slot.brY + offsetY, slot.kind),
    };
  }).filter((slot): slot is SessionAlbumSlot => Boolean(slot));

  sessionAlbumSettings = {
    ...sessionAlbumSettings,
    nextId,
    showGuides: true,
    slots: [...sessionAlbumSettings.slots, ...duplicates],
  };

  saveSessionAlbumSettings();
  renderSessionAlbumSlotPanels();
  renderSessionAlbumSlotGuides();
}

function moveSessionAlbumPrefix(prefix: string, dx: number, dy: number): void {
  const cleanPrefix = prefix.trim().toUpperCase();
  if (!cleanPrefix) return;

  sessionAlbumSettings.slots.forEach((slot) => {
    if (getSessionAlbumPrefix(slot) !== cleanPrefix) return;
    slot.tlX = clampSessionAlbumX(slot.tlX + dx, slot.kind);
    slot.tlY = clampSessionAlbumY(slot.tlY + dy, slot.kind);
    slot.trX = clampSessionAlbumX(slot.trX + dx, slot.kind);
    slot.trY = clampSessionAlbumY(slot.trY + dy, slot.kind);
    slot.blX = clampSessionAlbumX(slot.blX + dx, slot.kind);
    slot.blY = clampSessionAlbumY(slot.blY + dy, slot.kind);
    slot.brX = clampSessionAlbumX(slot.brX + dx, slot.kind);
    slot.brY = clampSessionAlbumY(slot.brY + dy, slot.kind);
  });

  saveSessionAlbumSettings();
  renderSessionAlbumSlotPanels();
  renderSessionAlbumSlotGuides();
}


function bindSessionWallAlbumControls(): void {
  const showGuides = document.querySelector<HTMLInputElement>("#sessionAlbumShowGuides");
  const placeFrames = document.querySelector<HTMLInputElement>("#sessionAlbumPlaceFrames");
  const albumWarpMode = document.querySelector<HTMLInputElement>("#sessionAlbumWarpMode");
  const albumPixelAmount = document.querySelector<HTMLInputElement>("#sessionAlbumPixelAmount");
  const albumPixelAmountValue = document.querySelector<HTMLElement>("#sessionAlbumPixelAmountValue");
  const albumWarmBlend = document.querySelector<HTMLInputElement>("#sessionAlbumWarmBlend");
  const albumWarmBlendValue = document.querySelector<HTMLElement>("#sessionAlbumWarmBlendValue");
  const copyExport = document.querySelector<HTMLButtonElement>("#sessionAlbumCopyExport");
  const addSlot = document.querySelector<HTMLButtonElement>("#sessionAlbumAddSlot");
  const addPartialLeft = document.querySelector<HTMLButtonElement>("#sessionAlbumAddPartialLeft");
  const addPartialRight = document.querySelector<HTMLButtonElement>("#sessionAlbumAddPartialRight");
  const duplicateAToB = document.querySelector<HTMLButtonElement>("#sessionAlbumDuplicateAToB");
  const groupPrefix = document.querySelector<HTMLInputElement>("#sessionAlbumGroupPrefix");
  const groupMoveX = document.querySelector<HTMLInputElement>("#sessionAlbumGroupMoveX");
  const groupMoveY = document.querySelector<HTMLInputElement>("#sessionAlbumGroupMoveY");
  const applyGroupMove = document.querySelector<HTMLButtonElement>("#sessionAlbumApplyGroupMove");
  const room = document.querySelector<HTMLElement>(".room");

  requestSessionAlbumImageLoad(SESSION_ALBUM_FALLBACK_ART_URL);

  showGuides?.addEventListener("change", () => {
    sessionAlbumSettings = { ...sessionAlbumSettings, showGuides: Boolean(showGuides.checked) };
    saveSessionAlbumSettings();
    renderSessionAlbumSlotGuides();
  });

  placeFrames?.addEventListener("change", () => {
    sessionAlbumSettings = {
      ...sessionAlbumSettings,
      placeAlbumsInFrames: Boolean(placeFrames.checked),
      v64wQuintessentialDefault: true,
    };
    saveSessionAlbumSettings();
    if (sessionAlbumSettings.placeAlbumsInFrames) {
      assignWallAlbumsForRefresh();
      void loadSessionAlbumPlaceholderAlbums();
    }
    renderSessionAlbumSlotGuides();
  });

  albumWarpMode?.addEventListener("change", () => {
    sessionAlbumSettings = { ...sessionAlbumSettings, albumWarpMode: Boolean(albumWarpMode.checked) };
    saveSessionAlbumSettings();
    requestSessionAlbumImageLoad(SESSION_ALBUM_FALLBACK_ART_URL);
    scheduleSessionAlbumRender();
  });

  albumPixelAmount?.addEventListener("input", () => {
    const amount = clamp01(Number(albumPixelAmount.value));
    sessionAlbumSettings = { ...sessionAlbumSettings, albumPixelAmount: amount };
    if (albumPixelAmountValue) albumPixelAmountValue.textContent = amount.toFixed(2);
    saveSessionAlbumSettings();
    renderSessionAlbumSlotGuides();
  });

  albumWarmBlend?.addEventListener("input", () => {
    const amount = clamp01(Number(albumWarmBlend.value));
    sessionAlbumSettings = { ...sessionAlbumSettings, albumWarmBlend: amount };
    if (albumWarmBlendValue) albumWarmBlendValue.textContent = amount.toFixed(2);
    saveSessionAlbumSettings();
    renderSessionAlbumSlotGuides();
  });

  copyExport?.addEventListener("click", () => {
    void copySessionAlbumExport();
  });

  duplicateAToB?.addEventListener("click", () => {
    duplicateSessionAlbumPrefix("A", "B", 460, 0);
  });

  applyGroupMove?.addEventListener("click", () => {
    moveSessionAlbumPrefix(groupPrefix?.value || "B", Number(groupMoveX?.value || 0), Number(groupMoveY?.value || 0));
  });

  function addSessionAlbumSlotToSettings(slot: SessionAlbumSlot): void {
    sessionAlbumSettings = {
      ...sessionAlbumSettings,
      nextId: slot.id + 1,
      showGuides: true,
      slots: [...sessionAlbumSettings.slots, slot],
    };
    saveSessionAlbumSettings();
    renderSessionAlbumSlotPanels();
    renderSessionAlbumSlotGuides();
    if (sessionAlbumSettings.placeAlbumsInFrames) void loadSessionAlbumPlaceholderAlbums();
  }

  addSlot?.addEventListener("click", () => {
    addSessionAlbumSlotToSettings(createSessionAlbumSlot());
  });

  addPartialLeft?.addEventListener("click", () => {
    addSessionAlbumSlotToSettings(createPartialSessionAlbumSlot("left"));
  });

  addPartialRight?.addEventListener("click", () => {
    addSessionAlbumSlotToSettings(createPartialSessionAlbumSlot("right"));
  });

  assignWallAlbumsForRefresh();
  if (sessionAlbumSettings.placeAlbumsInFrames) void loadSessionAlbumPlaceholderAlbums();

  room?.addEventListener("click", (event) => {
    if (!sessionAlbumCornerTarget) return;
    const rect = room.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ROOM_COORD_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * ROOM_COORD_HEIGHT;
    updateSessionAlbumSlotCorner(sessionAlbumCornerTarget.slotId, sessionAlbumCornerTarget.corner, x, y);
    clearSessionAlbumTarget();
  });

  renderSessionAlbumSlotPanels();
  renderSessionAlbumSlotGuides();
}


async function boot(): Promise<void> {
  if (!loadClientId()) saveClientId(STANDARD_SPOTIFY_CLIENT_ID);
  applyStringLightPresetMigration();
  updateDynamicCeilingReveal();
  window.addEventListener("resize", updateDynamicCeilingReveal, { passive: true });
  renderShell(state);
  setReactiveRoomPalette(DEFAULT_REACTIVE_ROOM_PALETTE);
  dj = new DjController(qs("#djSprite"), qs("#modePill"));
  bindControls();
  bindFloorControlsLock();
  updateFloorControlsLockUi();
  updateSidePanelLockUi();
  updateLyricsToggleUi(lyricsState.status, lyricsEnabled);
  scheduleSidePanelAutoHide();
  bindRoomUtilityControls();
  bindStringLightControls();
  bindAmbientTwinkleControls();
  bindSessionWallAlbumControls();
  applyClockDisabledDefaultMigration();
  applyMixerLedTuningMigration();
  applyTallLyricCalibrationMigration();
  applyFinalTallLyricCalibrationMigration();
  applyPlacedActiveAlbumTuningMigration();
  applyAmbientTwinkleVisibilityMigration();
  applyPlacedActiveAlbumDimMigration();
  applyPlacedActiveAlbumOpaqueMigration();
  applyAmbientTwinkleUserEditMigration();
  applyRoomUtilitySettings();

  if (state.spotifyClientId) {
    try {
      await handleSpotifyCallback(state.spotifyClientId, state.redirectUri);
      schedulePostConnectPlaybackRefresh();
    } catch (error) {
      lastPollError = error instanceof Error ? error.message : String(error);
      console.warn(lastPollError);
    }
  }

  if (loadTokens()) {
    await pollSpotifyNow();
    void initializePocketDjBrowserDevice();
    void refreshSpotifyDevices();
    schedulePostConnectPlaybackRefresh();
    void loadHome();
    void loadPlaylists();
    scheduleNextPoll(6000);
  } else {
    updatePlaybackUi(state.playback, state.debugOpen);
  }

  requestAnimationFrame(tick);
}




function syncAspectModeControls(): void {
  const enabled = roomUtility.roomFillStretchMode;
  const aspectButton = document.querySelector<HTMLButtonElement>("#aspectModeToggle");
  const devCheckbox = document.querySelector<HTMLInputElement>("#roomFillStretchMode");

  if (aspectButton) {
    aspectButton.textContent = enabled ? "FILL" : "WIDE";
    aspectButton.classList.toggle("aspect-pill-active", enabled);
    aspectButton.setAttribute("aria-pressed", String(enabled));
    aspectButton.title = enabled ? "Fill mode: clamped 1.25 to 2.25" : "Wide mode: locked 16:9";
  }

  if (devCheckbox) devCheckbox.checked = enabled;
}

function setRoomFillStretchMode(enabled: boolean): void {
  roomUtility = { ...roomUtility, roomFillStretchMode: enabled };
  applyRoomUtilitySettings();
  syncAspectModeControls();
  saveRoomUtilitySettings();
}



function toggleMenu2FromPocketClicks(): void {
  aspectPocketClickCount += 1;
  if (aspectPocketClickTimer) window.clearTimeout(aspectPocketClickTimer);
  aspectPocketClickTimer = window.setTimeout(() => {
    aspectPocketClickCount = 0;
    aspectPocketClickTimer = null;
  }, 1100);

  if (aspectPocketClickCount >= 5) {
    aspectPocketClickCount = 0;
    if (aspectPocketClickTimer) {
      window.clearTimeout(aspectPocketClickTimer);
      aspectPocketClickTimer = null;
    }
    setMenu2Open(!menu2Open);
  }
}

function schedulePostConnectPlaybackRefresh(): void {
  window.setTimeout(() => {
    if (!useDemo && loadTokens()) void pollSpotifyNow();
  }, 600);

  window.setTimeout(() => {
    if (!useDemo && loadTokens()) void pollSpotifyNow();
  }, 1800);
}



function updateMixerLyricsLedStatus(status: LyricsPayload["status"], enabled: boolean): void {
  const root = document.documentElement;
  const led = document.querySelector<HTMLElement>("#mixerLyricsLed");
  const nextStatus = !enabled
    ? "off"
    : status === "loading"
      ? "searching"
      : status === "found"
        ? "found"
        : status === "idle"
          ? "idle"
          : "missing";

  root.dataset.lyricsStatus = nextStatus;
  root.classList.toggle("lyrics-status-found", nextStatus === "found");
  root.classList.toggle("lyrics-status-searching", nextStatus === "searching");
  root.classList.toggle("lyrics-status-missing", nextStatus === "missing");
  root.classList.toggle("lyrics-status-idle", nextStatus === "idle" || nextStatus === "off");

  if (!led) return;
  const readable =
    nextStatus === "found"
      ? "Lyrics: synced lyrics found"
      : nextStatus === "searching"
        ? "Lyrics: searching"
        : nextStatus === "missing"
          ? "Lyrics: unavailable"
          : "Lyrics: idle";
  led.title = readable;
  led.setAttribute("aria-label", readable);
}

function updateMarqueeLyricsAvailability(status: LyricsPayload["status"], enabled: boolean): void {
  const classes = [
    "lyrics-marquee-found",
    "lyrics-marquee-searching",
    "lyrics-marquee-unavailable",
  ];

  document.body.classList.remove(...classes);
  updateMixerLyricsLedStatus(status, enabled);

  if (!enabled) {
    document.body.classList.add("lyrics-marquee-unavailable");
    return;
  }

  if (status === "loading") {
    document.body.classList.add("lyrics-marquee-searching");
    return;
  }

  if (status === "found") {
    document.body.classList.add("lyrics-marquee-found");
    return;
  }

  document.body.classList.add("lyrics-marquee-unavailable");
}


function setCompactPanelEnabled(enabled: boolean): void {
  compactPanelEnabled = enabled;
  const card = document.querySelector<HTMLElement>("#controlCard");
  const button = document.querySelector<HTMLButtonElement>("#compactPanelToggle");
  card?.classList.toggle("control-card-compact-mode", enabled);
  button?.classList.toggle("compact-pill-active", enabled);
  if (button) {
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "FULL" : "COMPACT";
  }
  syncMenu2Pills();
}

type ScreenWakeLockSentinelLike = EventTarget & {
  readonly released: boolean;
  release: () => Promise<void>;
};

type NavigatorWithScreenWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinelLike>;
  };
};

let screenWakeLock: ScreenWakeLockSentinelLike | null = null;
let screenWakeLockWanted = false;

function isAppFullscreen(): boolean {
  return document.fullscreenElement === document.documentElement;
}

function supportsScreenWakeLock(): boolean {
  return Boolean((navigator as NavigatorWithScreenWakeLock).wakeLock?.request);
}

async function requestScreenWakeLock(): Promise<void> {
  if (!screenWakeLockWanted || !isAppFullscreen() || document.visibilityState !== "visible") return;
  if (screenWakeLock && !screenWakeLock.released) return;

  const wakeLock = (navigator as NavigatorWithScreenWakeLock).wakeLock;
  if (!wakeLock?.request) return;

  try {
    screenWakeLock = await wakeLock.request("screen");
    screenWakeLock.addEventListener("release", () => {
      screenWakeLock = null;
    }, { once: true });
  } catch (error) {
    screenWakeLock = null;
    console.warn("Screen wake lock is not available right now", error);
  }
}

async function releaseScreenWakeLock(): Promise<void> {
  const lock = screenWakeLock;
  screenWakeLock = null;
  if (!lock || lock.released) return;

  try {
    await lock.release();
  } catch (error) {
    console.warn("Could not release screen wake lock", error);
  }
}

function syncScreenWakeLockForFullscreen(): void {
  const active = isAppFullscreen();
  screenWakeLockWanted = active;

  if (active) {
    void requestScreenWakeLock();
  } else {
    void releaseScreenWakeLock();
  }
}

function handleFullscreenChange(): void {
  updateFullscreenUi();
  syncScreenWakeLockForFullscreen();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible" && screenWakeLockWanted && isAppFullscreen()) {
    void requestScreenWakeLock();
  }
}

function updateFullscreenUi(): void {
  const active = isAppFullscreen();
  const sideButton = document.querySelector<HTMLButtonElement>("#fullscreenToggle");
  const floorButton = document.querySelector<HTMLButtonElement>("#floorFullscreenToggle");
  document.documentElement.classList.toggle("pocketdj-fullscreen-active", active);
  document.documentElement.classList.toggle("pocketdj-wake-lock-supported", supportsScreenWakeLock());

  if (sideButton) {
    sideButton.classList.toggle("fullscreen-pill-active", active);
    sideButton.setAttribute("aria-pressed", String(active));
    sideButton.textContent = active ? "EXIT" : "FULL";
    sideButton.title = active ? "Exit fullscreen" : "Enter fullscreen";
    sideButton.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
  }

  if (floorButton) {
    floorButton.classList.toggle("floor-controls-fullscreen-active", active);
    floorButton.setAttribute("aria-pressed", String(active));
    floorButton.title = active ? "Exit fullscreen" : "Enter fullscreen";
    floorButton.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
  }
}

async function toggleAppFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else {
      lastPollError = "Fullscreen is not available in this browser.";
      console.warn(lastPollError);
    }
  } catch (error) {
    lastPollError = error instanceof Error ? error.message : String(error);
    console.warn("Could not toggle fullscreen", error);
  } finally {
    handleFullscreenChange();
  }
}

function revealDevToolsByTripleClick(): void {
  devToolsClickCount += 1;
  if (devToolsClickTimer) window.clearTimeout(devToolsClickTimer);
  devToolsClickTimer = window.setTimeout(() => {
    devToolsClickCount = 0;
    devToolsClickTimer = null;
  }, 700);

  if (devToolsClickCount >= 3) {
    devToolsClickCount = 0;
    if (devToolsClickTimer) {
      window.clearTimeout(devToolsClickTimer);
      devToolsClickTimer = null;
    }

    const devTools = document.querySelector<HTMLDetailsElement>("#devToolsPanel");
    if (devTools) {
      devTools.classList.toggle("dev-tools-visible");
      devTools.open = devTools.classList.contains("dev-tools-visible");
    }
  }
}



function revealDevToolsByLockClicks(): void {
  devToolsLockClickCount += 1;
  if (devToolsLockClickTimer) window.clearTimeout(devToolsLockClickTimer);
  devToolsLockClickTimer = window.setTimeout(() => {
    devToolsLockClickCount = 0;
    devToolsLockClickTimer = null;
  }, 1100);

  if (devToolsLockClickCount >= 5) {
    devToolsLockClickCount = 0;
    if (devToolsLockClickTimer) {
      window.clearTimeout(devToolsLockClickTimer);
      devToolsLockClickTimer = null;
    }

    const devTools = document.querySelector<HTMLDetailsElement>("#devToolsPanel");
    if (devTools) {
      devTools.classList.toggle("dev-tools-visible");
      devTools.open = devTools.classList.contains("dev-tools-visible");
    }
  }
}



function setMenu2Status(message: string, busy = false): void {
  const status = document.querySelector<HTMLElement>("#menu2Status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("menu2-status-busy", busy);
}

function applyMenu2Settings(): void {
  const panel = document.querySelector<HTMLElement>("#menu2Panel");
  if (!panel) return;
  panel.classList.toggle("menu2-closed", !menu2Open);
  panel.classList.toggle("menu2-open", menu2Open);
  panel.classList.toggle("menu2-locked", menu2Locked);
  panel.classList.toggle("menu2-style-pocket", menu2StyleMode === "pocket");
  panel.classList.toggle("menu2-style-spotify", menu2StyleMode === "spotify");
  panel.classList.toggle("menu2-style-web", menu2StyleMode === "web");
  panel.classList.toggle("menu2-mode-compact", menu2PanelMode === "compact");
  panel.classList.toggle("menu2-mode-full", menu2PanelMode === "full");
  panel.classList.toggle("menu2-art-large", menu2ArtSize === "large");
  panel.classList.toggle("menu2-art-medium", menu2ArtSize === "medium");
  panel.classList.toggle("menu2-art-small", menu2ArtSize === "small");
  panel.setAttribute("aria-hidden", String(!menu2Open));
  document.documentElement.classList.toggle("menu2-open", menu2Open);
  document.documentElement.classList.toggle("menu2-bubble-ready", menu2HasOpened && !menu2Open);
  document.documentElement.classList.toggle("menu2-locked", menu2Locked);

  const lockPill = document.querySelector<HTMLButtonElement>("#menu2LockPill");
  if (lockPill) {
    lockPill.classList.toggle("menu2-pill-active", menu2Locked);
    lockPill.setAttribute("aria-pressed", String(menu2Locked));
    lockPill.title = menu2Locked ? "Menu locked open" : "Menu unlocked";
  }
  syncMenu2Bubble();

  const styleSelect = document.querySelector<HTMLSelectElement>("#menu2StyleMode");
  const artSelect = document.querySelector<HTMLSelectElement>("#menu2ArtSize");
  const panelModeSelect = document.querySelector<HTMLSelectElement>("#menu2PanelMode");
  if (styleSelect) styleSelect.value = menu2StyleMode;
  if (artSelect) artSelect.value = menu2ArtSize;
  if (panelModeSelect) panelModeSelect.value = menu2PanelMode;

  const devTab = document.querySelector<HTMLButtonElement>("#menu2DevTab");
  if (devTab) devTab.hidden = !menu2DevUnlocked;
  if (!menu2DevUnlocked && menu2ActiveTab === "dev") menu2ActiveTab = "now";

  document.querySelectorAll<HTMLElement>(".menu2-tab").forEach((tab) => {
    tab.classList.toggle("menu2-tab-active", tab.dataset.menu2Tab === menu2ActiveTab);
  });
  document.querySelectorAll<HTMLElement>(".menu2-pane").forEach((pane) => pane.classList.remove("menu2-pane-active"));
  document.querySelector<HTMLElement>(`#menu2${menu2ActiveTab[0].toUpperCase()}${menu2ActiveTab.slice(1)}Pane`)?.classList.add("menu2-pane-active");
}

function setMenu2Open(open: boolean): void {
  menu2Open = open;
  if (open) {
    menu2HasOpened = true;
    localStorage.setItem("pocketdj-menu2-has-opened", "true");
  }
  applyMenu2Settings();
  if (open) {
    renderMenu2NowPlaying();
    void refreshMenu2ActiveTab();
  }
}

function setMenu2Tab(tab: typeof menu2ActiveTab): void {
  if (tab === "dev" && !menu2DevUnlocked) return;
  menu2ActiveTab = tab;
  applyMenu2Settings();
  void refreshMenu2ActiveTab();
}

async function refreshMenu2ActiveTab(): Promise<void> {
  if (!menu2Open) return;
  if (menu2ActiveTab === "queue") await loadMenu2Queue();
  if (menu2ActiveTab === "playlists") await loadMenu2Playlists(false);
  if (menu2ActiveTab === "devices") await loadMenu2Devices();
}


function menu2Icon(name: "lyrics" | "play" | "pause" | "prev" | "next" | "volume" | "lock" | "unlock" | "compact" | "fullscreen" | "shuffle" | "repeat" | "queue"): string {
  const paths: Record<typeof name, string> = {
    lyrics: '<path d="M9 18V6l10-2v11"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="15" r="2"/>',
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5h3v14H8zM14 5h3v14h-3z" fill="currentColor" stroke="none"/>',
    prev: '<path d="M6 5v14M18 6l-9 6 9 6z" fill="currentColor" stroke="none"/>',
    next: '<path d="M18 5v14M6 6l9 6-9 6z" fill="currentColor" stroke="none"/>',
    volume: '<path d="M4 10v4h4l5 4V6l-5 4H4z"/><path d="M16 9c1 1 1 5 0 6M19 7c2 3 2 7 0 10"/>',
    lock: '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V8a4 4 0 0 1 8 0v2"/>',
    unlock: '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V8a4 4 0 0 1 7-2.6"/>',
    compact: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    shuffle: '<path d="M4 7h3l10 10h3M17 7h3M17 7l3-3M17 7l3 3M4 17h3l3-3"/>',
    repeat: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
    queue: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  };
  return `<svg class="menu2-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

function menu2PlaylistIdFromUri(uri: string | null | undefined): string {
  const clean = uri || "";
  const match = clean.match(/spotify:playlist:([^:]+)/);
  return match?.[1] || "";
}

function menu2ContextPlaylist(): SpotifyCatalogPlaylist | null {
  const contextUri = state.playback.playbackContextUri || "";
  if (menu2SelectedPlaylist && menu2SelectedPlaylist.uri === contextUri) return menu2SelectedPlaylist;
  const id = menu2PlaylistIdFromUri(contextUri);
  return menu2PlaylistCache.find((playlist) => playlist.id === id || playlist.uri === contextUri) || null;
}

function menu2TrackRow(track: SpotifyCatalogTrack, index?: number, contextUri?: string): string {
  const playAction = contextUri ? "play-context-track" : "play-uri";
  return `
    <article class="menu2-row menu2-track-result-row" data-uri="${escapeHtmlInline(track.uri)}">
      <div class="menu2-row-index">${typeof index === "number" ? index + 1 : "♪"}</div>
      <div class="menu2-row-art">${track.albumArtUrl ? `<img src="${escapeHtmlInline(track.albumArtUrl)}" alt="" />` : "♪"}</div>
      <div class="menu2-row-copy">
        <strong>${escapeHtmlInline(track.name)}</strong>
        <span>${escapeHtmlInline(track.artists)}${track.album ? ` • ${escapeHtmlInline(track.album)}` : ""}</span>
      </div>
      <button class="menu2-mini-action menu2-icon-action" type="button" data-menu2-action="${playAction}" data-uri="${escapeHtmlInline(track.uri)}" ${contextUri ? `data-context-uri="${escapeHtmlInline(contextUri)}"` : ""} aria-label="Play track" title="Play">${menu2Icon("play")}</button>
      <button class="menu2-mini-action secondary menu2-icon-action" type="button" data-menu2-action="queue-uri" data-uri="${escapeHtmlInline(track.uri)}" aria-label="Add to queue" title="Queue">${menu2Icon("queue")}</button>
    </article>`;
}

function menu2PlaylistRow(playlist: SpotifyCatalogPlaylist): string {
  return `
    <article class="menu2-row menu2-playlist-row" data-uri="${escapeHtmlInline(playlist.uri)}" data-playlist-id="${escapeHtmlInline(playlist.id)}">
      <div class="menu2-row-art">${playlist.imageUrl ? `<img src="${escapeHtmlInline(playlist.imageUrl)}" alt="" />` : "▦"}</div>
      <div class="menu2-row-copy">
        <button class="menu2-row-title-button" type="button" data-menu2-action="open-playlist" data-playlist-id="${escapeHtmlInline(playlist.id)}">${escapeHtmlInline(playlist.name)}</button>
        <span>${escapeHtmlInline(playlist.owner)} • ${playlist.trackCount} tracks</span>
      </div>
      <button class="menu2-mini-action menu2-icon-action" type="button" data-menu2-action="play-context-order" data-uri="${escapeHtmlInline(playlist.uri)}" data-playlist-id="${escapeHtmlInline(playlist.id)}" aria-label="Play playlist in order" title="Play in order">${menu2Icon("play")}</button>
      <button class="menu2-mini-action secondary menu2-icon-action" type="button" data-menu2-action="shuffle-context" data-uri="${escapeHtmlInline(playlist.uri)}" data-playlist-id="${escapeHtmlInline(playlist.id)}" aria-label="Shuffle playlist" title="Shuffle">${menu2Icon("shuffle")}</button>
    </article>`;
}

function menu2AlbumRow(album: SpotifyCatalogAlbum): string {
  return `
    <article class="menu2-row menu2-album-row" data-uri="${escapeHtmlInline(album.uri)}">
      <div class="menu2-row-art">${album.imageUrl ? `<img src="${escapeHtmlInline(album.imageUrl)}" alt="" />` : "▧"}</div>
      <div class="menu2-row-copy"><strong>${escapeHtmlInline(album.name)}</strong><span>${escapeHtmlInline(album.artists)}${album.releaseYear ? ` • ${escapeHtmlInline(album.releaseYear)}` : ""}</span></div>
      <button class="menu2-mini-action menu2-icon-action" type="button" data-menu2-action="play-context-order" data-uri="${escapeHtmlInline(album.uri)}" aria-label="Play album" title="Play">${menu2Icon("play")}</button>
      <button class="menu2-mini-action secondary menu2-icon-action" type="button" data-menu2-action="shuffle-context" data-uri="${escapeHtmlInline(album.uri)}" aria-label="Shuffle album" title="Shuffle">${menu2Icon("shuffle")}</button>
    </article>`;
}

function menu2ArtistRow(artist: SpotifyCatalogArtist): string {
  return `
    <article class="menu2-row menu2-artist-row">
      <div class="menu2-row-art menu2-row-art-round">${artist.imageUrl ? `<img src="${escapeHtmlInline(artist.imageUrl)}" alt="" />` : "◎"}</div>
      <div class="menu2-row-copy"><strong>${escapeHtmlInline(artist.name)}</strong><span>Artist</span></div>
      <button class="menu2-mini-action" type="button" data-menu2-action="artist-top" data-artist-id="${escapeHtmlInline(artist.id)}" data-artist-name="${escapeHtmlInline(artist.name)}">Top tracks</button>
    </article>`;
}

function renderMenu2NowPlaying(): void {
  const track = state.playback;
  const art = document.querySelector<HTMLElement>("#menu2AlbumArt");
  if (art) art.innerHTML = track.albumArtUrl ? `<img src="${escapeHtmlInline(track.albumArtUrl)}" alt="" />` : "<span>♪</span>";
  const title = document.querySelector<HTMLElement>("#menu2TrackTitle");
  const artist = document.querySelector<HTMLElement>("#menu2TrackArtist");
  const album = document.querySelector<HTMLElement>("#menu2TrackAlbum");
  const context = document.querySelector<HTMLElement>("#menu2PlaybackContext");
  if (title) title.textContent = track.title;
  if (artist) artist.textContent = track.artist;
  if (album) album.textContent = track.album ? `Album • ${track.album}` : "";
  if (context) {
    const playlist = menu2ContextPlaylist();
    if (playlist) {
      context.innerHTML = `<button class="menu2-context-link" type="button" data-menu2-action="open-playlist" data-playlist-id="${escapeHtmlInline(playlist.id)}">Playing from ${escapeHtmlInline(playlist.name)}</button>`;
    } else if (track.playbackContextType && track.playbackContextUri) {
      context.textContent = `Playing from ${track.playbackContextType}`;
    } else {
      context.textContent = "Playing from Spotify";
    }
  }

  const progressMs = getEstimatedPlaybackProgress(track);
  const percent = track.durationMs > 0 ? Math.min(100, (progressMs / track.durationMs) * 100) : 0;
  const fill = document.querySelector<HTMLElement>("#menu2ProgressFill");
  const now = document.querySelector<HTMLElement>("#menu2ProgressNow");
  const end = document.querySelector<HTMLElement>("#menu2ProgressEnd");
  const seek = document.querySelector<HTMLElement>("#menu2SeekBar");
  if (fill) fill.style.width = `${percent}%`;
  if (now) now.textContent = formatDurationMs(progressMs) || "0:00";
  if (end) end.textContent = formatDurationMs(track.durationMs) || "0:00";
  if (seek) seek.setAttribute("aria-valuenow", String(Math.round(percent)));
  const playIcon = document.querySelector<HTMLElement>("#menu2PlayIcon");
  if (playIcon) playIcon.innerHTML = track.isPlaying ? menu2Icon("pause") : menu2Icon("play");
  const shuffle = document.querySelector<HTMLElement>("#menu2Shuffle");
  const prev = document.querySelector<HTMLElement>("#menu2Prev");
  const next = document.querySelector<HTMLElement>("#menu2Next");
  const repeat = document.querySelector<HTMLElement>("#menu2Repeat");
  if (shuffle) shuffle.innerHTML = menu2Icon("shuffle");
  if (prev) prev.innerHTML = menu2Icon("prev");
  if (next) next.innerHTML = menu2Icon("next");
  if (repeat) repeat.innerHTML = menu2Icon("repeat");
  syncMenu2Pills();
}

function syncMenu2Pills(): void {
  const lyrics = document.querySelector<HTMLButtonElement>("#menu2LyricsPill");
  const connect = document.querySelector<HTMLButtonElement>("#menu2ConnectPill");
  const compact = document.querySelector<HTMLButtonElement>("#menu2CompactPill");
  const fullscreen = document.querySelector<HTMLButtonElement>("#menu2FullscreenPill");
  if (lyrics) {
    lyrics.innerHTML = menu2Icon("lyrics");
    lyrics.classList.toggle("menu2-pill-active", lyricsEnabled);
    lyrics.title = lyricsEnabled ? "Lyrics on" : "Lyrics off";
  }
  if (connect) {
    connect.textContent = "";
    connect.classList.toggle("menu2-pill-active", state.playback.isAuthenticated);
    connect.title = state.playback.isAuthenticated ? "Connected" : "Connect Spotify";
  }
  if (compact) {
    compact.innerHTML = menu2Icon("compact");
    compact.classList.toggle("menu2-pill-active", menu2PanelMode === "compact");
    compact.title = menu2PanelMode === "compact" ? "Switch Menu 2.0 to full panel" : "Switch Menu 2.0 to compact";
    compact.setAttribute("aria-pressed", String(menu2PanelMode === "compact"));
  }
  if (fullscreen) {
    fullscreen.innerHTML = menu2Icon("fullscreen");
    fullscreen.classList.toggle("menu2-pill-active", isAppFullscreen());
  }
  const lock = document.querySelector<HTMLButtonElement>("#menu2LockPill");
  if (lock) lock.innerHTML = menu2Icon(menu2Locked ? "lock" : "unlock");
  syncMenu2Bubble();
}

function syncMenu2Bubble(): void {
  const bubble = document.querySelector<HTMLElement>("#menu2Bubble");
  if (bubble) bubble.setAttribute("aria-hidden", String(!(menu2HasOpened && !menu2Open)));
  const lyrics = document.querySelector<HTMLButtonElement>("#menu2BubbleLyrics");
  const play = document.querySelector<HTMLButtonElement>("#menu2BubblePlay");
  if (lyrics) {
    lyrics.innerHTML = menu2Icon("lyrics");
    lyrics.classList.toggle("menu2-bubble-active", lyricsEnabled);
  }
  const prev = document.querySelector<HTMLButtonElement>("#menu2BubblePrev");
  const next = document.querySelector<HTMLButtonElement>("#menu2BubbleNext");
  const volume = document.querySelector<HTMLButtonElement>("#menu2BubbleVolume");
  if (prev) prev.innerHTML = menu2Icon("prev");
  if (play) play.innerHTML = state.playback.isPlaying ? menu2Icon("pause") : menu2Icon("play");
  if (next) next.innerHTML = menu2Icon("next");
  if (volume) volume.innerHTML = menu2Icon("volume");
}

async function loadMenu2Queue(): Promise<void> {
  const container = document.querySelector<HTMLElement>("#menu2QueueResults");
  if (!container) return;
  if (!loadTokens()) {
    container.innerHTML = `<div class="menu2-empty">Connect Spotify to load the actual Spotify queue.</div>`;
    return;
  }
  setMenu2Status("Loading Spotify queue...", true);
  try {
    menu2QueueTracks = await getSpotifyQueue(state.spotifyClientId, 25);
    container.innerHTML = menu2QueueTracks.length
      ? menu2QueueTracks.map((track, index) => menu2TrackRow(track, index)).join("")
      : `<div class="menu2-empty">Spotify returned an empty queue.</div>`;
    setMenu2Status("Queue loaded.", false);
  } catch (error) {
    container.innerHTML = `<div class="menu2-empty">${escapeHtmlInline(error instanceof Error ? error.message : String(error))}</div>`;
    setMenu2Status("Queue unavailable.", false);
  }
}

async function loadMenu2Playlists(force = false): Promise<void> {
  const container = document.querySelector<HTMLElement>("#menu2PlaylistsResults");
  if (!container) return;
  if (!loadTokens()) {
    container.innerHTML = `<div class="menu2-empty">Connect Spotify to load My Playlists.</div>`;
    return;
  }
  if (!menu2PlaylistCache.length || force) {
    setMenu2Status("Loading playlists...", true);
    try {
      menu2PlaylistCache = await getUserPlaylists(state.spotifyClientId, 300);
      setMenu2Status("Playlists loaded.", false);
    } catch (error) {
      container.innerHTML = `<div class="menu2-empty">${escapeHtmlInline(error instanceof Error ? error.message : String(error))}</div>`;
      setMenu2Status("Playlist load failed.", false);
      return;
    }
  }
  renderMenu2Playlists();
}

function renderMenu2Playlists(): void {
  const container = document.querySelector<HTMLElement>("#menu2PlaylistsResults");
  const input = document.querySelector<HTMLInputElement>("#menu2PlaylistFilter");
  if (!container) return;
  if (menu2SelectedPlaylist) {
    renderMenu2PlaylistDetail();
    return;
  }
  const filter = (input?.value || "").trim().toLowerCase();
  const items = menu2PlaylistCache.filter((playlist) => !filter || playlist.name.toLowerCase().includes(filter) || playlist.owner.toLowerCase().includes(filter));
  container.innerHTML = items.length ? items.map(menu2PlaylistRow).join("") : `<div class="menu2-empty">No playlists match that filter.</div>`;
}

async function openMenu2Playlist(playlistId: string): Promise<void> {
  const playlist = menu2PlaylistCache.find((item) => item.id === playlistId)
    || menu2SearchPlaylists.find((item) => item.id === playlistId);
  if (!playlist) {
    setMenu2Status("Playlist not found in loaded library.", false);
    return;
  }
  menu2SelectedPlaylist = playlist;
  menu2ActiveTab = "playlists";
  applyMenu2Settings();
  const container = document.querySelector<HTMLElement>("#menu2PlaylistsResults");
  if (container) container.innerHTML = `<div class="menu2-empty">Loading ${escapeHtmlInline(playlist.name)}...</div>`;
  setMenu2Status("Loading playlist tracks...", true);
  try {
    menu2SelectedPlaylistTracks = await getPlaylistTracks(state.spotifyClientId, playlist.id, 100);
    renderMenu2PlaylistDetail();
    setMenu2Status(`${playlist.name} loaded.`, false);
  } catch (error) {
    menu2SelectedPlaylistTracks = [];
    if (container) container.innerHTML = `<div class="menu2-empty">${escapeHtmlInline(error instanceof Error ? error.message : String(error))}</div>`;
    setMenu2Status("Playlist tracks unavailable.", false);
  }
}

function closeMenu2PlaylistDetail(): void {
  menu2SelectedPlaylist = null;
  menu2SelectedPlaylistTracks = [];
  renderMenu2Playlists();
}

function renderMenu2PlaylistDetail(): void {
  const container = document.querySelector<HTMLElement>("#menu2PlaylistsResults");
  const playlist = menu2SelectedPlaylist;
  if (!container || !playlist) return;
  container.innerHTML = `
    <div class="menu2-playlist-detail-head">
      <button class="menu2-action secondary" type="button" data-menu2-action="playlist-back">‹ Playlists</button>
      <div class="menu2-playlist-detail-title">
        <div class="menu2-row-art">${playlist.imageUrl ? `<img src="${escapeHtmlInline(playlist.imageUrl)}" alt="" />` : "▦"}</div>
        <div><strong>${escapeHtmlInline(playlist.name)}</strong><span>${escapeHtmlInline(playlist.owner)} • ${playlist.trackCount} tracks</span></div>
      </div>
      <div class="menu2-playlist-detail-actions">
        <button class="menu2-mini-action menu2-icon-action" type="button" data-menu2-action="play-context-order" data-uri="${escapeHtmlInline(playlist.uri)}" data-playlist-id="${escapeHtmlInline(playlist.id)}" aria-label="Play playlist in order" title="Play in order">${menu2Icon("play")}</button>
        <button class="menu2-mini-action secondary menu2-icon-action" type="button" data-menu2-action="shuffle-context" data-uri="${escapeHtmlInline(playlist.uri)}" data-playlist-id="${escapeHtmlInline(playlist.id)}" aria-label="Shuffle playlist" title="Shuffle">${menu2Icon("shuffle")}</button>
      </div>
    </div>
    <div class="menu2-playlist-track-list">
      ${menu2SelectedPlaylistTracks.length ? menu2SelectedPlaylistTracks.map((track, index) => menu2TrackRow(track, index, playlist.uri)).join("") : `<div class="menu2-empty">No tracks returned for this playlist.</div>`}
    </div>`;
}

function menu2SearchTabLabel(tab: typeof menu2SearchResultTab, label: string, count: number): string {
  return `<button class="menu2-result-tab${menu2SearchResultTab === tab ? " menu2-result-tab-active" : ""}" type="button" data-menu2-search-tab="${tab}">${label} <span>${count}</span></button>`;
}

function renderMenu2SearchResults(): void {
  const container = document.querySelector<HTMLElement>("#menu2SearchResults");
  if (!container) return;
  const total = menu2SearchTracks.length + menu2SearchArtists.length + menu2SearchPlaylists.length + menu2SearchAlbums.length;
  if (!total) {
    container.innerHTML = `<div class="menu2-empty">Search results will show here.</div>`;
    return;
  }
  const tabs = `<div class="menu2-result-tabs">
    ${menu2SearchTabLabel("tracks", "Tracks", menu2SearchTracks.length)}
    ${menu2SearchTabLabel("artists", "Artists", menu2SearchArtists.length)}
    ${menu2SearchTabLabel("playlists", "Playlists", menu2SearchPlaylists.length)}
    ${menu2SearchTabLabel("albums", "Albums", menu2SearchAlbums.length)}
  </div>`;
  let body = "";
  if (menu2SearchResultTab === "tracks") body = menu2SearchTracks.map((track) => menu2TrackRow(track)).join("");
  if (menu2SearchResultTab === "artists") body = menu2SearchArtists.map(menu2ArtistRow).join("");
  if (menu2SearchResultTab === "playlists") body = menu2SearchPlaylists.map(menu2PlaylistRow).join("");
  if (menu2SearchResultTab === "albums") body = menu2SearchAlbums.map(menu2AlbumRow).join("");
  container.innerHTML = tabs + (body || `<div class="menu2-empty menu2-result-tab-empty">No ${menu2SearchResultTab} found.</div>`);
}

async function performMenu2Search(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("#menu2SearchInput");
  const type = document.querySelector<HTMLSelectElement>("#menu2SearchType")?.value as "track" | "artist" | "playlist" | "album" | "all" | undefined;
  const container = document.querySelector<HTMLElement>("#menu2SearchResults");
  if (!input || !container) return;
  const query = input.value.trim();
  if (!query) {
    menu2SearchTracks = [];
    menu2SearchArtists = [];
    menu2SearchPlaylists = [];
    menu2SearchAlbums = [];
    renderMenu2SearchResults();
    return;
  }
  setMenu2Status(`Searching Spotify for "${query}"...`, true);
  try {
    const results = await searchSpotifyCatalog(state.spotifyClientId, query, type || "all", 10, 0);
    menu2SearchTracks = results.tracks;
    menu2SearchArtists = results.artists;
    menu2SearchPlaylists = results.playlists;
    menu2SearchAlbums = results.albums;
    menu2SearchResultTab = menu2SearchTracks.length ? "tracks" : menu2SearchArtists.length ? "artists" : menu2SearchPlaylists.length ? "playlists" : "albums";
    renderMenu2SearchResults();
    setMenu2Status("Search complete.", false);
  } catch (error) {
    container.innerHTML = `<div class="menu2-empty">${escapeHtmlInline(error instanceof Error ? error.message : String(error))}</div>`;
    setMenu2Status("Search failed.", false);
  }
}

function renderMenu2Discover(): void {}

async function loadMenu2Devices(): Promise<void> {
  const container = document.querySelector<HTMLElement>("#menu2DeviceResults");
  if (!container) return;
  await refreshSpotifyDevices();
  const devices = [...lastSpotifyDevices];
  if (pocketDjDeviceId && !devices.some((device) => device.id === pocketDjDeviceId)) {
    devices.unshift({ id: pocketDjDeviceId, is_active: pocketDjDeviceActive, is_private_session: false, is_restricted: false, name: "PocketDJ Browser", type: "Computer", volume_percent: null });
  }
  container.innerHTML = devices.length ? devices.map((device) => `
    <button class="menu2-device-row${device.is_active ? " menu2-device-active" : ""}" type="button" data-menu2-action="device" data-device-id="${escapeHtmlInline(device.id || "")}" ${device.id ? "" : "disabled"}>
      <strong>${escapeHtmlInline(device.name)}</strong>
      <span>${escapeHtmlInline(device.type || "Device")}${device.is_active ? " • active" : ""}</span>
    </button>`).join("") : `<div class="menu2-empty">No Spotify Connect devices found.</div>`;
}

function handleMenu2LockClick(): void {
  menu2LockClickCount += 1;
  if (menu2LockClickTimer) window.clearTimeout(menu2LockClickTimer);

  if (menu2LockClickCount >= 5) {
    menu2LockClickCount = 0;
    menu2LockClickTimer = null;
    menu2DevUnlocked = !menu2DevUnlocked;
    if (menu2DevUnlocked) menu2ActiveTab = "dev";
    applyMenu2Settings();
    setMenu2Status(menu2DevUnlocked ? "Dev unlocked." : "Dev hidden.", false);
    return;
  }

  menu2LockClickTimer = window.setTimeout(() => {
    const shouldToggleLock = menu2LockClickCount > 0 && menu2LockClickCount < 5;
    menu2LockClickCount = 0;
    menu2LockClickTimer = null;
    if (!shouldToggleLock) return;
    menu2Locked = !menu2Locked;
    applyMenu2Settings();
    if (!menu2Locked) setMenu2Open(false);
  }, 430);
}

function scheduleMenu2BubbleHoverOpen(): void {
  if (menu2Open) return;
  if (menu2BubbleHoverTimer) window.clearTimeout(menu2BubbleHoverTimer);
  menu2BubbleHoverTimer = window.setTimeout(() => {
    menu2BubbleHoverTimer = null;
    setMenu2Open(true);
  }, 1000);
}

function cancelMenu2BubbleHoverOpen(): void {
  if (!menu2BubbleHoverTimer) return;
  window.clearTimeout(menu2BubbleHoverTimer);
  menu2BubbleHoverTimer = null;
}

function openMenu2FromBubbleRail(): void {
  cancelMenu2BubbleHoverOpen();
  if (!menu2Open) setMenu2Open(true);
}

function bindMenu2Controls(): void {
  document.querySelector<HTMLButtonElement>("#menu2BrandPill")?.addEventListener("click", () => setMenu2Open(false));
  document.querySelectorAll<HTMLButtonElement>(".menu2-tab").forEach((button) => {
    button.addEventListener("click", () => setMenu2Tab(button.dataset.menu2Tab as typeof menu2ActiveTab));
  });
  document.querySelector<HTMLButtonElement>("#menu2LyricsPill")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#lyricsToggle")?.click());
  document.querySelector<HTMLButtonElement>("#menu2ConnectPill")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#connectSpotify")?.click());
  document.querySelector<HTMLButtonElement>("#menu2CompactPill")?.addEventListener("click", () => {
    menu2PanelMode = menu2PanelMode === "compact" ? "full" : "compact";
    localStorage.setItem("pocketdj-menu2-panel-mode", menu2PanelMode);
    applyMenu2Settings();
  });
  document.querySelector<HTMLButtonElement>("#menu2FullscreenPill")?.addEventListener("click", () => void toggleAppFullscreen());
  document.querySelector<HTMLButtonElement>("#menu2LockPill")?.addEventListener("click", handleMenu2LockClick);
  document.querySelector<HTMLButtonElement>("#menu2RefreshQueue")?.addEventListener("click", () => void loadMenu2Queue());
  document.querySelector<HTMLButtonElement>("#menu2RefreshPlaylists")?.addEventListener("click", () => void loadMenu2Playlists(true));
  document.querySelector<HTMLInputElement>("#menu2PlaylistFilter")?.addEventListener("input", () => {
    if (menu2SelectedPlaylist) closeMenu2PlaylistDetail();
    else renderMenu2Playlists();
  });
  document.querySelector<HTMLButtonElement>("#menu2SearchButton")?.addEventListener("click", () => void performMenu2Search());
  document.querySelector<HTMLInputElement>("#menu2SearchInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void performMenu2Search();
  });
  document.querySelector<HTMLButtonElement>("#menu2RefreshDevices")?.addEventListener("click", () => void loadMenu2Devices());
  document.querySelector<HTMLButtonElement>("#menu2PlayHere")?.addEventListener("click", () => void runSpotifyBrowserAction(async () => { await transferToPocketDjBrowser(true); await loadMenu2Devices(); }));
  document.querySelector<HTMLSelectElement>("#menu2StyleMode")?.addEventListener("change", (event) => {
    menu2StyleMode = (event.target as HTMLSelectElement).value as typeof menu2StyleMode;
    localStorage.setItem("pocketdj-menu2-style", menu2StyleMode);
    applyMenu2Settings();
  });
  document.querySelector<HTMLSelectElement>("#menu2ArtSize")?.addEventListener("change", (event) => {
    menu2ArtSize = (event.target as HTMLSelectElement).value as typeof menu2ArtSize;
    localStorage.setItem("pocketdj-menu2-art-size", menu2ArtSize);
    applyMenu2Settings();
  });
  document.querySelector<HTMLSelectElement>("#menu2PanelMode")?.addEventListener("change", (event) => {
    menu2PanelMode = (event.target as HTMLSelectElement).value as typeof menu2PanelMode;
    localStorage.setItem("pocketdj-menu2-panel-mode", menu2PanelMode);
    applyMenu2Settings();
  });
  document.querySelector<HTMLButtonElement>("#menu2OpenCurrentUtility")?.addEventListener("click", () => openSidePanel(true));
  document.querySelector<HTMLElement>("#menu2SearchResults")?.addEventListener("click", (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-menu2-search-tab]");
    if (!tab) return;
    menu2SearchResultTab = tab.dataset.menu2SearchTab as typeof menu2SearchResultTab;
    renderMenu2SearchResults();
  });
  document.querySelector<HTMLElement>("#menu2Panel")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-menu2-action]");
    if (!button) return;
    const action = button.dataset.menu2Action || "";
    const uri = button.dataset.uri || "";
    if (action === "play-uri" && uri) void runSpotifyBrowserAction(async () => { await playTrackWithContinuation(uri); await pollSpotifyNow(); });
    if (action === "queue-uri" && uri) void runSpotifyBrowserAction(async () => { await addSpotifyUriToQueue(state.spotifyClientId, uri); setMenu2Status("Added to queue.", false); });
    if (action === "open-playlist") void openMenu2Playlist(button.dataset.playlistId || "");
    if (action === "playlist-back") closeMenu2PlaylistDetail();
    if (action === "play-context-order" && uri) void runSpotifyBrowserAction(async () => {
      await setSpotifyShuffle(state.spotifyClientId, false);
      await playSpotifyContext(state.spotifyClientId, uri);
      await pollSpotifyNow();
    });
    if (action === "play-context-track" && uri) void runSpotifyBrowserAction(async () => {
      const contextUri = button.dataset.contextUri || "";
      await setSpotifyShuffle(state.spotifyClientId, false);
      await playSpotifyContext(state.spotifyClientId, contextUri, uri);
      await pollSpotifyNow();
    });
    if (action === "play-context" && uri) void runSpotifyBrowserAction(async () => { await playSpotifyContext(state.spotifyClientId, uri); await pollSpotifyNow(); });
    if (action === "shuffle-context" && uri) void runSpotifyBrowserAction(async () => { await playSpotifyContextShuffled(state.spotifyClientId, uri); await pollSpotifyNow(); });
    if (action === "play-vibe") void playVibe(button.dataset.vibeQuery || "");
    if (action === "device") void runSpotifyBrowserAction(async () => { await transferToSpotifyDevice(button.dataset.deviceId || ""); await loadMenu2Devices(); });
    if (action === "artist-top") void openArtistTopTracks(button.dataset.artistId || "", button.dataset.artistName || "artist");
  });
  document.querySelector<HTMLButtonElement>("#menu2Prev")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelPrevButton")?.click());
  document.querySelector<HTMLButtonElement>("#menu2Play")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelPlayButton")?.click());
  document.querySelector<HTMLButtonElement>("#menu2Next")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelNextButton")?.click());
  document.querySelector<HTMLButtonElement>("#menu2Shuffle")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelShuffleButton")?.click());
  document.querySelector<HTMLButtonElement>("#menu2Repeat")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelRepeatButton")?.click());
  document.querySelector<HTMLInputElement>("#menu2Volume")?.addEventListener("input", (event) => {
    const value = Number((event.target as HTMLInputElement).value || 70);
    const panelVolume = document.querySelector<HTMLInputElement>("#spotifyVolume");
    if (panelVolume) {
      panelVolume.value = String(value);
      panelVolume.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const bubble = document.querySelector<HTMLElement>("#menu2Bubble");
  bubble?.addEventListener("mouseenter", scheduleMenu2BubbleHoverOpen);
  bubble?.addEventListener("mouseleave", cancelMenu2BubbleHoverOpen);
  bubble?.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".menu2-bubble-button")) return;
    openMenu2FromBubbleRail();
  });
  bubble?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu2FromBubbleRail();
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".menu2-bubble-button").forEach((button) => {
    button.addEventListener("click", (event) => event.stopPropagation());
  });
  document.querySelector<HTMLButtonElement>("#menu2BubbleLyrics")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#lyricsToggle")?.click());
  document.querySelector<HTMLButtonElement>("#menu2BubblePrev")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelPrevButton")?.click());
  document.querySelector<HTMLButtonElement>("#menu2BubblePlay")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelPlayButton")?.click());
  document.querySelector<HTMLButtonElement>("#menu2BubbleNext")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#panelNextButton")?.click());
  document.querySelector<HTMLButtonElement>("#menu2BubbleVolume")?.addEventListener("click", () => {
    setMenu2Tab("now");
    setMenu2Open(true);
    window.setTimeout(() => document.querySelector<HTMLInputElement>("#menu2Volume")?.focus(), 120);
  });
  applyMenu2Settings();
}


function bindControls(): void {
  qs<HTMLButtonElement>("#aspectModeToggle").addEventListener("click", () => setRoomFillStretchMode(!roomUtility.roomFillStretchMode));
  qs<HTMLElement>(".pocket-title-pill").addEventListener("click", toggleMenu2FromPocketClicks);
  qs<HTMLButtonElement>("#compactPanelToggle").addEventListener("click", () => setCompactPanelEnabled(!compactPanelEnabled));
  qs<HTMLButtonElement>("#fullscreenToggle").addEventListener("click", () => void toggleAppFullscreen());
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  bindMenu2Controls();

  qs<HTMLButtonElement>("#panelToggle").addEventListener("click", () => {
    openSidePanel(true);
  });

  qs<HTMLButtonElement>("#lyricsToggle").addEventListener("click", () => {
    lyricsEnabled = !lyricsEnabled;
    const lyricProgressMs = getEstimatedPlaybackProgress(state.playback);
    const activeLyricIndex = getActiveLyricIndex(lyricsState.syncedLyrics, lyricProgressMs);
    updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");
  });


  qs<HTMLButtonElement>("#panelLockToggle").addEventListener("click", () => {
    setSidePanelLocked(!sidePanelLocked);
    revealDevToolsByLockClicks();
  });

  const controlCard = qs<HTMLElement>("#controlCard");
  controlCard.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  controlCard.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  controlCard.addEventListener("mouseenter", () => {
    clearSidePanelHideTimer();
  });
  controlCard.addEventListener("mouseleave", () => {
    scheduleSidePanelAutoHide();
  });

  const sideTab = qs<HTMLButtonElement>("#sidePanelTab");
  sideTab.addEventListener("mouseenter", () => {
    if (!roomUtility.panelHeightAdjustEnabled) openSidePanel(true);
  });
  sideTab.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!roomUtility.panelHeightAdjustEnabled) openSidePanel(true);
  });
  bindDraggableSidePanelTab(sideTab);

  qs<HTMLButtonElement>("#panelAdjustDone").addEventListener("click", (event) => {
    event.stopPropagation();
    setPanelHeightAdjustEnabled(false, true);
  });


  document.addEventListener("pointerdown", (event) => {
    closeSidePanelOnOutsidePointer(event);
  });

  bindFloorPlaybackControls();
  bindSeekControls();
  bindSpotifyBrowserControls();

  qs<HTMLButtonElement>("#connectSpotify").addEventListener("click", async () => {
    if (loadTokens()) {
      qs<HTMLElement>("#connectDropdown").classList.toggle("connect-dropdown-open");
      return;
    }

    state.spotifyClientId = STANDARD_SPOTIFY_CLIENT_ID;
    saveClientId(state.spotifyClientId);
    await startSpotifyLogin(state.spotifyClientId, state.redirectUri);
  });

  qs<HTMLButtonElement>("#disconnectSpotify").addEventListener("click", () => {
    disconnectSpotify();
    pocketDjPlayer?.disconnect();
    pocketDjPlayer = null;
    pocketDjDeviceId = null;
    pocketDjDeviceReady = false;
    pocketDjDeviceActive = false;
    lastSpotifyDevices = [];
    stopDemo();
    useDemo = false;
    state.playback = emptyTrack();
    panelAutoHiddenAfterConnect = false;
    openSidePanel(true);
    setPocketDjSourceStatus("Spotify disconnected. Connect again to use PocketDJ.");
    renderSpotifySourcePanel();
    updatePlaybackUi(state.playback, state.debugOpen);
    qs<HTMLElement>("#connectDropdown").classList.remove("connect-dropdown-open");
  });


  qs<HTMLInputElement>("#spotifyVolume").addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    phase2Volume = Number(input.value);
    qs<HTMLElement>("#spotifyVolumeValue").textContent = String(phase2Volume);
  });

  qs<HTMLInputElement>("#spotifyVolume").addEventListener("change", () => {
    void runSpotifyPlaybackCommand(async () => {
      await setSpotifyVolume(state.spotifyClientId, phase2Volume);
    });
  });

  qs<HTMLButtonElement>("#panelShuffleButton").addEventListener("click", () => {
    phase2ShuffleEnabled = !phase2ShuffleEnabled;
    updatePhase2SpotifyControls();
    void runSpotifyPlaybackCommand(async () => {
      await setSpotifyShuffle(state.spotifyClientId, phase2ShuffleEnabled);
    });
  });

  qs<HTMLButtonElement>("#panelRepeatButton").addEventListener("click", () => {
    phase2RepeatMode = phase2RepeatMode === "off" ? "context" : phase2RepeatMode === "context" ? "track" : "off";
    updatePhase2SpotifyControls();
    void runSpotifyPlaybackCommand(async () => {
      await setSpotifyRepeat(state.spotifyClientId, phase2RepeatMode);
    });
  });

  qs<HTMLInputElement>("#clientIdInput").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    state.spotifyClientId = input.value.trim();
    saveClientId(state.spotifyClientId);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !useDemo && loadTokens()) void pollSpotifyNow();
  });
}




let sidePanelTabDragState: {
  pointerId: number;
  startY: number;
  startPanelY: number;
  moved: boolean;
} | null = null;

function clampPanelStartY(value: number): number {
  return Math.max(4, Math.min(86, value));
}

function updatePanelStartY(value: number, persist = false): void {
  const clamped = Math.round(clampPanelStartY(value) * 10) / 10;
  roomUtility = { ...roomUtility, panelStartY: clamped };

  const slider = document.querySelector<HTMLInputElement>("#panelStartY");
  const label = document.querySelector<HTMLElement>("#panelStartYValue");
  if (slider) slider.value = String(clamped);
  if (label) setUtilityLabel("panelStartYValue", clamped);

  applyRoomUtilitySettings();
  if (persist) saveRoomUtilitySettings();
}


function setPanelHeightAdjustEnabled(enabled: boolean, openPanelAfter = false): void {
  roomUtility = { ...roomUtility, panelHeightAdjustEnabled: enabled };

  const checkbox = document.querySelector<HTMLInputElement>("#panelHeightAdjustEnabled");
  if (checkbox) checkbox.checked = enabled;

  applyRoomUtilitySettings();
  saveRoomUtilitySettings();

  if (openPanelAfter) {
    openSidePanel(true);
  }
}

function bindDraggableSidePanelTab(tab: HTMLButtonElement): void {
  tab.addEventListener("pointerdown", (event) => {
    if (!roomUtility.panelHeightAdjustEnabled) return;
    if (event.button !== 0) return;
    sidePanelTabDragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPanelY: roomUtility.panelStartY,
      moved: false,
    };
    tab.setPointerCapture(event.pointerId);
    tab.classList.add("side-panel-tab-dragging");
  });

  tab.addEventListener("pointermove", (event) => {
    if (!sidePanelTabDragState || sidePanelTabDragState.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - sidePanelTabDragState.startY;
    if (Math.abs(deltaY) > 3) sidePanelTabDragState.moved = true;

    const deltaPercent = (deltaY / Math.max(1, window.innerHeight)) * 100;
    updatePanelStartY(sidePanelTabDragState.startPanelY + deltaPercent, false);
  });

  const finishDrag = (event: PointerEvent) => {
    if (!sidePanelTabDragState || sidePanelTabDragState.pointerId !== event.pointerId) return;

    const wasDragged = sidePanelTabDragState.moved;
    sidePanelTabDragState = null;
    tab.classList.remove("side-panel-tab-dragging");
    try {
      tab.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }

    saveRoomUtilitySettings();

    if (!wasDragged && !roomUtility.panelHeightAdjustEnabled) {
      openSidePanel(true);
    }
  };

  tab.addEventListener("pointerup", finishDrag);
  tab.addEventListener("pointercancel", finishDrag);
}


function closeSidePanelOnOutsidePointer(event: PointerEvent): void {
  if (sidePanelLocked) return;

  const panel = qs<HTMLElement>("#controlCard");
  if (!panel.classList.contains("control-card-open")) return;

  const target = event.target;
  if (!(target instanceof Node)) return;

  const sideTab = qs<HTMLElement>("#sidePanelTab");
  const panelToggle = qs<HTMLElement>("#panelToggle");

  if (panel.contains(target) || sideTab.contains(target) || panelToggle.contains(target)) return;

  closeSidePanel();
}

function openSidePanel(autoHide = true): void {
  setControlPanelOpen(true);
  clearSidePanelHideTimer();

  if (autoHide && !sidePanelLocked) {
    scheduleSidePanelAutoHide();
  }
}

function closeSidePanel(): void {
  setControlPanelOpen(false);
  clearSidePanelHideTimer();
  qs<HTMLElement>("#connectDropdown").classList.remove("connect-dropdown-open");
}

function scheduleSidePanelAutoHide(): void {
  if (sidePanelLocked) return;
  clearSidePanelHideTimer();

  sidePanelHideTimer = window.setTimeout(() => {
    if (!sidePanelLocked) closeSidePanel();
  }, 1_500);
}

function clearSidePanelHideTimer(): void {
  if (sidePanelHideTimer) {
    window.clearTimeout(sidePanelHideTimer);
    sidePanelHideTimer = null;
  }
}

function setSidePanelLocked(locked: boolean): void {
  sidePanelLocked = locked;
  updateSidePanelLockUi();

  if (locked) {
    openSidePanel(false);
  } else {
    scheduleSidePanelAutoHide();
  }
}

function updateSidePanelLockUi(): void {
  const lock = qs<HTMLButtonElement>("#panelLockToggle");
  const panel = qs<HTMLElement>("#controlCard");

  lock.classList.toggle("panel-lock-active", sidePanelLocked);
  panel.classList.toggle("control-card-locked", sidePanelLocked);
  lock.setAttribute("aria-pressed", String(sidePanelLocked));
  lock.setAttribute("title", sidePanelLocked ? "Unlock side panel auto-hide" : "Lock side panel open");
  lock.setAttribute("aria-label", sidePanelLocked ? "Unlock side panel auto-hide" : "Lock side panel open");
}

function bindFloorPlaybackControls(): void {
  const floor = qs<HTMLElement>("#floorPlayer");

  floor.addEventListener("mouseenter", () => {
    if (floorControlsHideTimer) window.clearTimeout(floorControlsHideTimer);
    floorControlsHideTimer = null;
    setFloorControlsOpen(true, false);
  });

  floor.addEventListener("mouseleave", () => {
    scheduleFloorControlsAutoHide();
  });

  setFloorControlsOpen(true);

  qs<HTMLButtonElement>("#floorPlayButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      if (state.playback.isPlaying) await pauseSpotify(state.spotifyClientId);
      else await playSpotify(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#floorNextButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      await nextSpotifyTrack(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#floorPrevButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      const estimatedProgress = getEstimatedPlaybackProgress(state.playback);
      if (estimatedProgress > 3_000) {
        await seekSpotify(state.spotifyClientId, 0);
      } else {
        await previousSpotifyTrack(state.spotifyClientId);
      }
    });
  });

  qs<HTMLButtonElement>("#floorMoreButton").addEventListener("click", () => {
    const panel = qs<HTMLElement>("#controlCard");
    const isPanelOpen = panel.classList.contains("control-card-open");
    if (isPanelOpen && !sidePanelLocked) closeSidePanel();
    else openSidePanel(true);
    setFloorControlsOpen(true, false);
  });

  qs<HTMLButtonElement>("#panelPlayButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      if (state.playback.isPlaying) await pauseSpotify(state.spotifyClientId);
      else await playSpotify(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#panelNextButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      await nextSpotifyTrack(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#panelPrevButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      const estimatedProgress = getEstimatedPlaybackProgress(state.playback);
      if (estimatedProgress > 3_000) {
        await seekSpotify(state.spotifyClientId, 0);
      } else {
        await previousSpotifyTrack(state.spotifyClientId);
      }
    });
  });
}

function bindSeekControls(): void {
  bindSeekSurface(qs<HTMLElement>("#panelSeekBar"));
  bindSeekSurface(qs<HTMLElement>("#floorSeekBar"));
}

function bindSeekSurface(surface: HTMLElement): void {
  let dragging = false;

  const previewSeek = (clientX: number): number => {
    const rect = surface.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    const positionMs = Math.round(ratio * (state.playback.durationMs || 0));
    const percent = ratio * 100;

    if (surface.id === "panelSeekBar") {
      qs<HTMLDivElement>("#progressFill").style.width = `${percent}%`;
      qs<HTMLElement>("#panelSeekBar").setAttribute("aria-valuenow", String(Math.round(percent)));
    } else {
      qs<HTMLDivElement>("#floorProgressFill").style.width = `${percent}%`;
      qs<HTMLElement>("#floorSeekBar").setAttribute("aria-valuenow", String(Math.round(percent)));
    }

    return positionMs;
  };

  const commitSeek = (clientX: number): void => {
    if (!state.playback.durationMs) return;
    const positionMs = previewSeek(clientX);
    void runSpotifyPlaybackCommand(async () => {
      await seekSpotify(state.spotifyClientId, positionMs);
    });
  };

  surface.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    surface.setPointerCapture(event.pointerId);
    previewSeek(event.clientX);
  });

  surface.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    previewSeek(event.clientX);
  });

  surface.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    surface.releasePointerCapture(event.pointerId);
    commitSeek(event.clientX);
  });

  surface.addEventListener("pointercancel", (event) => {
    dragging = false;
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  });
}

function updateFloorControlsLockUi(): void {
  const floor = document.querySelector<HTMLElement>("#floorPlayer");
  const lockButton = document.querySelector<HTMLButtonElement>("#floorControlsLock");
  floor?.classList.toggle("floor-player-locked", floorControlsLocked);
  floor?.classList.toggle("floor-player-idle", !floorControlsLocked && floor?.classList.contains("floor-player-idle"));
  if (lockButton) {
    lockButton.classList.toggle("floor-controls-lock-active", floorControlsLocked);
    lockButton.setAttribute("aria-pressed", String(floorControlsLocked));
    lockButton.title = floorControlsLocked ? "Floor controls locked open" : "Lock floor controls open";
  }
}

function bindFloorControlsLock(): void {
  const lockButton = document.querySelector<HTMLButtonElement>("#floorControlsLock");
  const fullscreenButton = document.querySelector<HTMLButtonElement>("#floorFullscreenToggle");
  lockButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    floorControlsLocked = !floorControlsLocked;
    window.localStorage.setItem(FLOOR_CONTROLS_LOCK_KEY, floorControlsLocked ? "1" : "0");
    setFloorControlsOpen(true, !floorControlsLocked);
    updateFloorControlsLockUi();
  });
  fullscreenButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setFloorControlsOpen(true, !floorControlsLocked);
    void toggleAppFullscreen();
  });
  handleFullscreenChange();
}

function setFloorControlsOpen(open: boolean, autoHide = true): void {
  floorControlsOpen = true;
  const floor = qs<HTMLElement>("#floorPlayer");

  floor.classList.remove("floor-player-hidden");
  floor.classList.add("floor-player-visible");
  floor.classList.toggle("floor-player-idle", !open && !floorControlsLocked);

  if (floorControlsLocked) {
    if (floorControlsHideTimer) window.clearTimeout(floorControlsHideTimer);
    floorControlsHideTimer = null;
    floor.classList.remove("floor-player-idle");
  } else if (autoHide) {
    scheduleFloorControlsAutoHide();
  }

  updateFloorControlsLockUi();
}

function setFloorControlsLocked(locked: boolean): void {
  floorControlsLocked = locked;
  window.localStorage.setItem(FLOOR_CONTROLS_LOCK_KEY, floorControlsLocked ? "1" : "0");
  setFloorControlsOpen(true, !floorControlsLocked);
  updateFloorControlsLockUi();
}

function scheduleFloorControlsAutoHide(): void {
  if (floorControlsLocked) return;
  if (floorControlsHideTimer) window.clearTimeout(floorControlsHideTimer);
  floorControlsHideTimer = window.setTimeout(() => {
    if (floorControlsLocked) return;
    const floor = qs<HTMLElement>("#floorPlayer");
    floor.classList.add("floor-player-idle");
  }, 1_500);
}

function getEstimatedPlaybackProgress(track: AppState["playback"]): number {
  if (!track.isPlaying) return track.progressMs;
  return Math.min(track.durationMs || track.progressMs, track.progressMs + (Date.now() - track.updatedAt));
}

async function runSpotifyPlaybackCommand(command: () => Promise<void>): Promise<void> {
  if (useDemo) {
    lastPollError = "Spotify controls are disabled in Demo Mode.";
    updatePlaybackUi({ ...state.playback, artist: `${state.playback.artist} | ${lastPollError}` }, state.debugOpen);
    return;
  }

  if (!state.spotifyClientId || !loadTokens()) {
    lastPollError = "Connect Spotify before using playback controls.";
    updatePlaybackUi({ ...state.playback, artist: `${state.playback.artist} | ${lastPollError}` }, state.debugOpen);
    return;
  }

  try {
    lastPollError = "";
    await command();
    await pollSpotifyNow();
    setFloorControlsOpen(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    const canAutoStartPocketDj =
      lowerMessage.includes("no active spotify device") ||
      lowerMessage.includes("no active") ||
      lowerMessage.includes("device");

    if (canAutoStartPocketDj) {
      try {
        lastPollError = "";
        await transferToPocketDjBrowser(true);
        await command();
        await pollSpotifyNow();
        setFloorControlsOpen(true);
        return;
      } catch (fallbackError) {
        lastPollError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      }
    } else {
      lastPollError = message;
    }

    console.warn(lastPollError);
    updatePlaybackUi({ ...state.playback, artist: `${state.playback.artist} | ${lastPollError}` }, state.debugOpen);
  }
}

function updatePhase2SpotifyControls(): void {
  const shuffle = qs<HTMLButtonElement>("#panelShuffleButton");
  const repeat = qs<HTMLButtonElement>("#panelRepeatButton");
  const volume = qs<HTMLInputElement>("#spotifyVolume");

  shuffle.classList.toggle("spotify-control-active", phase2ShuffleEnabled);
  shuffle.setAttribute("title", phase2ShuffleEnabled ? "Shuffle on" : "Shuffle off");

  repeat.classList.toggle("spotify-control-active", phase2RepeatMode !== "off");
  repeat.setAttribute("title", `Repeat: ${phase2RepeatMode}`);

  volume.value = String(phase2Volume);
  qs<HTMLElement>("#spotifyVolumeValue").textContent = String(phase2Volume);
}



function setPocketDjSourceStatus(message: string): void {
  const status = document.querySelector<HTMLElement>("#spotifySourceStatus");
  if (status) status.textContent = message;
}

function renderSpotifySourcePanel(): void {
  const deviceList = document.querySelector<HTMLElement>("#spotifyDeviceList");
  const playHereButton = document.querySelector<HTMLButtonElement>("#spotifyPlayHereButton");
  const activeLabel = document.querySelector<HTMLElement>("#spotifyActiveDeviceLabel");
  if (!deviceList || !playHereButton || !activeLabel) return;

  playHereButton.disabled = !loadTokens();
  activeLabel.textContent = pocketDjDeviceActive
    ? "Audio output: PocketDJ"
    : "Audio output: Spotify Connect";

  const devices = [...lastSpotifyDevices];
  const hasPocketDevice = pocketDjDeviceId && devices.some((device) => device.id === pocketDjDeviceId);
  if (pocketDjDeviceId && !hasPocketDevice) {
    devices.unshift({
      id: pocketDjDeviceId,
      is_active: pocketDjDeviceActive,
      is_private_session: false,
      is_restricted: false,
      name: POCKET_DJ_DEVICE_NAME,
      type: "App",
      volume_percent: phase2Volume
    });
  }

  if (!devices.length) {
    deviceList.innerHTML = `<div class="spotify-browser-empty">No Spotify Connect devices found yet. Open Spotify or activate PocketDJ.</div>`;
    return;
  }

  deviceList.innerHTML = devices.map((device) => {
    const isPocketDevice = Boolean(pocketDjDeviceId && device.id === pocketDjDeviceId);
    const isActive = Boolean(device.is_active || (isPocketDevice && pocketDjDeviceActive));
    const label = isPocketDevice ? `${device.name} ✦` : device.name;
    const type = device.type || "Device";
    return `
      <button class="spotify-device-row${isActive ? " spotify-device-row-active" : ""}${isPocketDevice ? " spotify-device-row-pocket" : ""}" type="button" data-device-id="${escapeHtmlInline(device.id || "")}" ${device.id ? "" : "disabled"}>
        <span class="spotify-device-name">${escapeHtmlInline(label)}</span>
        <span class="spotify-device-meta">${escapeHtmlInline(type)}${isActive ? " • active" : ""}</span>
      </button>
    `;
  }).join("");
}

function loadSpotifyWebPlaybackSdk(): Promise<void> {
  if (window.Spotify?.Player) return Promise.resolve();
  if (webPlaybackSdkPromise) return webPlaybackSdkPromise;

  webPlaybackSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://sdk.scdn.co/spotify-player.js"]');
    const previousReady = window.onSpotifyWebPlaybackSDKReady;

    window.onSpotifyWebPlaybackSDKReady = () => {
      previousReady?.();
      resolve();
    };

    if (existingScript) {
      existingScript.addEventListener("error", () => reject(new Error("Could not load Spotify Web Playback SDK.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SPOTIFY_WEB_PLAYBACK_SDK_URL;
    script.async = true;
    script.addEventListener("error", () => reject(new Error("Could not load Spotify Web Playback SDK.")), { once: true });
    document.head.appendChild(script);
  });

  return webPlaybackSdkPromise;
}

async function initializePocketDjBrowserDevice(): Promise<void> {
  if (!state.spotifyClientId || !loadTokens()) {
    setPocketDjSourceStatus("Connect Spotify before activating PocketDJ.");
    renderSpotifySourcePanel();
    return;
  }

  if (pocketDjPlayer && pocketDjDeviceReady) {
    renderSpotifySourcePanel();
    return;
  }

  await loadSpotifyWebPlaybackSdk();
  if (!window.Spotify?.Player) throw new Error("Spotify Web Playback SDK did not initialize.");

  if (!pocketDjPlayer) {
    pocketDjPlayer = new window.Spotify.Player({
      name: POCKET_DJ_DEVICE_NAME,
      volume: phase2Volume / 100,
      getOAuthToken: (callback) => {
        void getSpotifyAccessToken(state.spotifyClientId)
          .then((token) => callback(token || ""))
          .catch(() => callback(""));
      }
    });

    pocketDjPlayer.addListener("ready", ({ device_id }: { device_id: string }) => {
      pocketDjDeviceId = device_id;
      pocketDjDeviceReady = true;
      setPocketDjSourceStatus("PocketDJ is ready as a Spotify Connect device.");
      void refreshSpotifyDevices();
    });

    pocketDjPlayer.addListener("not_ready", ({ device_id }: { device_id: string }) => {
      if (pocketDjDeviceId === device_id) {
        pocketDjDeviceReady = false;
        pocketDjDeviceActive = false;
      }
      setPocketDjSourceStatus("PocketDJ device went offline. Refresh or reconnect Spotify.");
      renderSpotifySourcePanel();
    });

    pocketDjPlayer.addListener("player_state_changed", (payload: any) => {
      pocketDjDeviceActive = Boolean(payload);
      renderSpotifySourcePanel();
    });

    ["initialization_error", "authentication_error", "account_error", "playback_error"].forEach((eventName) => {
      pocketDjPlayer?.addListener(eventName, (payload: { message?: string }) => {
        setPocketDjSourceStatus(payload?.message || `Spotify Web Playback ${eventName.replace("_", " ")}.`);
        renderSpotifySourcePanel();
      });
    });
  }

  setPocketDjSourceStatus("Activating PocketDJ device...");
  const connected = await pocketDjPlayer.connect();
  if (!connected) throw new Error("Spotify could not activate PocketDJ. Confirm this Spotify account has Premium.");
  renderSpotifySourcePanel();
}

async function refreshSpotifyDevices(): Promise<void> {
  if (!state.spotifyClientId || !loadTokens()) {
    lastSpotifyDevices = [];
    renderSpotifySourcePanel();
    return;
  }

  try {
    lastSpotifyDevices = await getSpotifyDevices(state.spotifyClientId);
    pocketDjDeviceActive = Boolean(pocketDjDeviceId && lastSpotifyDevices.some((device) => device.id === pocketDjDeviceId && device.is_active));
    renderSpotifySourcePanel();
  } catch (error) {
    setPocketDjSourceStatus(error instanceof Error ? error.message : String(error));
    renderSpotifySourcePanel();
  }
}

async function transferToPocketDjBrowser(play = true): Promise<void> {
  await initializePocketDjBrowserDevice();
  if (!pocketDjPlayer || !pocketDjDeviceId) {
    throw new Error("PocketDJ is not ready yet.");
  }

  await pocketDjPlayer.activateElement?.();
  await transferSpotifyPlayback(state.spotifyClientId, pocketDjDeviceId, play);
  preferredSpotifySource = "pocket-dj-browser";
  localStorage.setItem(PREFERRED_SPOTIFY_SOURCE_KEY, preferredSpotifySource);
  pocketDjDeviceActive = true;
  setPocketDjSourceStatus("Playing through PocketDJ.");
  await refreshSpotifyDevices();
  await pollSpotifyNow();
}

async function transferToSpotifyDevice(deviceId: string): Promise<void> {
  if (!deviceId) return;
  await transferSpotifyPlayback(state.spotifyClientId, deviceId, true);
  preferredSpotifySource = deviceId === pocketDjDeviceId ? "pocket-dj-browser" : deviceId;
  localStorage.setItem(PREFERRED_SPOTIFY_SOURCE_KEY, preferredSpotifySource);
  setPocketDjSourceStatus("Spotify playback source changed.");
  await refreshSpotifyDevices();
  await pollSpotifyNow();
}


function escapeHtmlInline(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] || char));
}

function formatDurationMs(value: number): string {
  if (!value) return "";
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function loadSpotifyPinnedPlaylists(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPOTIFY_PINNED_PLAYLISTS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSpotifyPinnedPlaylists(): void {
  localStorage.setItem(SPOTIFY_PINNED_PLAYLISTS_KEY, JSON.stringify([...pinnedPlaylistIds]));
}

function loadSpotifyPlaylistRecency(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPOTIFY_PLAYLIST_RECENCY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function saveSpotifyPlaylistRecency(): void {
  localStorage.setItem(SPOTIFY_PLAYLIST_RECENCY_KEY, JSON.stringify(playlistRecency));
}

function rememberPlaylistUse(playlistId: string): void {
  playlistRecency = { ...playlistRecency, [playlistId]: Date.now() };
  saveSpotifyPlaylistRecency();
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function recentTrackRank(track: SpotifyCatalogTrack): number {
  const index = recentTrackIds.indexOf(track.id);
  return index === -1 ? 999_999 : index;
}

function sortTracks(tracks: SpotifyCatalogTrack[], sort: SpotifyBrowserSort): SpotifyCatalogTrack[] {
  const sorted = [...tracks];
  if (sort === "alpha") return sorted.sort((a, b) => compareText(a.name, b.name));
  if (sort === "artist") return sorted.sort((a, b) => compareText(a.artists, b.artists) || compareText(a.name, b.name));
  if (sort === "album") return sorted.sort((a, b) => compareText(a.album, b.album) || compareText(a.name, b.name));
  return sorted.sort((a, b) => recentTrackRank(a) - recentTrackRank(b) || compareText(a.name, b.name));
}

function sortPlaylists(playlists: SpotifyCatalogPlaylist[], sort: SpotifyBrowserSort): SpotifyCatalogPlaylist[] {
  const sorted = [...playlists];
  if (sort === "alpha") {
    return sorted.sort((a, b) =>
      Number(pinnedPlaylistIds.has(b.id)) - Number(pinnedPlaylistIds.has(a.id))
      || compareText(a.name, b.name)
    );
  }

  return sorted.sort((a, b) =>
    Number(pinnedPlaylistIds.has(b.id)) - Number(pinnedPlaylistIds.has(a.id))
    || (playlistRecency[b.id] || 0) - (playlistRecency[a.id] || 0)
    || compareText(a.name, b.name)
  );
}

function getPlaylistSortMode(): SpotifyBrowserSort {
  return qs<HTMLSelectElement>("#playlistSortSelect").value as SpotifyBrowserSort;
}

function setSpotifyBrowserStatus(message: string, busy = false): void {
  spotifyBrowserStatus = message;
  spotifyBrowserBusy = busy;
  const status = qs<HTMLElement>("#spotifyBrowserStatus");
  status.textContent = message;
  status.classList.toggle("spotify-browser-status-busy", busy);
}

function setSpotifyBrowserTab(tab: SpotifyBrowserTab): void {
  spotifyBrowserTab = tab;
  qs<HTMLElement>("#spotifyHomePane").classList.toggle("spotify-browser-pane-active", tab === "home");
  qs<HTMLElement>("#spotifyPlaylistsPane").classList.toggle("spotify-browser-pane-active", tab === "playlists");
  qs<HTMLElement>("#spotifyVibesPane").classList.toggle("spotify-browser-pane-active", tab === "vibes");
  qs<HTMLElement>("#spotifySearchPane").classList.toggle("spotify-browser-pane-active", tab === "search");

  qs<HTMLButtonElement>("#spotifyTabHome").classList.toggle("spotify-browser-tab-active", tab === "home");
  qs<HTMLButtonElement>("#spotifyTabPlaylists").classList.toggle("spotify-browser-tab-active", tab === "playlists");
  qs<HTMLButtonElement>("#spotifyTabVibes").classList.toggle("spotify-browser-tab-active", tab === "vibes");
  qs<HTMLButtonElement>("#spotifyTabSearch").classList.toggle("spotify-browser-tab-active", tab === "search");
}


function allKnownSpotifyTracks(): SpotifyCatalogTrack[] {
  return [
    ...currentHomeTracks,
    ...spotifyBrowserTracks,
    ...currentPlaylistTracks,
    ...currentLibraryTracks,
  ];
}

function findKnownTrackByUri(uri: string): SpotifyCatalogTrack | null {
  return allKnownSpotifyTracks().find((track) => track.uri === uri) || null;
}

async function queueRelevantTracksAfter(track: SpotifyCatalogTrack | null): Promise<void> {
  if (!track?.artistId) return;
  try {
    const related = await getArtistTopTracks(state.spotifyClientId, track.artistId);
    const queueCandidates = related
      .filter((candidate) => candidate.uri !== track.uri)
      .slice(0, 8);

    for (const candidate of queueCandidates) {
      await addSpotifyUriToQueue(state.spotifyClientId, candidate.uri);
    }
  } catch (error) {
    console.warn("Could not queue related tracks.", error);
  }
}

async function playTrackWithContinuation(uri: string): Promise<void> {
  const knownTrack = findKnownTrackByUri(uri);

  if (selectedPlaylist && currentPlaylistTracks.some((track) => track.uri === uri)) {
    rememberPlaylistUse(selectedPlaylist.id);
    phase2ShuffleEnabled = false;
    await setSpotifyShuffle(state.spotifyClientId, false);
    await playSpotifyContext(state.spotifyClientId, selectedPlaylist.uri, uri);
    updatePhase2SpotifyControls();
    return;
  }

  if (knownTrack?.albumUri) {
    await setSpotifyShuffle(state.spotifyClientId, false);
    await playSpotifyContext(state.spotifyClientId, knownTrack.albumUri, uri);
    await queueRelevantTracksAfter(knownTrack);
    updatePhase2SpotifyControls();
    return;
  }

  await playSpotifyUri(state.spotifyClientId, uri);
  await queueRelevantTracksAfter(knownTrack);
}


function renderTrackRows(containerId: string, tracks: SpotifyCatalogTrack[], emptyMessage: string, sort: SpotifyBrowserSort = "recent"): void {
  const container = qs<HTMLElement>(`#${containerId}`);
  const visibleTracks = sortTracks(tracks, sort);
  if (!visibleTracks.length) {
    container.classList.add("spotify-browser-empty");
    container.innerHTML = escapeHtmlInline(emptyMessage);
    return;
  }

  container.classList.remove("spotify-browser-empty");
  container.innerHTML = visibleTracks.map((track) => `
    <article class="spotify-result-row spotify-track-row" data-uri="${escapeHtmlInline(track.uri)}">
      <div class="spotify-result-art">${track.albumArtUrl ? `<img src="${escapeHtmlInline(track.albumArtUrl)}" alt="" />` : "<span>♪</span>"}</div>
      <div class="spotify-result-copy">
        <button class="spotify-result-title spotify-result-title-button" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">${escapeHtmlInline(track.name)}</button>
        <div class="spotify-result-subtitle">${escapeHtmlInline(track.artists)}${track.album ? ` • ${escapeHtmlInline(track.album)}` : ""}</div>
      </div>
      <div class="spotify-result-duration">${formatDurationMs(track.durationMs)}</div>
      <button class="spotify-row-button" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">Play</button>
      <button class="spotify-row-button secondary" type="button" data-action="queue-uri" data-uri="${escapeHtmlInline(track.uri)}">Queue</button>
    </article>
  `).join("");
}

function filterPlaylistsForSearch(playlists: SpotifyCatalogPlaylist[]): SpotifyCatalogPlaylist[] {
  const query = qs<HTMLInputElement>("#playlistSearchInput")?.value.trim().toLowerCase() || "";
  if (!query) return playlists;
  return playlists.filter((playlist) =>
    playlist.name.toLowerCase().includes(query)
    || playlist.owner.toLowerCase().includes(query)
  );
}

function renderPlaylistRows(containerId: string, playlists: SpotifyCatalogPlaylist[], emptyMessage: string): void {
  const container = qs<HTMLElement>(`#${containerId}`);
  const visiblePlaylists = sortPlaylists(filterPlaylistsForSearch(playlists), getPlaylistSortMode());
  if (!visiblePlaylists.length) {
    container.classList.add("spotify-browser-empty");
    container.innerHTML = escapeHtmlInline(emptyMessage);
    return;
  }

  container.classList.remove("spotify-browser-empty");
  container.innerHTML = visiblePlaylists.map((playlist) => {
    const pinned = pinnedPlaylistIds.has(playlist.id);
    const recentLabel = playlistRecency[playlist.id] ? "Recently opened" : "Not opened here yet";
    return `
      <article class="spotify-result-row spotify-playlist-row${pinned ? " spotify-playlist-pinned" : ""}" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">
        <div class="spotify-result-art">${playlist.imageUrl ? `<img src="${escapeHtmlInline(playlist.imageUrl)}" alt="" />` : "<span>▤</span>"}</div>
        <div class="spotify-result-copy">
          <button class="spotify-result-title spotify-result-title-button" type="button" data-action="open-playlist" data-playlist-id="${escapeHtmlInline(playlist.id)}">${pinned ? "★ " : ""}${escapeHtmlInline(playlist.name)}</button>
          <div class="spotify-result-subtitle">${escapeHtmlInline(playlist.owner)} • ${playlist.trackCount} tracks • ${recentLabel}</div>
        </div>
        <button class="spotify-row-button" type="button" data-action="play-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Play</button>
        <button class="spotify-row-button secondary" type="button" data-action="shuffle-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Shuffle</button>
      </article>
    `;
  }).join("");
}

function renderArtistRows(artists: SpotifyCatalogArtist[]): string {
  if (!artists.length) return "";
  return artists.map((artist) => `
    <article class="spotify-result-row spotify-artist-row" data-artist-id="${escapeHtmlInline(artist.id)}" data-uri="${escapeHtmlInline(artist.uri)}">
      <div class="spotify-result-art spotify-result-art-round">${artist.imageUrl ? `<img src="${escapeHtmlInline(artist.imageUrl)}" alt="" />` : "<span>◎</span>"}</div>
      <div class="spotify-result-copy">
        <button class="spotify-result-title spotify-result-title-button" type="button" data-action="artist-top-tracks" data-artist-id="${escapeHtmlInline(artist.id)}" data-artist-name="${escapeHtmlInline(artist.name)}">${escapeHtmlInline(artist.name)}</button>
        <div class="spotify-result-subtitle">${artist.followers ? `${artist.followers.toLocaleString()} followers` : "Artist"}</div>
      </div>
      <button class="spotify-row-button" type="button" data-action="artist-top-tracks" data-artist-id="${escapeHtmlInline(artist.id)}" data-artist-name="${escapeHtmlInline(artist.name)}">Top Tracks</button>
    </article>
  `).join("");
}

function renderAlbumRows(albums: SpotifyCatalogAlbum[]): string {
  if (!albums.length) return "";
  return albums.map((album) => `
    <article class="spotify-result-row spotify-playlist-row" data-uri="${escapeHtmlInline(album.uri)}">
      <div class="spotify-result-art">${album.imageUrl ? `<img src="${escapeHtmlInline(album.imageUrl)}" alt="" />` : "<span>▣</span>"}</div>
      <div class="spotify-result-copy">
        <button class="spotify-result-title spotify-result-title-button" type="button" data-action="play-context" data-uri="${escapeHtmlInline(album.uri)}">${escapeHtmlInline(album.name)}</button>
        <div class="spotify-result-subtitle">${escapeHtmlInline(album.artists)}${album.releaseYear ? ` • ${escapeHtmlInline(album.releaseYear)}` : ""} • ${album.trackCount} tracks</div>
      </div>
      <button class="spotify-row-button" type="button" data-action="play-context" data-uri="${escapeHtmlInline(album.uri)}">Play</button>
      <button class="spotify-row-button secondary" type="button" data-action="shuffle-context" data-uri="${escapeHtmlInline(album.uri)}">Shuffle</button>
    </article>
  `).join("");
}

function setSearchResultTab(tab: SpotifySearchResultTab): void {
  spotifySearchResultTab = tab;
  renderSearchResults();
}

function searchTabLabel(tab: SpotifySearchResultTab, label: string, count: number): string {
  return `<button class="spotify-result-tab${spotifySearchResultTab === tab ? " spotify-result-tab-active" : ""}" type="button" data-action="search-result-tab" data-search-result-tab="${tab}">${label} <span>${count}</span></button>`;
}

function renderSearchResults(): void {
  const container = qs<HTMLElement>("#spotifySearchResults");
  const total = spotifyBrowserTracks.length + spotifyBrowserArtists.length + spotifySearchPlaylists.length + spotifyBrowserAlbums.length;
  const tabs = `
    <div class="spotify-result-tabs">
      ${searchTabLabel("tracks", "Tracks", spotifyBrowserTracks.length)}
      ${searchTabLabel("artists", "Artists", spotifyBrowserArtists.length)}
      ${searchTabLabel("playlists", "Playlists", spotifySearchPlaylists.length)}
      ${searchTabLabel("albums", "Albums", spotifyBrowserAlbums.length)}
    </div>
  `;
  const pager = `
    <div class="spotify-search-pager">
      <button id="spotifySearchPrev" class="spotify-browser-action secondary" type="button" data-action="search-prev" ${spotifySearchOffset <= 0 ? "disabled" : ""}>‹ Prev 10</button>
      <span>${spotifySearchQuery ? `Showing ${spotifySearchOffset + 1}-${spotifySearchOffset + SEARCH_PAGE_SIZE}` : "Search Spotify"}</span>
      <button id="spotifySearchNext" class="spotify-browser-action secondary" type="button" data-action="search-next">Next 10 ›</button>
    </div>
  `;

  let body = "";
  if (spotifySearchResultTab === "tracks") {
    body = sortTracks(spotifyBrowserTracks, "recent").map((track) => `
      <article class="spotify-result-row spotify-track-row" data-uri="${escapeHtmlInline(track.uri)}">
        <div class="spotify-result-art">${track.albumArtUrl ? `<img src="${escapeHtmlInline(track.albumArtUrl)}" alt="" />` : "<span>♪</span>"}</div>
        <div class="spotify-result-copy">
          <button class="spotify-result-title spotify-result-title-button" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">${escapeHtmlInline(track.name)}</button>
          <div class="spotify-result-subtitle">${escapeHtmlInline(track.artists)}${track.album ? ` • ${escapeHtmlInline(track.album)}` : ""}</div>
        </div>
        <div class="spotify-result-duration">${formatDurationMs(track.durationMs)}</div>
        <button class="spotify-row-button" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">Play</button>
        <button class="spotify-row-button secondary" type="button" data-action="queue-uri" data-uri="${escapeHtmlInline(track.uri)}">Queue</button>
      </article>
    `).join("");
  }
  if (spotifySearchResultTab === "artists") body = renderArtistRows(spotifyBrowserArtists);
  if (spotifySearchResultTab === "playlists") {
    body = sortPlaylists(spotifySearchPlaylists, "recent").map((playlist) => `
      <article class="spotify-result-row spotify-playlist-row" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">
        <div class="spotify-result-art">${playlist.imageUrl ? `<img src="${escapeHtmlInline(playlist.imageUrl)}" alt="" />` : "<span>▤</span>"}</div>
        <div class="spotify-result-copy">
          <button class="spotify-result-title spotify-result-title-button" type="button" data-action="open-playlist" data-playlist-id="${escapeHtmlInline(playlist.id)}">${escapeHtmlInline(playlist.name)}</button>
          <div class="spotify-result-subtitle">${escapeHtmlInline(playlist.owner)} • ${playlist.trackCount} tracks</div>
        </div>
        <button class="spotify-row-button" type="button" data-action="play-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Play</button>
        <button class="spotify-row-button secondary" type="button" data-action="shuffle-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Shuffle</button>
      </article>
    `).join("");
  }
  if (spotifySearchResultTab === "albums") body = renderAlbumRows(spotifyBrowserAlbums);

  container.classList.toggle("spotify-browser-empty", total === 0);
  container.innerHTML = total === 0 ? "Search results will show here." : pager + tabs + (body || `<div class="spotify-browser-empty spotify-result-tab-empty">No ${spotifySearchResultTab} found.</div>`);
}

function renderHome(recentTracks: SpotifyCatalogTrack[], playlists: SpotifyCatalogPlaylist[]): void {
  const container = qs<HTMLElement>("#spotifyHomeResults");

  const recentlyPlayedPlaylists = sortPlaylists(playlists, "recent").slice(0, 8).map((playlist) => `
    <button class="spotify-home-tile" type="button" data-action="open-playlist" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">
      <span>${playlist.imageUrl ? `<img src="${escapeHtmlInline(playlist.imageUrl)}" alt="" />` : "▦"}</span>
      <strong>${escapeHtmlInline(playlist.name)}</strong>
    </button>
  `).join("");

  const recentRows = sortTracks(recentTracks, "recent").slice(0, 6).map((track) => `
    <button class="spotify-home-row" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">
      <span>${track.albumArtUrl ? `<img src="${escapeHtmlInline(track.albumArtUrl)}" alt="" />` : "♪"}</span>
      <strong>${escapeHtmlInline(track.name)}</strong>
      <em>${escapeHtmlInline(track.artists)}</em>
    </button>
  `).join("");

  container.innerHTML = `
    <div class="spotify-home-section">
      <div class="spotify-result-group-title">Recently played playlists</div>
      <div class="spotify-home-grid">${recentlyPlayedPlaylists || "<div class='spotify-browser-empty'>Recently played playlists will appear after Spotify returns them.</div>"}</div>
    </div>
    <div class="spotify-home-section">
      <div class="spotify-result-group-title">Recently played songs</div>
      <div class="spotify-home-list">${recentRows || "<div class='spotify-browser-empty'>Recent tracks will appear after Spotify returns them.</div>"}</div>
    </div>
  `;
}

function renderVibes(): void {
  qs<HTMLElement>("#spotifyVibesResults").innerHTML = VIBE_PRESETS.map((vibe) => `
    <button class="spotify-vibe-card" type="button" data-action="play-vibe" data-vibe-query="${escapeHtmlInline(vibe.query)}">
      <strong>${escapeHtmlInline(vibe.label)}</strong>
      <span>Start a random ${escapeHtmlInline(vibe.label.toLowerCase())} track</span>
    </button>
  `).join("");
}

async function ensureRecentTrackIds(): Promise<void> {
  if (recentTrackIds.length) return;
  const recent = await getRecentlyPlayed(state.spotifyClientId, 50);
  recentTrackIds = recent.map((track) => track.id);
}

async function runSpotifyBrowserAction(action: () => Promise<void>): Promise<void> {
  if (useDemo) {
    setSpotifyBrowserStatus("Spotify browser is disabled in Demo Mode.", false);
    return;
  }

  if (!state.spotifyClientId || !loadTokens()) {
    setSpotifyBrowserStatus("Connect Spotify first. If you just added new Spotify scopes, reconnect once.", false);
    openSidePanel(true);
    return;
  }

  try {
    setSpotifyBrowserStatus("Talking to Spotify...", true);
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSpotifyBrowserStatus(message, false);
    console.warn(message);
  }
}

async function performSpotifySearch(resetPage = true): Promise<void> {
  const input = qs<HTMLInputElement>("#spotifySearchInput");
  const searchType = qs<HTMLSelectElement>("#spotifySearchType").value as "track" | "artist" | "playlist" | "album" | "all";
  const query = input.value.trim();
  if (!query) {
    clearSpotifySearch();
    setSpotifyBrowserStatus("Type something to search Spotify.", false);
    return;
  }

  if (resetPage || query !== spotifySearchQuery || searchType !== spotifySearchType) {
    spotifySearchOffset = 0;
  }

  spotifySearchQuery = query;
  spotifySearchType = searchType;

  await runSpotifyBrowserAction(async () => {
    await ensureRecentTrackIds();
    const results = await searchSpotifyCatalog(state.spotifyClientId, query, searchType, SEARCH_PAGE_SIZE, spotifySearchOffset);
    spotifyBrowserTracks = results.tracks;
    spotifyBrowserArtists = results.artists;
    spotifySearchPlaylists = results.playlists;
    spotifyBrowserAlbums = results.albums;
    spotifySearchResultTab = spotifyBrowserTracks.length ? "tracks" : spotifyBrowserArtists.length ? "artists" : spotifySearchPlaylists.length ? "playlists" : "albums";
    renderSearchResults();
    setSpotifyBrowserStatus(`Search complete for "${query}".`, false);
  });
}

function clearSpotifySearch(): void {
  qs<HTMLInputElement>("#spotifySearchInput").value = "";
  spotifySearchQuery = "";
  spotifySearchOffset = 0;
  spotifyBrowserTracks = [];
  spotifyBrowserArtists = [];
  spotifySearchPlaylists = [];
  spotifyBrowserAlbums = [];
  spotifySearchResultTab = "tracks";
  renderSearchResults();
}

async function loadPlaylists(): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    selectedPlaylist = null;
    currentPlaylistTracks = [];
    spotifyBrowserPlaylists = await getUserPlaylists(state.spotifyClientId, 300);
    renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "No playlists returned.");
    qs<HTMLButtonElement>("#playlistBackButton").disabled = true;
    setSpotifyBrowserStatus(`Loaded ${spotifyBrowserPlaylists.length} playlists.`, false);
  });
}

function clearPlaylistSearch(): void {
  qs<HTMLInputElement>("#playlistSearchInput").value = "";
  if (selectedPlaylist) {
    selectedPlaylist = null;
    currentPlaylistTracks = [];
    qs<HTMLButtonElement>("#playlistBackButton").disabled = true;
  }
  renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "My Playlists will load automatically.");
}

async function openPlaylist(playlistId: string): Promise<void> {
  const playlist = spotifyBrowserPlaylists.find((item) => item.id === playlistId)
    || spotifySearchPlaylists.find((item) => item.id === playlistId)
    || null;
  selectedPlaylist = playlist;
  rememberPlaylistUse(playlistId);

  await runSpotifyBrowserAction(async () => {
    await ensureRecentTrackIds();
    currentPlaylistTracks = await getPlaylistTracks(state.spotifyClientId, playlistId, 100);
    renderTrackRows("spotifyPlaylistsResults", currentPlaylistTracks, "No tracks returned for this playlist.", getPlaylistSortMode());
    qs<HTMLButtonElement>("#playlistBackButton").disabled = false;
    setSpotifyBrowserStatus(`Opened ${playlist?.name || "playlist"} with ${currentPlaylistTracks.length} tracks.`, false);
  });
}

async function loadHome(): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    const [recent, playlists] = await Promise.all([
      getRecentlyPlayed(state.spotifyClientId, 20),
      spotifyBrowserPlaylists.length ? Promise.resolve(spotifyBrowserPlaylists) : getUserPlaylists(state.spotifyClientId, 120)
    ]);
    recentTrackIds = recent.map((track) => track.id);
    currentHomeTracks = recent;
    spotifyBrowserPlaylists = playlists;
    renderHome(recent, playlists);
    setSpotifyBrowserStatus("Home loaded.", false);
  });
}

async function playVibe(query: string): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    const offset = Math.floor(Math.random() * 40);
    const results = await searchSpotifyCatalog(state.spotifyClientId, query, "track", 10, offset);
    const pick = results.tracks[Math.floor(Math.random() * Math.max(1, results.tracks.length))];
    if (!pick) {
      setSpotifyBrowserStatus("No tracks found for that vibe.", false);
      return;
    }
    await playSpotifyUri(state.spotifyClientId, pick.uri);
    await pollSpotifyNow();
    setSpotifyBrowserStatus(`Vibe started: ${pick.name}.`, false);
  });
}

async function openArtistTopTracks(artistId: string, artistName: string): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    const tracks = await getArtistTopTracks(state.spotifyClientId, artistId);
    spotifyBrowserTracks = tracks;
    spotifyBrowserArtists = [];
    spotifySearchPlaylists = [];
    spotifyBrowserAlbums = [];
    spotifySearchResultTab = "tracks";
    renderSearchResults();
    setSpotifyBrowserTab("search");
    setSpotifyBrowserStatus(`Loaded top tracks for ${artistName}.`, false);
  });
}

function bindSpotifyBrowserControls(): void {
  qs<HTMLButtonElement>("#spotifyPlayHereButton").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void runSpotifyBrowserAction(async () => {
      await transferToPocketDjBrowser(true);
    });
  });

  qs<HTMLElement>("#spotifyDeviceList").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-device-id]");
    if (!button) return;
    const deviceId = button.dataset.deviceId || "";
    void runSpotifyBrowserAction(async () => {
      await transferToSpotifyDevice(deviceId);
    });
  });

  qs<HTMLButtonElement>("#spotifyTabHome").addEventListener("click", () => {
    setSpotifyBrowserTab("home");
    void loadHome();
  });

  qs<HTMLButtonElement>("#spotifyTabPlaylists").addEventListener("click", () => {
    setSpotifyBrowserTab("playlists");
    if (selectedPlaylist) {
      clearPlaylistSearch();
      setSpotifyBrowserStatus("Back to Playlists.", false);
      return;
    }
    if (!spotifyBrowserPlaylists.length && !spotifyBrowserBusy) void loadPlaylists();
  });

  qs<HTMLButtonElement>("#spotifyTabVibes").addEventListener("click", () => {
    setSpotifyBrowserTab("vibes");
    renderVibes();
  });

  qs<HTMLButtonElement>("#spotifyTabSearch").addEventListener("click", () => setSpotifyBrowserTab("search"));

  qs<HTMLButtonElement>("#spotifySearchButton").addEventListener("click", () => {
    void performSpotifySearch(true);
  });

  qs<HTMLButtonElement>("#spotifyClearSearchButton").addEventListener("click", () => {
    clearSpotifySearch();
    setSpotifyBrowserStatus("Search cleared.", false);
  });

  qs<HTMLInputElement>("#spotifySearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void performSpotifySearch(true);
    }
  });

  qs<HTMLSelectElement>("#playlistSortSelect").addEventListener("change", () => {
    if (selectedPlaylist) renderTrackRows("spotifyPlaylistsResults", currentPlaylistTracks, "No tracks returned for this playlist.", getPlaylistSortMode());
    else renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "My Playlists will load automatically.");
  });

  qs<HTMLInputElement>("#playlistSearchInput").addEventListener("input", () => {
    if (!selectedPlaylist) renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "No matching playlists.");
  });

  qs<HTMLButtonElement>("#playlistClearSearchButton").addEventListener("click", () => {
    clearPlaylistSearch();
    setSpotifyBrowserStatus("Playlist search cleared.", false);
  });

  qs<HTMLButtonElement>("#playlistBackButton").addEventListener("click", () => {
    clearPlaylistSearch();
    setSpotifyBrowserStatus("Back to Playlists.", false);
  });
  qs<HTMLButtonElement>("#playlistBackButton").disabled = true;

  qs<HTMLElement>("#spotifyBrowserPanel").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-action]");
    if (!button) return;

    const action = button.dataset.action || "";
    const uri = button.dataset.uri || "";
    const playlistId = button.dataset.playlistId || "";
    const artistId = button.dataset.artistId || "";
    const artistName = button.dataset.artistName || "artist";
    const vibeQuery = button.dataset.vibeQuery || "";

    if (action === "play-uri" && uri) {
      void runSpotifyBrowserAction(async () => {
        await playTrackWithContinuation(uri);
        await pollSpotifyNow();
        setSpotifyBrowserStatus("Playing selected track with continuation.", false);
      });
    }

    if (action === "queue-uri" && uri) {
      void runSpotifyBrowserAction(async () => {
        await addSpotifyUriToQueue(state.spotifyClientId, uri);
        setSpotifyBrowserStatus("Added track to Spotify queue.", false);
      });
    }

    if (action === "play-context" && uri) {
      void runSpotifyBrowserAction(async () => {
        if (playlistId) rememberPlaylistUse(playlistId);
        phase2ShuffleEnabled = false;
        await setSpotifyShuffle(state.spotifyClientId, false);
        await playSpotifyContext(state.spotifyClientId, uri);
        updatePhase2SpotifyControls();
        await pollSpotifyNow();
        setSpotifyBrowserStatus("Playing selection.", false);
      });
    }

    if (action === "shuffle-context" && uri) {
      void runSpotifyBrowserAction(async () => {
        if (playlistId) rememberPlaylistUse(playlistId);
        phase2ShuffleEnabled = true;
        await playSpotifyContextShuffled(state.spotifyClientId, uri);
        updatePhase2SpotifyControls();
        await pollSpotifyNow();
        setSpotifyBrowserStatus("Shuffling selection.", false);
      });
    }

    if (action === "open-playlist" && playlistId) {
      setSpotifyBrowserTab("playlists");
      void openPlaylist(playlistId);
    }

    if (action === "artist-top-tracks" && artistId) {
      void openArtistTopTracks(artistId, artistName);
    }

    if (action === "search-result-tab") {
      const tab = button.dataset.searchResultTab as SpotifySearchResultTab | undefined;
      if (tab) setSearchResultTab(tab);
    }

    if (action === "search-prev") {
      spotifySearchOffset = Math.max(0, spotifySearchOffset - SEARCH_PAGE_SIZE);
      void performSpotifySearch(false);
    }

    if (action === "search-next") {
      spotifySearchOffset += SEARCH_PAGE_SIZE;
      void performSpotifySearch(false);
    }

    if (action === "play-vibe" && vibeQuery) {
      void playVibe(vibeQuery);
    }
  });

  setSpotifyBrowserTab("home");
  renderVibes();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function updateDynamicCeilingReveal(): void {
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;
  if (viewportWidth <= 0 || viewportHeight <= 0) return;

  // Base scene stays 16:9 and bottom-anchored. Extra vertical space becomes ceiling reveal.
  const baseRoomWidth = Math.min(viewportWidth, viewportHeight * (16 / 9));
  const baseRoomHeight = baseRoomWidth * (9 / 16);
  const availableExtra = Math.max(0, viewportHeight - baseRoomHeight);
  const maxRevealPx = Math.min(260, baseRoomHeight * 0.28);
  const revealPx = Math.round(clamp(availableExtra, 0, maxRevealPx));
  const coordScale = baseRoomWidth > 0 ? ROOM_COORD_WIDTH / baseRoomWidth : 1;
  const revealCoord = Math.round(revealPx * coordScale);
  const revealRatio = maxRevealPx > 0 ? clamp(revealPx / maxRevealPx, 0, 1) : 0;
  const lyricCeilingViewCoord = 529 + revealCoord;
  const lyricCeilingViewPx = Math.round((lyricCeilingViewCoord / ROOM_COORD_WIDTH) * baseRoomWidth);

  const root = document.documentElement;
  root.style.setProperty("--dynamic-ceiling-reveal-px", `${revealPx}px`);
  root.style.setProperty("--dynamic-ceiling-reveal-coord", String(revealCoord));
  root.style.setProperty("--dynamic-ceiling-reveal-ratio", revealRatio.toFixed(4));
  root.style.setProperty("--lyric-ceiling-view-px", `${lyricCeilingViewPx}px`);
  root.classList.toggle("dynamic-ceiling-reveal-active", revealPx > 2);

  // The tall-window guide overlay is independent from normal lyric visibility,
  // so keep it synced whenever the reveal ratio changes on resize.
  renderTallLyricGuideOverlay();
}

function loadStringLightSettings(): StringLightSettings {
  try {
    const raw = window.localStorage.getItem(STRING_LIGHT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StringLightSettings>;
      const points = Array.isArray(parsed.points) && parsed.points.length
        ? parsed.points.map((point, index) => ({
            id: Number(point.id) || index + 1,
            x: clamp(Number(point.x) || 0, -240, ROOM_COORD_WIDTH + 240),
            y: clamp(Number(point.y) || 0, -160, ROOM_COORD_HEIGHT + 160),
            size: clamp(Number(point.size) || 14, 4, 42),
            intensity: clamp(Number(point.intensity) || 1, 0, 2),
            warmth: clamp(Number(point.warmth) || 0.7, 0, 1),
            flicker: clamp(Number(point.flicker) || 0.2, 0, 1),
            phase: Number.isFinite(Number(point.phase)) ? Number(point.phase) : index / 10,
          }))
        : DEFAULT_STRING_LIGHT_POINTS.map((point) => ({ ...point }));

      const selectedId = points.some((point) => point.id === parsed.selectedId)
        ? Number(parsed.selectedId)
        : points[0]?.id ?? null;

      return {
        ...DEFAULT_STRING_LIGHT_SETTINGS,
        ...parsed,
        selectedId,
        nextId: Math.max(Number(parsed.nextId) || 1, ...points.map((point) => point.id + 1), 1),
        points,
      };
    }
  } catch (error) {
    console.warn("Could not load string light settings", error);
  }

  return {
    ...DEFAULT_STRING_LIGHT_SETTINGS,
    points: DEFAULT_STRING_LIGHT_POINTS.map((point) => ({ ...point })),
  };
}

function saveStringLightSettings(): void {
  window.localStorage.setItem(STRING_LIGHT_KEY, JSON.stringify(stringLightSettings));
}

function loadAmbientTwinkleSettings(): AmbientTwinkleSettings {
  try {
    const raw = window.localStorage.getItem(AMBIENT_TWINKLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AmbientTwinkleSettings>;
      const points = Array.isArray(parsed.points) && parsed.points.length
        ? parsed.points.map((point, index) => ({
            id: Number(point.id) || index + 1,
            kind: point.kind === "city" ? "city" as const : "star" as const,
            x: clamp(Number(point.x) || 0, 0, ROOM_COORD_WIDTH),
            y: clamp(Number(point.y) || 0, 0, ROOM_COORD_HEIGHT),
            size: clamp(Number(point.size) || 2, 0.5, 12),
            intensity: clamp(Number(point.intensity) || 0.7, 0, 2),
            phase: Number.isFinite(Number(point.phase)) ? Number(point.phase) : index / 10,
          }))
        : DEFAULT_AMBIENT_TWINKLE_POINTS.map((point) => ({ ...point }));

      const selectedId = points.some((point) => point.id === parsed.selectedId)
        ? Number(parsed.selectedId)
        : points[0]?.id ?? null;

      return {
        ...DEFAULT_AMBIENT_TWINKLE_SETTINGS,
        ...parsed,
        selectedId,
        nextId: Math.max(Number(parsed.nextId) || 1, ...points.map((point) => point.id + 1), 1),
        points,
      };
    }
  } catch (error) {
    console.warn("Could not load ambient twinkle settings", error);
  }

  return {
    ...DEFAULT_AMBIENT_TWINKLE_SETTINGS,
    points: DEFAULT_AMBIENT_TWINKLE_POINTS.map((point) => ({ ...point })),
  };
}

function saveAmbientTwinkleSettings(): void {
  window.localStorage.setItem(AMBIENT_TWINKLE_KEY, JSON.stringify(ambientTwinkleSettings));
}

function selectedAmbientTwinklePoint(): AmbientTwinklePoint | null {
  return ambientTwinkleSettings.points.find((point) => point.id === ambientTwinkleSettings.selectedId) || null;
}

function selectedStringLightPoint(): StringLightPoint | null {
  return stringLightSettings.points.find((point) => point.id === stringLightSettings.selectedId) || null;
}

function applyStringLightPresetMigration(): void {
  try {
    if (window.localStorage.getItem(STRING_LIGHT_PRESET_MIGRATION_KEY) === "1") return;
    stringLightSettings = {
      ...DEFAULT_STRING_LIGHT_SETTINGS,
      points: DEFAULT_STRING_LIGHT_POINTS.map((point) => ({ ...point })),
    };
    saveStringLightSettings();
    window.localStorage.setItem(STRING_LIGHT_PRESET_MIGRATION_KEY, "1");
  } catch (error) {
    console.warn("Could not apply string light preset migration", error);
  }
}

function mixRgb(a: RgbTriple, b: RgbTriple, amount: number): RgbTriple {
  const t = clamp(amount, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgbTripleToCss(rgb: RgbTriple): string {
  return `${Math.round(clamp(rgb[0], 0, 255))}, ${Math.round(clamp(rgb[1], 0, 255))}, ${Math.round(clamp(rgb[2], 0, 255))}`;
}

function setReactiveRoomPalette(palette: ReactiveRoomPalette): void {
  const root = document.documentElement;
  root.style.setProperty("--string-light-core-rgb", rgbTripleToCss(palette.core));
  root.style.setProperty("--string-light-tint-rgb", rgbTripleToCss(palette.tint));
  root.style.setProperty("--string-light-ambient-rgb", rgbTripleToCss(palette.ambient));
  root.style.setProperty("--ambient-room-glow-rgb", rgbTripleToCss(palette.roomGlow));
  root.style.setProperty("--ambient-room-accent-rgb", rgbTripleToCss(palette.roomAccent));
}

function paletteFromTrackText(track: AppState["playback"]): ReactiveRoomPalette {
  const seed = `${track.title}|${track.artist}|${track.album}|${track.durationMs}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  const hue = hash % 360;
  const chroma = 0.56;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  const m = 0.28;
  const color: RgbTriple = [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  return {
    core: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.core, color, 0.24),
    tint: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.tint, color, 0.48),
    ambient: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.ambient, color, 0.34),
    roomGlow: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.roomGlow, color, 0.26),
    roomAccent: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.roomAccent, color, 0.28),
  };
}

async function extractReactiveRoomPalette(imageUrl: string): Promise<ReactiveRoomPalette> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load album art for room palette extraction."));
  });
  image.src = imageUrl;
  await loaded;

  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return DEFAULT_REACTIVE_ROOM_PALETTE;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let totalWeight = 0;
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let vibrantScore = -1;
  let vibrant: RgbTriple = DEFAULT_REACTIVE_ROOM_PALETTE.tint;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.18) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const saturation = maxChannel <= 0 ? 0 : (maxChannel - minChannel) / maxChannel;
    const brightness = (r + g + b) / (3 * 255);
    const weight = Math.max(0.12, alpha * (0.30 + saturation * 1.9 + (1 - Math.abs(brightness - 0.58)) * 0.45));

    totalWeight += weight;
    weightedR += r * weight;
    weightedG += g * weight;
    weightedB += b * weight;

    const score = saturation * 1.2 + brightness * 0.35;
    if (brightness > 0.16 && brightness < 0.92 && score > vibrantScore) {
      vibrantScore = score;
      vibrant = [r, g, b];
    }
  }

  const average: RgbTriple = totalWeight > 0
    ? [Math.round(weightedR / totalWeight), Math.round(weightedG / totalWeight), Math.round(weightedB / totalWeight)]
    : DEFAULT_REACTIVE_ROOM_PALETTE.tint;

  return {
    core: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.core, average, 0.24),
    tint: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.tint, vibrant, 0.50),
    ambient: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.ambient, average, 0.36),
    roomGlow: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.roomGlow, average, 0.30),
    roomAccent: mixRgb(DEFAULT_REACTIVE_ROOM_PALETTE.roomAccent, vibrant, 0.30),
  };
}

function updateReactiveRoomPalette(track: AppState["playback"]): void {
  const imageUrl = track.albumArtUrl || "";
  if (!imageUrl) {
    reactiveRoomPaletteUrl = "";
    setReactiveRoomPalette(paletteFromTrackText(track));
    return;
  }

  if (reactiveRoomPaletteUrl === imageUrl) return;

  const cached = reactiveRoomPaletteCache.get(imageUrl);
  if (cached) {
    reactiveRoomPaletteUrl = imageUrl;
    setReactiveRoomPalette(cached);
    return;
  }

  if (reactiveRoomPalettePendingUrl === imageUrl) return;
  reactiveRoomPalettePendingUrl = imageUrl;

  void extractReactiveRoomPalette(imageUrl)
    .then((palette) => {
      reactiveRoomPaletteCache.set(imageUrl, palette);
      if ((state.playback.albumArtUrl || "") !== imageUrl) return;
      reactiveRoomPaletteUrl = imageUrl;
      setReactiveRoomPalette(palette);
    })
    .catch(() => {
      if ((state.playback.albumArtUrl || "") !== imageUrl) return;
      reactiveRoomPaletteUrl = imageUrl;
      setReactiveRoomPalette(paletteFromTrackText(track));
    })
    .finally(() => {
      if (reactiveRoomPalettePendingUrl === imageUrl) reactiveRoomPalettePendingUrl = "";
    });
}

function syncMusicReactiveEnvironment(track: AppState["playback"]): void {
  const root = document.documentElement;
  const overlay = document.querySelector<HTMLElement>("#stringLightOverlay");
  const ambientGlow = document.querySelector<HTMLElement>("#ambientMusicGlow");
  const twinkleOverlay = document.querySelector<HTMLElement>("#ambientTwinkleOverlay");
  const playing = track.isPlaying || track.source === "demo";
  const beatMs = speakerPulseDurationMs();
  const pulseEnergy = clamp(((speakerTempoBpm || SPEAKER_PULSE_FALLBACK_BPM) - 62) / 108, 0, 1);

  root.classList.toggle("music-reactive-playing", playing);
  root.style.setProperty("--music-beat-ms", `${beatMs}ms`);
  root.style.setProperty("--music-breathe-ms", `${Math.round(Math.max(7200, beatMs * 14))}ms`);
  root.style.setProperty("--music-pulse-ms", `${Math.round(Math.max(2200, beatMs * 4.5))}ms`);
  root.style.setProperty("--music-room-energy", pulseEnergy.toFixed(3));

  if (overlay) {
    overlay.classList.toggle("string-lights-playing", playing);
    overlay.style.setProperty("--string-light-beat-ms", `${beatMs}ms`);
    overlay.style.setProperty("--string-light-breathe-ms", `${Math.round(Math.max(840, beatMs * 2.1))}ms`);
    overlay.style.setProperty("--string-light-flicker-ms", `${Math.round(Math.max(2800, beatMs * 8.5))}ms`);
    overlay.style.setProperty("--string-light-playing-opacity", playing ? `${0.74 + pulseEnergy * 0.16}` : "0.72");
  }

  if (ambientGlow) {
    ambientGlow.classList.toggle("ambient-music-glow-active", playing);
  }

  if (twinkleOverlay) {
    twinkleOverlay.classList.toggle("ambient-twinkles-playing", playing);
  }
}


function getDynamicCeilingRevealCoordFromRoot(rootStyles: CSSStyleDeclaration): number {
  const value = Number.parseFloat(rootStyles.getPropertyValue("--dynamic-ceiling-reveal-coord"));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function guidePointString(points: Array<[number, number]>): string {
  return points.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ");
}

function tallGuideY(value: number, revealCoord: number): number {
  return value + revealCoord;
}

function directTallScreenY(value: number): number {
  // Direct tall targets are now screen-space coordinates inside the expanded
  // ceiling overlay. They should appear exactly where the utility values say,
  // with no hidden reveal offset. Older tall rail/band guides still use
  // tallGuideY because they are stored in the old logical 16:9 coordinate space.
  return value;
}

function railXAtY(topX: number, topY: number, bottomX: number, bottomY: number, y: number): number {
  const denominator = bottomY - topY;
  if (Math.abs(denominator) < 0.001) return topX;
  return topX + (bottomX - topX) * ((y - topY) / denominator);
}

function interpolateTrapezoidX(leftTop: number, leftBottom: number, y: number, topY: number, bottomY: number): number {
  const denominator = bottomY - topY;
  const ratio = Math.abs(denominator) < 0.001 ? 0 : (y - topY) / denominator;
  return leftTop + (leftBottom - leftTop) * Math.max(0, Math.min(1, ratio));
}

type TallGuideQuad = {
  topLeftX: number;
  topLeftY: number;
  topRightX: number;
  topRightY: number;
  bottomLeftX: number;
  bottomLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
};

function buildRailDrivenTallGuideQuad(revealCoord: number, revealRatio: number, short = false): TallGuideQuad {
  const visibleTopY = -Math.max(0, revealCoord);
  const base = short
    ? {
        topLeftX: roomUtility.lyricPosterShortTopLeftX,
        topLeftY: roomUtility.lyricPosterShortTopLeftY,
        topRightX: roomUtility.lyricPosterShortTopRightX,
        topRightY: roomUtility.lyricPosterShortTopRightY,
        bottomLeftX: roomUtility.lyricPosterShortBottomLeftX,
        bottomLeftY: roomUtility.lyricPosterShortBottomLeftY,
        bottomRightX: roomUtility.lyricPosterShortBottomRightX,
        bottomRightY: roomUtility.lyricPosterShortBottomRightY,
      }
    : {
        topLeftX: roomUtility.lyricPosterTopLeftX,
        topLeftY: roomUtility.lyricPosterTopLeftY,
        topRightX: roomUtility.lyricPosterTopRightX,
        topRightY: roomUtility.lyricPosterTopRightY,
        bottomLeftX: roomUtility.lyricPosterBottomLeftX,
        bottomLeftY: roomUtility.lyricPosterBottomLeftY,
        bottomRightX: roomUtility.lyricPosterBottomRightX,
        bottomRightY: roomUtility.lyricPosterBottomRightY,
      };
  if (revealCoord <= 0.5 || revealRatio <= 0.0001) return base;

  const tall = short
    ? {
        topLeftX: roomUtility.lyricPosterTallShortTopLeftX,
        topLeftY: roomUtility.lyricPosterTallShortTopLeftY,
        topRightX: roomUtility.lyricPosterTallShortTopRightX,
        topRightY: roomUtility.lyricPosterTallShortTopRightY,
        bottomLeftX: roomUtility.lyricPosterTallShortBottomLeftX,
        bottomLeftY: roomUtility.lyricPosterTallShortBottomLeftY,
        bottomRightX: roomUtility.lyricPosterTallShortBottomRightX,
        bottomRightY: roomUtility.lyricPosterTallShortBottomRightY,
      }
    : {
        topLeftX: roomUtility.lyricPosterTallTopLeftX,
        topLeftY: roomUtility.lyricPosterTallTopLeftY,
        topRightX: roomUtility.lyricPosterTallTopRightX,
        topRightY: roomUtility.lyricPosterTallTopRightY,
        bottomLeftX: roomUtility.lyricPosterTallBottomLeftX,
        bottomLeftY: roomUtility.lyricPosterTallBottomLeftY,
        bottomRightX: roomUtility.lyricPosterTallBottomRightX,
        bottomRightY: roomUtility.lyricPosterTallBottomRightY,
      };

  const useLeftClamp = visibleTopY <= roomUtility.lyricPosterTallClampTopLeftY;
  const useRightClamp = visibleTopY <= roomUtility.lyricPosterTallClampTopRightY;
  const topLeftY = useLeftClamp ? roomUtility.lyricPosterTallClampTopLeftY : visibleTopY;
  const topRightY = useRightClamp ? roomUtility.lyricPosterTallClampTopRightY : visibleTopY;

  return {
    topLeftX: useLeftClamp
      ? roomUtility.lyricPosterTallClampTopLeftX
      : railXAtY(tall.topLeftX, tall.topLeftY, tall.bottomLeftX, tall.bottomLeftY, topLeftY),
    topLeftY,
    topRightX: useRightClamp
      ? roomUtility.lyricPosterTallClampTopRightX
      : railXAtY(tall.topRightX, tall.topRightY, tall.bottomRightX, tall.bottomRightY, topRightY),
    topRightY,
    bottomLeftX: base.bottomLeftX + (tall.bottomLeftX - base.bottomLeftX) * revealRatio,
    bottomLeftY: base.bottomLeftY + (tall.bottomLeftY - base.bottomLeftY) * revealRatio,
    bottomRightX: base.bottomRightX + (tall.bottomRightX - base.bottomRightX) * revealRatio,
    bottomRightY: base.bottomRightY + (tall.bottomRightY - base.bottomRightY) * revealRatio,
  };
}

function activeBandYFromTallTarget(main: TallGuideQuad, targetY: number): number {
  const tallTopY = (roomUtility.lyricPosterTallTopLeftY + roomUtility.lyricPosterTallTopRightY) / 2;
  const tallBottomY = (roomUtility.lyricPosterTallBottomLeftY + roomUtility.lyricPosterTallBottomRightY) / 2;
  const denominator = tallBottomY - tallTopY;
  const ratio = Math.abs(denominator) < 0.001 ? 0 : clamp((targetY - tallTopY) / denominator, 0, 1);
  const activeTopY = Math.min(main.topLeftY, main.topRightY);
  const activeBottomY = Math.max(main.bottomLeftY, main.bottomRightY);
  return activeTopY + (activeBottomY - activeTopY) * ratio;
}

function quadHorizontalBoundsAtY(quad: TallGuideQuad, y: number): { left: number; right: number } {
  return {
    left: railXAtY(quad.topLeftX, quad.topLeftY, quad.bottomLeftX, quad.bottomLeftY, y),
    right: railXAtY(quad.topRightX, quad.topRightY, quad.bottomRightX, quad.bottomRightY, y),
  };
}

function makeTallGuideBandPoints(
  main: TallGuideQuad,
  topY: number,
  bottomY: number,
  topLeftOffsetX: number,
  topLeftOffsetY: number,
  topRightOffsetX: number,
  topRightOffsetY: number,
  bottomLeftOffsetX: number,
  bottomLeftOffsetY: number,
  bottomRightOffsetX: number,
  bottomRightOffsetY: number,
  revealCoord: number,
): Array<[number, number]> {
  const topBounds = quadHorizontalBoundsAtY(main, topY);
  const bottomBounds = quadHorizontalBoundsAtY(main, bottomY);

  return [
    [topBounds.left + topLeftOffsetX, tallGuideY(topY + topLeftOffsetY, revealCoord)],
    [topBounds.right + topRightOffsetX, tallGuideY(topY + topRightOffsetY, revealCoord)],
    [bottomBounds.right + bottomRightOffsetX, tallGuideY(bottomY + bottomRightOffsetY, revealCoord)],
    [bottomBounds.left + bottomLeftOffsetX, tallGuideY(bottomY + bottomLeftOffsetY, revealCoord)],
  ];
}

function updateTallLyricGuideReadout(enabled: boolean, revealRatio: number, message?: string): void {
  const status = document.querySelector<HTMLElement>("#lyricPosterTallGuideStatus");
  const ratio = document.querySelector<HTMLElement>("#lyricPosterTallGuideRevealRatio");
  if (status) status.textContent = message || (enabled ? "visible" : "hidden");
  if (ratio) ratio.textContent = revealRatio.toFixed(2);
}

function directTallGuidePoints(prefix: "one" | "twoTop" | "twoBottom", revealCoord: number): Array<[number, number]> {
  if (prefix === "one") {
    return [
      [roomUtility.lyricPosterTallDirectOneRowTLX, directTallScreenY(roomUtility.lyricPosterTallDirectOneRowTLY)],
      [roomUtility.lyricPosterTallDirectOneRowTRX, directTallScreenY(roomUtility.lyricPosterTallDirectOneRowTRY)],
      [roomUtility.lyricPosterTallDirectOneRowBRX, directTallScreenY(roomUtility.lyricPosterTallDirectOneRowBRY)],
      [roomUtility.lyricPosterTallDirectOneRowBLX, directTallScreenY(roomUtility.lyricPosterTallDirectOneRowBLY)],
    ];
  }
  if (prefix === "twoTop") {
    return [
      [roomUtility.lyricPosterTallDirectTwoTopTLX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoTopTLY)],
      [roomUtility.lyricPosterTallDirectTwoTopTRX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoTopTRY)],
      [roomUtility.lyricPosterTallDirectTwoTopBRX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoTopBRY)],
      [roomUtility.lyricPosterTallDirectTwoTopBLX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoTopBLY)],
    ];
  }
  return [
    [roomUtility.lyricPosterTallDirectTwoBottomTLX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoBottomTLY)],
    [roomUtility.lyricPosterTallDirectTwoBottomTRX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoBottomTRY)],
    [roomUtility.lyricPosterTallDirectTwoBottomBRX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoBottomBRY)],
    [roomUtility.lyricPosterTallDirectTwoBottomBLX, directTallScreenY(roomUtility.lyricPosterTallDirectTwoBottomBLY)],
  ];
}

function renderTallLyricGuideOverlay(): void {
  const overlay = document.querySelector<SVGSVGElement>("#tallLyricGuideOverlay");
  if (!overlay) return;

  const rootStyles = getComputedStyle(document.documentElement);
  const revealCoord = getDynamicCeilingRevealCoordFromRoot(rootStyles);
  const revealRatioValue = Number.parseFloat(rootStyles.getPropertyValue("--dynamic-ceiling-reveal-ratio"));
  const revealRatio = Number.isFinite(revealRatioValue) ? clamp(revealRatioValue, 0, 1) : 0;
  const viewHeight = 529 + revealCoord;
  overlay.setAttribute("viewBox", `0 0 ${ROOM_COORD_WIDTH} ${viewHeight}`);
  overlay.style.setProperty("--tall-guide-opacity", String(roomUtility.lyricPosterTallGuideOpacity));

  const enabled = roomUtility.lyricPosterTallGuideEnabled && roomUtility.lyricPosterTallGuideOpacity > 0;
  updateTallLyricGuideReadout(enabled, revealRatio, enabled ? "visible" : "hidden");

  if (!enabled) {
    overlay.innerHTML = "";
    return;
  }

  const mainQuad = buildRailDrivenTallGuideQuad(revealCoord, revealRatio, false);
  const shortQuad = buildRailDrivenTallGuideQuad(revealCoord, revealRatio, true);
  const mainPoints: Array<[number, number]> = [
    [mainQuad.topLeftX, tallGuideY(mainQuad.topLeftY, revealCoord)],
    [mainQuad.topRightX, tallGuideY(mainQuad.topRightY, revealCoord)],
    [mainQuad.bottomRightX, tallGuideY(mainQuad.bottomRightY, revealCoord)],
    [mainQuad.bottomLeftX, tallGuideY(mainQuad.bottomLeftY, revealCoord)],
  ];

  const shortPoints: Array<[number, number]> = [
    [shortQuad.topLeftX, tallGuideY(shortQuad.topLeftY, revealCoord)],
    [shortQuad.topRightX, tallGuideY(shortQuad.topRightY, revealCoord)],
    [shortQuad.bottomRightX, tallGuideY(shortQuad.bottomRightY, revealCoord)],
    [shortQuad.bottomLeftX, tallGuideY(shortQuad.bottomLeftY, revealCoord)],
  ];

  const oneRowPoints: Array<[number, number]> = [
    [mainQuad.topLeftX + roomUtility.lyricPosterTallOneRowTextTopLeftX, tallGuideY(mainQuad.topLeftY + roomUtility.lyricPosterTallOneRowTextTopLeftY, revealCoord)],
    [mainQuad.topRightX + roomUtility.lyricPosterTallOneRowTextTopRightX, tallGuideY(mainQuad.topRightY + roomUtility.lyricPosterTallOneRowTextTopRightY, revealCoord)],
    [mainQuad.bottomRightX + roomUtility.lyricPosterTallOneRowTextBottomRightX, tallGuideY(mainQuad.bottomRightY + roomUtility.lyricPosterTallOneRowTextBottomRightY, revealCoord)],
    [mainQuad.bottomLeftX + roomUtility.lyricPosterTallOneRowTextBottomLeftX, tallGuideY(mainQuad.bottomLeftY + roomUtility.lyricPosterTallOneRowTextBottomLeftY, revealCoord)],
  ];

  const topBandTopY = activeBandYFromTallTarget(mainQuad, roomUtility.lyricPosterTallTwoRowTopBandTopY);
  const topBandBottomY = activeBandYFromTallTarget(mainQuad, roomUtility.lyricPosterTallTwoRowTopBandBottomY);
  const bottomBandTopY = activeBandYFromTallTarget(mainQuad, roomUtility.lyricPosterTallTwoRowBottomBandTopY);
  const bottomBandBottomY = activeBandYFromTallTarget(mainQuad, roomUtility.lyricPosterTallTwoRowBottomBandBottomY);

  const twoTopPoints = makeTallGuideBandPoints(
    mainQuad,
    topBandTopY,
    topBandBottomY,
    roomUtility.lyricPosterTallTwoRowTopTextTopLeftX,
    roomUtility.lyricPosterTallTwoRowTopTextTopLeftY,
    roomUtility.lyricPosterTallTwoRowTopTextTopRightX,
    roomUtility.lyricPosterTallTwoRowTopTextTopRightY,
    roomUtility.lyricPosterTallTwoRowTopTextBottomLeftX,
    roomUtility.lyricPosterTallTwoRowTopTextBottomLeftY,
    roomUtility.lyricPosterTallTwoRowTopTextBottomRightX,
    roomUtility.lyricPosterTallTwoRowTopTextBottomRightY,
    revealCoord,
  );

  const twoBottomPoints = makeTallGuideBandPoints(
    mainQuad,
    bottomBandTopY,
    bottomBandBottomY,
    roomUtility.lyricPosterTallTwoRowBottomTextTopLeftX,
    roomUtility.lyricPosterTallTwoRowBottomTextTopLeftY,
    roomUtility.lyricPosterTallTwoRowBottomTextTopRightX,
    roomUtility.lyricPosterTallTwoRowBottomTextTopRightY,
    roomUtility.lyricPosterTallTwoRowBottomTextBottomLeftX,
    roomUtility.lyricPosterTallTwoRowBottomTextBottomLeftY,
    roomUtility.lyricPosterTallTwoRowBottomTextBottomRightX,
    roomUtility.lyricPosterTallTwoRowBottomTextBottomRightY,
    revealCoord,
  );

  const directOneRowPoints = directTallGuidePoints("one", revealCoord);
  const directTwoTopPoints = directTallGuidePoints("twoTop", revealCoord);
  const directTwoBottomPoints = directTallGuidePoints("twoBottom", revealCoord);

  overlay.innerHTML = `
    <polygon class="tall-guide-polygon tall-guide-main" points="${guidePointString(mainPoints)}" />
    <polygon class="tall-guide-polygon tall-guide-short" points="${guidePointString(shortPoints)}" />
    <polygon class="tall-guide-polygon tall-guide-one" points="${guidePointString(directOneRowPoints)}" />
    <polygon class="tall-guide-polygon tall-guide-two-top" points="${guidePointString(directTwoTopPoints)}" />
    <polygon class="tall-guide-polygon tall-guide-two-bottom" points="${guidePointString(directTwoBottomPoints)}" />
    <text class="tall-guide-label tall-guide-main-label" x="${mainPoints[0][0] + 8}" y="${mainPoints[0][1] + 18}">MAIN</text>
    <text class="tall-guide-label tall-guide-short-label" x="${shortPoints[0][0] + 8}" y="${shortPoints[0][1] + 18}">SHORT</text>
    <text class="tall-guide-label tall-guide-one-label" x="${directOneRowPoints[0][0] + 8}" y="${directOneRowPoints[0][1] + 18}">1 ROW</text>
    <text class="tall-guide-label tall-guide-two-top-label" x="${directTwoTopPoints[0][0] + 8}" y="${directTwoTopPoints[0][1] + 18}">2 TOP</text>
    <text class="tall-guide-label tall-guide-two-bottom-label" x="${directTwoBottomPoints[0][0] + 8}" y="${directTwoBottomPoints[0][1] + 18}">2 BOT</text>
  `;
}

function setStringLightLabel(id: string, value: number): void {
  const label = document.querySelector<HTMLElement>(`#${id}`);
  if (!label) return;
  const decimals = id.includes("Intensity") || id.includes("Warmth") || id.includes("Glow") || id.includes("Pulse") || id.includes("Flicker")
    ? 2
    : 0;
  label.textContent = value.toFixed(decimals);
}

function syncStringLightControls(): void {
  const enabled = document.querySelector<HTMLInputElement>("#stringLightsEnabled");
  const editMode = document.querySelector<HTMLInputElement>("#stringLightsEditMode");
  const showGuides = document.querySelector<HTMLInputElement>("#stringLightsShowGuides");
  const json = document.querySelector<HTMLTextAreaElement>("#stringLightJson");
  const selectedLabel = document.querySelector<HTMLElement>("#stringLightSelectedLabel");

  if (enabled) enabled.checked = stringLightSettings.enabled;
  if (editMode) editMode.checked = stringLightSettings.editMode;
  if (showGuides) showGuides.checked = stringLightSettings.showGuides;

  setStringLightLabel("stringLightGlowValue", stringLightSettings.glow);
  setStringLightLabel("stringLightPulseValue", stringLightSettings.pulse);
  setStringLightLabel("stringLightFlickerValue", stringLightSettings.flicker);
  const glowInput = document.querySelector<HTMLInputElement>("#stringLightGlow");
  const pulseInput = document.querySelector<HTMLInputElement>("#stringLightPulse");
  const flickerInput = document.querySelector<HTMLInputElement>("#stringLightFlicker");
  if (glowInput) glowInput.value = String(stringLightSettings.glow);
  if (pulseInput) pulseInput.value = String(stringLightSettings.pulse);
  if (flickerInput) flickerInput.value = String(stringLightSettings.flicker);

  const selected = selectedStringLightPoint();
  if (selectedLabel) selectedLabel.textContent = selected ? `#${selected.id}` : "none";

  const selectedControls: Array<[string, string, keyof StringLightPoint]> = [
    ["stringLightX", "stringLightXValue", "x"],
    ["stringLightY", "stringLightYValue", "y"],
    ["stringLightSize", "stringLightSizeValue", "size"],
    ["stringLightIntensity", "stringLightIntensityValue", "intensity"],
    ["stringLightWarmth", "stringLightWarmthValue", "warmth"],
    ["stringLightPointFlicker", "stringLightPointFlickerValue", "flicker"],
  ];

  selectedControls.forEach(([inputId, labelId, key]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    const value = selected ? Number(selected[key]) : 0;
    if (input) {
      input.value = String(value);
      input.disabled = !selected;
    }
    setStringLightLabel(labelId, value);
  });

  if (json) json.value = JSON.stringify(stringLightSettings, null, 2);
}

function renderStringLights(): void {
  const overlay = document.querySelector<HTMLElement>("#stringLightOverlay");
  if (!overlay) return;

  overlay.innerHTML = "";
  overlay.classList.toggle("string-lights-enabled", stringLightSettings.enabled);
  overlay.classList.toggle("string-lights-editing", stringLightSettings.editMode);
  overlay.classList.toggle("string-lights-show-guides", stringLightSettings.showGuides);
  document.documentElement.classList.toggle("string-light-editing", stringLightSettings.editMode);

  overlay.style.setProperty("--string-light-glow", String(stringLightSettings.glow));
  overlay.style.setProperty("--string-light-pulse", String(stringLightSettings.pulse));
  overlay.style.setProperty("--string-light-flicker", String(stringLightSettings.flicker));
  if (!overlay.style.getPropertyValue("--string-light-beat-ms")) {
    overlay.style.setProperty("--string-light-beat-ms", `${speakerPulseDurationMs()}ms`);
    overlay.style.setProperty("--string-light-breathe-ms", `${Math.round(Math.max(840, speakerPulseDurationMs() * 2.1))}ms`);
    overlay.style.setProperty("--string-light-flicker-ms", `${Math.round(Math.max(2800, speakerPulseDurationMs() * 8.5))}ms`);
  }

  stringLightSettings.points.forEach((point) => {
    const light = document.createElement("button");
    light.type = "button";
    light.className = "string-light-point";
    light.dataset.lightId = String(point.id);
    light.classList.toggle("string-light-selected", point.id === stringLightSettings.selectedId);
    light.style.left = `${(point.x / ROOM_COORD_WIDTH) * 100}%`;
    light.style.top = `${(point.y / ROOM_COORD_HEIGHT) * 100}%`;
    light.style.setProperty("--bulb-size", String(point.size));
    light.style.setProperty("--bulb-intensity", String(point.intensity));
    light.style.setProperty("--bulb-warmth", String(point.warmth));
    light.style.setProperty("--bulb-phase", `${point.phase * -2.7}s`);
    light.style.setProperty("--bulb-flicker", String(point.flicker));
    light.setAttribute("aria-label", `String light point ${point.id}`);
    light.title = `Light #${point.id}`;
    light.innerHTML = `<span class="string-light-glow"></span><span class="string-light-core"></span><span class="string-light-label">${point.id}</span>`;
    light.addEventListener("click", (event) => {
      event.stopPropagation();
      stringLightSettings = { ...stringLightSettings, selectedId: point.id };
      saveStringLightSettings();
      renderStringLights();
      syncStringLightControls();
    });
    overlay.appendChild(light);
  });
}

function setStringLightSelectedByOffset(offset: number): void {
  if (!stringLightSettings.points.length) return;
  const currentIndex = Math.max(0, stringLightSettings.points.findIndex((point) => point.id === stringLightSettings.selectedId));
  const nextIndex = (currentIndex + offset + stringLightSettings.points.length) % stringLightSettings.points.length;
  stringLightSettings = { ...stringLightSettings, selectedId: stringLightSettings.points[nextIndex].id };
  saveStringLightSettings();
  renderStringLights();
  syncStringLightControls();
}

function updateSelectedStringLightPoint(partial: Partial<StringLightPoint>): void {
  const selectedId = stringLightSettings.selectedId;
  if (selectedId == null) return;
  stringLightSettings = {
    ...stringLightSettings,
    points: stringLightSettings.points.map((point) => point.id === selectedId ? { ...point, ...partial } : point),
  };
  saveStringLightSettings();
  renderStringLights();
  syncStringLightControls();
}

function addStringLightPoint(): void {
  const last = selectedStringLightPoint();
  const id = stringLightSettings.nextId;
  const point: StringLightPoint = {
    id,
    x: clamp((last?.x ?? 880) + 32, 0, ROOM_COORD_WIDTH),
    y: clamp(last?.y ?? 336, 0, ROOM_COORD_HEIGHT),
    size: last?.size ?? 14,
    intensity: last?.intensity ?? 1,
    warmth: last?.warmth ?? 0.72,
    flicker: last?.flicker ?? 0.2,
    phase: (id % 11) / 11,
  };
  stringLightSettings = {
    ...stringLightSettings,
    editMode: true,
    selectedId: id,
    nextId: id + 1,
    points: [...stringLightSettings.points, point],
  };
  saveStringLightSettings();
  renderStringLights();
  syncStringLightControls();
}

function deleteSelectedStringLightPoint(): void {
  const selectedId = stringLightSettings.selectedId;
  if (selectedId == null) return;
  const points = stringLightSettings.points.filter((point) => point.id !== selectedId);
  stringLightSettings = {
    ...stringLightSettings,
    points,
    selectedId: points[0]?.id ?? null,
  };
  saveStringLightSettings();
  renderStringLights();
  syncStringLightControls();
}

function resetStringLightPoints(): void {
  stringLightSettings = {
    ...DEFAULT_STRING_LIGHT_SETTINGS,
    points: DEFAULT_STRING_LIGHT_POINTS.map((point) => ({ ...point })),
  };
  saveStringLightSettings();
  renderStringLights();
  syncStringLightControls();
}

function bindStringLightControls(): void {
  const room = document.querySelector<HTMLElement>(".room");
  const enabled = document.querySelector<HTMLInputElement>("#stringLightsEnabled");
  const editMode = document.querySelector<HTMLInputElement>("#stringLightsEditMode");
  const showGuides = document.querySelector<HTMLInputElement>("#stringLightsShowGuides");
  const addButton = document.querySelector<HTMLButtonElement>("#stringLightAdd");
  const prevButton = document.querySelector<HTMLButtonElement>("#stringLightPrev");
  const nextButton = document.querySelector<HTMLButtonElement>("#stringLightNext");
  const deleteButton = document.querySelector<HTMLButtonElement>("#stringLightDelete");
  const resetButton = document.querySelector<HTMLButtonElement>("#stringLightReset");
  const copyButton = document.querySelector<HTMLButtonElement>("#stringLightCopyJson");

  enabled?.addEventListener("change", () => {
    stringLightSettings = { ...stringLightSettings, enabled: enabled.checked };
    saveStringLightSettings();
    renderStringLights();
    syncStringLightControls();
  });

  editMode?.addEventListener("change", () => {
    stringLightSettings = { ...stringLightSettings, editMode: editMode.checked };
    saveStringLightSettings();
    renderStringLights();
    syncStringLightControls();
  });

  showGuides?.addEventListener("change", () => {
    stringLightSettings = { ...stringLightSettings, showGuides: showGuides.checked };
    saveStringLightSettings();
    renderStringLights();
    syncStringLightControls();
  });

  [
    ["stringLightGlow", "glow"],
    ["stringLightPulse", "pulse"],
    ["stringLightFlicker", "flicker"],
  ].forEach(([inputId, key]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    input?.addEventListener("input", () => {
      stringLightSettings = { ...stringLightSettings, [key]: Number(input.value) };
      saveStringLightSettings();
      renderStringLights();
      syncStringLightControls();
    });
  });

  [
    ["stringLightX", "x", 0, ROOM_COORD_WIDTH],
    ["stringLightY", "y", 0, ROOM_COORD_HEIGHT],
    ["stringLightSize", "size", 4, 42],
    ["stringLightIntensity", "intensity", 0, 2],
    ["stringLightWarmth", "warmth", 0, 1],
    ["stringLightPointFlicker", "flicker", 0, 1],
  ].forEach(([inputId, key, min, max]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    input?.addEventListener("input", () => {
      updateSelectedStringLightPoint({ [key as keyof StringLightPoint]: clamp(Number(input.value), Number(min), Number(max)) } as Partial<StringLightPoint>);
    });
  });

  addButton?.addEventListener("click", addStringLightPoint);
  prevButton?.addEventListener("click", () => setStringLightSelectedByOffset(-1));
  nextButton?.addEventListener("click", () => setStringLightSelectedByOffset(1));
  deleteButton?.addEventListener("click", deleteSelectedStringLightPoint);
  resetButton?.addEventListener("click", resetStringLightPoints);
  copyButton?.addEventListener("click", () => {
    const payload = JSON.stringify(stringLightSettings, null, 2);
    void navigator.clipboard?.writeText(payload);
    const json = document.querySelector<HTMLTextAreaElement>("#stringLightJson");
    if (json) {
      json.focus();
      json.select();
    }
  });

  room?.addEventListener("click", (event) => {
    if (!stringLightSettings.editMode) return;
    if ((event.target as HTMLElement).closest(".string-light-point")) return;
    const rect = room.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * ROOM_COORD_WIDTH, 0, ROOM_COORD_WIDTH);
    const y = clamp(((event.clientY - rect.top) / rect.height) * ROOM_COORD_HEIGHT, 0, ROOM_COORD_HEIGHT);
    if (stringLightSettings.selectedId == null) {
      addStringLightPoint();
    }
    updateSelectedStringLightPoint({ x, y });
  });

  window.addEventListener("resize", () => {
    if (stringLightResizeTimer) window.clearTimeout(stringLightResizeTimer);
    stringLightResizeTimer = window.setTimeout(() => renderStringLights(), 120);
  });

  renderStringLights();
  syncStringLightControls();
}

function setAmbientTwinkleLabel(id: string, value: number): void {
  const decimals = id.includes("Opacity") || id.includes("Twinkle") || id.includes("Intensity") || id.includes("Size") ? 2 : 0;
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element) element.textContent = value.toFixed(decimals).replace(/\.00$/, "");
}

function syncAmbientTwinkleControls(): void {
  const enabled = document.querySelector<HTMLInputElement>("#ambientTwinkleEnabled");
  const editMode = document.querySelector<HTMLInputElement>("#ambientTwinkleEditMode");
  const showGuides = document.querySelector<HTMLInputElement>("#ambientTwinkleShowGuides");
  const kind = document.querySelector<HTMLSelectElement>("#ambientTwinkleKind");
  const selectedLabel = document.querySelector<HTMLElement>("#ambientTwinkleSelectedLabel");
  const json = document.querySelector<HTMLTextAreaElement>("#ambientTwinkleJson");

  if (enabled) enabled.checked = ambientTwinkleSettings.enabled;
  if (editMode) editMode.checked = ambientTwinkleSettings.editMode;
  if (showGuides) showGuides.checked = ambientTwinkleSettings.showGuides;

  const globalControls: Array<[string, string, keyof AmbientTwinkleSettings]> = [
    ["ambientStarOpacity", "ambientStarOpacityValue", "starOpacity"],
    ["ambientCityOpacity", "ambientCityOpacityValue", "cityOpacity"],
    ["ambientTwinkleAmount", "ambientTwinkleAmountValue", "twinkle"],
  ];
  globalControls.forEach(([inputId, labelId, key]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    const value = Number(ambientTwinkleSettings[key]);
    if (input) input.value = String(value);
    setAmbientTwinkleLabel(labelId, value);
  });

  const selected = selectedAmbientTwinklePoint();
  if (selectedLabel) selectedLabel.textContent = selected ? `${selected.kind} #${selected.id}` : "none";
  if (kind && selected) kind.value = selected.kind;

  const pointControls: Array<[string, string, keyof AmbientTwinklePoint]> = [
    ["ambientTwinkleX", "ambientTwinkleXValue", "x"],
    ["ambientTwinkleY", "ambientTwinkleYValue", "y"],
    ["ambientTwinkleSize", "ambientTwinkleSizeValue", "size"],
    ["ambientTwinkleIntensity", "ambientTwinkleIntensityValue", "intensity"],
  ];
  pointControls.forEach(([inputId, labelId, key]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    const value = selected ? Number(selected[key]) : 0;
    if (input) {
      input.value = String(value);
      input.disabled = !selected;
    }
    setAmbientTwinkleLabel(labelId, value);
  });

  if (json) json.value = JSON.stringify(ambientTwinkleSettings, null, 2);
}

function renderAmbientTwinkles(): void {
  const overlay = document.querySelector<HTMLElement>("#ambientTwinkleOverlay");
  if (!overlay) return;

  overlay.innerHTML = "";
  overlay.classList.toggle("ambient-twinkles-enabled", ambientTwinkleSettings.enabled);
  overlay.classList.toggle("ambient-twinkles-editing", ambientTwinkleSettings.editMode);
  overlay.classList.toggle("ambient-twinkles-show-guides", ambientTwinkleSettings.showGuides);
  document.documentElement.classList.toggle("ambient-twinkle-editing", ambientTwinkleSettings.editMode);
  overlay.style.setProperty("--ambient-star-opacity", String(ambientTwinkleSettings.starOpacity));
  overlay.style.setProperty("--ambient-city-opacity", String(ambientTwinkleSettings.cityOpacity));
  overlay.style.setProperty("--ambient-twinkle", String(ambientTwinkleSettings.twinkle));

  ambientTwinkleSettings.points.forEach((point) => {
    const light = document.createElement("button");
    light.type = "button";
    light.className = `ambient-twinkle-point ambient-twinkle-${point.kind}`;
    light.dataset.twinkleId = String(point.id);
    light.classList.toggle("ambient-twinkle-selected", point.id === ambientTwinkleSettings.selectedId);
    light.style.left = `${(point.x / ROOM_COORD_WIDTH) * 100}%`;
    light.style.top = `${(point.y / ROOM_COORD_HEIGHT) * 100}%`;
    light.style.setProperty("--twinkle-size", String(point.size));
    light.style.setProperty("--twinkle-intensity", String(point.intensity));
    light.style.setProperty("--twinkle-phase", `${point.phase * -6.4}s`);
    light.setAttribute("aria-label", `${point.kind} twinkle ${point.id}`);
    light.title = `${point.kind} #${point.id}`;
    light.innerHTML = `<span class="ambient-twinkle-glow"></span><span class="ambient-twinkle-core"></span><span class="ambient-twinkle-label">${point.kind[0].toUpperCase()}${point.id}</span>`;
    light.addEventListener("click", (event) => {
      event.stopPropagation();
      ambientTwinkleSettings = { ...ambientTwinkleSettings, selectedId: point.id };
      saveAmbientTwinkleSettings();
      renderAmbientTwinkles();
      syncAmbientTwinkleControls();
    });
    overlay.appendChild(light);
  });
}

function setAmbientTwinkleSelectedByOffset(offset: number): void {
  if (!ambientTwinkleSettings.points.length) return;
  const currentIndex = Math.max(0, ambientTwinkleSettings.points.findIndex((point) => point.id === ambientTwinkleSettings.selectedId));
  const nextIndex = (currentIndex + offset + ambientTwinkleSettings.points.length) % ambientTwinkleSettings.points.length;
  ambientTwinkleSettings = { ...ambientTwinkleSettings, selectedId: ambientTwinkleSettings.points[nextIndex].id };
  saveAmbientTwinkleSettings();
  renderAmbientTwinkles();
  syncAmbientTwinkleControls();
}

function updateSelectedAmbientTwinklePoint(partial: Partial<AmbientTwinklePoint>): void {
  const selectedId = ambientTwinkleSettings.selectedId;
  if (selectedId == null) return;
  ambientTwinkleSettings = {
    ...ambientTwinkleSettings,
    points: ambientTwinkleSettings.points.map((point) => point.id === selectedId ? { ...point, ...partial } : point),
  };
  saveAmbientTwinkleSettings();
  renderAmbientTwinkles();
  syncAmbientTwinkleControls();
}

function addAmbientTwinklePoint(kind: AmbientTwinkleKind = "star"): void {
  const last = selectedAmbientTwinklePoint();
  const id = ambientTwinkleSettings.nextId;
  const point: AmbientTwinklePoint = {
    id,
    kind,
    x: clamp((last?.x ?? 900) + 18, 0, ROOM_COORD_WIDTH),
    y: clamp((last?.y ?? (kind === "star" ? 390 : 520)) + 8, 0, ROOM_COORD_HEIGHT),
    size: kind === "star" ? 1.8 : 2.2,
    intensity: kind === "star" ? 0.62 : 0.74,
    phase: (id * 0.137) % 1,
  };
  ambientTwinkleSettings = {
    ...ambientTwinkleSettings,
    selectedId: id,
    nextId: id + 1,
    points: [...ambientTwinkleSettings.points, point],
  };
  saveAmbientTwinkleSettings();
  renderAmbientTwinkles();
  syncAmbientTwinkleControls();
}

function deleteSelectedAmbientTwinklePoint(): void {
  const selectedId = ambientTwinkleSettings.selectedId;
  if (selectedId == null) return;
  const points = ambientTwinkleSettings.points.filter((point) => point.id !== selectedId);
  ambientTwinkleSettings = {
    ...ambientTwinkleSettings,
    points,
    selectedId: points[0]?.id ?? null,
  };
  saveAmbientTwinkleSettings();
  renderAmbientTwinkles();
  syncAmbientTwinkleControls();
}

function resetAmbientTwinkles(): void {
  ambientTwinkleSettings = {
    ...DEFAULT_AMBIENT_TWINKLE_SETTINGS,
    points: DEFAULT_AMBIENT_TWINKLE_POINTS.map((point) => ({ ...point })),
  };
  saveAmbientTwinkleSettings();
  renderAmbientTwinkles();
  syncAmbientTwinkleControls();
}

function bindAmbientTwinkleControls(): void {
  const enabled = document.querySelector<HTMLInputElement>("#ambientTwinkleEnabled");
  const editMode = document.querySelector<HTMLInputElement>("#ambientTwinkleEditMode");
  const showGuides = document.querySelector<HTMLInputElement>("#ambientTwinkleShowGuides");
  const kind = document.querySelector<HTMLSelectElement>("#ambientTwinkleKind");
  const addStar = document.querySelector<HTMLButtonElement>("#ambientTwinkleAddStar");
  const addCity = document.querySelector<HTMLButtonElement>("#ambientTwinkleAddCity");
  const prevButton = document.querySelector<HTMLButtonElement>("#ambientTwinklePrev");
  const nextButton = document.querySelector<HTMLButtonElement>("#ambientTwinkleNext");
  const deleteButton = document.querySelector<HTMLButtonElement>("#ambientTwinkleDelete");
  const resetButton = document.querySelector<HTMLButtonElement>("#ambientTwinkleReset");
  const copyButton = document.querySelector<HTMLButtonElement>("#ambientTwinkleCopyJson");
  const room = document.querySelector<HTMLElement>(".room");

  enabled?.addEventListener("change", () => {
    ambientTwinkleSettings = { ...ambientTwinkleSettings, enabled: enabled.checked };
    saveAmbientTwinkleSettings();
    renderAmbientTwinkles();
    syncAmbientTwinkleControls();
  });

  editMode?.addEventListener("change", () => {
    ambientTwinkleSettings = { ...ambientTwinkleSettings, editMode: editMode.checked };
    saveAmbientTwinkleSettings();
    renderAmbientTwinkles();
    syncAmbientTwinkleControls();
  });

  showGuides?.addEventListener("change", () => {
    ambientTwinkleSettings = { ...ambientTwinkleSettings, showGuides: showGuides.checked };
    saveAmbientTwinkleSettings();
    renderAmbientTwinkles();
    syncAmbientTwinkleControls();
  });

  [
    ["ambientStarOpacity", "starOpacity"],
    ["ambientCityOpacity", "cityOpacity"],
    ["ambientTwinkleAmount", "twinkle"],
  ].forEach(([inputId, key]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    input?.addEventListener("input", () => {
      ambientTwinkleSettings = { ...ambientTwinkleSettings, [key]: Number(input.value) };
      saveAmbientTwinkleSettings();
      renderAmbientTwinkles();
      syncAmbientTwinkleControls();
    });
  });

  kind?.addEventListener("change", () => updateSelectedAmbientTwinklePoint({ kind: kind.value === "city" ? "city" : "star" }));

  [
    ["ambientTwinkleX", "x", 0, ROOM_COORD_WIDTH],
    ["ambientTwinkleY", "y", 0, ROOM_COORD_HEIGHT],
    ["ambientTwinkleSize", "size", 0.5, 12],
    ["ambientTwinkleIntensity", "intensity", 0, 2],
  ].forEach(([inputId, key, min, max]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    input?.addEventListener("input", () => {
      updateSelectedAmbientTwinklePoint({ [key as keyof AmbientTwinklePoint]: clamp(Number(input.value), Number(min), Number(max)) } as Partial<AmbientTwinklePoint>);
    });
  });

  addStar?.addEventListener("click", () => addAmbientTwinklePoint("star"));
  addCity?.addEventListener("click", () => addAmbientTwinklePoint("city"));
  prevButton?.addEventListener("click", () => setAmbientTwinkleSelectedByOffset(-1));
  nextButton?.addEventListener("click", () => setAmbientTwinkleSelectedByOffset(1));
  deleteButton?.addEventListener("click", deleteSelectedAmbientTwinklePoint);
  resetButton?.addEventListener("click", resetAmbientTwinkles);
  copyButton?.addEventListener("click", () => {
    const payload = JSON.stringify(ambientTwinkleSettings, null, 2);
    void navigator.clipboard?.writeText(payload).catch(() => undefined);
    const json = document.querySelector<HTMLTextAreaElement>("#ambientTwinkleJson");
    if (json) {
      json.value = payload;
      json.select();
    }
  });

  room?.addEventListener("click", (event) => {
    if (!ambientTwinkleSettings.editMode) return;
    if ((event.target as HTMLElement).closest(".ambient-twinkle-point")) return;
    if ((event.target as HTMLElement).closest(".string-light-point")) return;
    const rect = room.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * ROOM_COORD_WIDTH, 0, ROOM_COORD_WIDTH);
    const y = clamp(((event.clientY - rect.top) / rect.height) * ROOM_COORD_HEIGHT, 0, ROOM_COORD_HEIGHT);
    if (ambientTwinkleSettings.selectedId == null) addAmbientTwinklePoint("star");
    updateSelectedAmbientTwinklePoint({ x, y });
  });

  window.addEventListener("resize", () => {
    if (ambientTwinkleResizeTimer) window.clearTimeout(ambientTwinkleResizeTimer);
    ambientTwinkleResizeTimer = window.setTimeout(() => renderAmbientTwinkles(), 120);
  });

  renderAmbientTwinkles();
  syncAmbientTwinkleControls();
}

function bindRoomUtilityControls(): void {
  const sceneFilter = document.querySelector<HTMLSelectElement>("#sceneFilterSelect");
  const lyricPosterMaxRows = document.querySelector<HTMLSelectElement>("#lyricPosterMaxRows");
  const lyricPosterTransition = document.querySelector<HTMLSelectElement>("#lyricPosterTransition");
  const lyricPosterStrokeColor = document.querySelector<HTMLInputElement>("#lyricPosterStrokeColor");
  const lyricPosterFillColor = document.querySelector<HTMLInputElement>("#lyricPosterFillColor");
  const lyricPosterEffectDropShadow = document.querySelector<HTMLInputElement>("#lyricPosterEffectDropShadow");
  const lyricPosterEffectEmboss = document.querySelector<HTMLInputElement>("#lyricPosterEffectEmboss");
  const lyricPosterEffectInsetEmboss = document.querySelector<HTMLInputElement>("#lyricPosterEffectInsetEmboss");
  const lyricPosterEffectBevel = document.querySelector<HTMLInputElement>("#lyricPosterEffectBevel");
  const lyricPosterEffectSoftBlur = document.querySelector<HTMLInputElement>("#lyricPosterEffectSoftBlur");
  const lyricPosterTallGuideEnabled = document.querySelector<HTMLInputElement>("#lyricPosterTallGuideEnabled");
  const panelHeightAdjustEnabled = document.querySelector<HTMLInputElement>("#panelHeightAdjustEnabled");
  const roomFillStretchMode = document.querySelector<HTMLInputElement>("#roomFillStretchMode");
  const utilityPanelLeftSide = document.querySelector<HTMLInputElement>("#utilityPanelLeftSide");
  const songChangeMode = document.querySelector<HTMLInputElement>("#songChangeMode");
  const placedAlbumEnabled = document.querySelector<HTMLInputElement>("#placedAlbumEnabled");
  const vinylClockEnabled = document.querySelector<HTMLInputElement>("#vinylClockEnabled");
  const speakerPulseUseTempo = document.querySelector<HTMLInputElement>("#speakerPulseUseTempo");
  const speakerPulseUseExternalTempo = document.querySelector<HTMLInputElement>("#speakerPulseUseExternalTempo");

  if (sceneFilter) sceneFilter.value = roomUtility.sceneFilter;
  if (lyricPosterMaxRows) lyricPosterMaxRows.value = roomUtility.lyricPosterMaxRows;
  if (lyricPosterTransition) lyricPosterTransition.value = roomUtility.lyricPosterTransition;
  if (lyricPosterStrokeColor) lyricPosterStrokeColor.value = roomUtility.lyricPosterStrokeColor;
  if (lyricPosterFillColor) lyricPosterFillColor.value = roomUtility.lyricPosterFillColor;
  if (lyricPosterEffectDropShadow) lyricPosterEffectDropShadow.checked = roomUtility.lyricPosterEffectDropShadow;
  if (lyricPosterEffectEmboss) lyricPosterEffectEmboss.checked = roomUtility.lyricPosterEffectEmboss;
  if (lyricPosterEffectInsetEmboss) lyricPosterEffectInsetEmboss.checked = roomUtility.lyricPosterEffectInsetEmboss;
  if (lyricPosterEffectBevel) lyricPosterEffectBevel.checked = roomUtility.lyricPosterEffectBevel;
  if (lyricPosterEffectSoftBlur) lyricPosterEffectSoftBlur.checked = roomUtility.lyricPosterEffectSoftBlur;
  if (lyricPosterTallGuideEnabled) lyricPosterTallGuideEnabled.checked = roomUtility.lyricPosterTallGuideEnabled;
  if (panelHeightAdjustEnabled) panelHeightAdjustEnabled.checked = roomUtility.panelHeightAdjustEnabled;
  if (roomFillStretchMode) roomFillStretchMode.checked = roomUtility.roomFillStretchMode;
  if (utilityPanelLeftSide) utilityPanelLeftSide.checked = roomUtility.utilityPanelLeftSide;
  if (songChangeMode) songChangeMode.checked = roomUtility.songChangeMode;
  if (placedAlbumEnabled) placedAlbumEnabled.checked = roomUtility.placedAlbumEnabled;
  if (vinylClockEnabled) vinylClockEnabled.checked = roomUtility.vinylClockEnabled;
  if (speakerPulseUseTempo) speakerPulseUseTempo.checked = roomUtility.speakerPulseUseTempo;
  if (speakerPulseUseExternalTempo) speakerPulseUseExternalTempo.checked = roomUtility.speakerPulseUseExternalTempo;

  panelHeightAdjustEnabled?.addEventListener("change", () => {
    setPanelHeightAdjustEnabled(panelHeightAdjustEnabled.checked, false);
  });

  roomFillStretchMode?.addEventListener("change", () => {
    setRoomFillStretchMode(roomFillStretchMode.checked);
  });

  utilityPanelLeftSide?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, utilityPanelLeftSide: utilityPanelLeftSide.checked };
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  songChangeMode?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, songChangeMode: songChangeMode.checked };
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  placedAlbumEnabled?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, placedAlbumEnabled: placedAlbumEnabled.checked };
    applyRoomUtilitySettings();
    updatePlacedActiveAlbum(state.playback);
    saveRoomUtilitySettings();
  });

  vinylClockEnabled?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, vinylClockEnabled: vinylClockEnabled.checked };
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  speakerPulseUseTempo?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, speakerPulseUseTempo: speakerPulseUseTempo.checked };
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  speakerPulseUseExternalTempo?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, speakerPulseUseExternalTempo: speakerPulseUseExternalTempo.checked };
    speakerTempoFetchKey = "";
    applySpeakerPulseTempo(state.playback);
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  const controls = [
    ["speakerLeftX", "speakerLeftXValue"],
    ["speakerRightX", "speakerRightXValue"],
    ["speakerY", "speakerYValue"],
    ["speakerScale", "speakerScaleValue"],
    ["speakerOpacity", "speakerOpacityValue"],
    ["speakerPulse", "speakerPulseValue"],
    ["speakerPulseX", "speakerPulseXValue"],
    ["speakerPulseY", "speakerPulseYValue"],
    ["speakerPulseSize", "speakerPulseSizeValue"],
    ["speakerWarpOpacity", "speakerWarpOpacityValue"],
    ["mixerTempoLedX", "mixerTempoLedXValue"],
    ["mixerTempoLedY", "mixerTempoLedYValue"],
    ["mixerTempoLedSize", "mixerTempoLedSizeValue"],
    ["mixerLyricsLedX", "mixerLyricsLedXValue"],
    ["mixerLyricsLedY", "mixerLyricsLedYValue"],
    ["mixerLyricsLedSize", "mixerLyricsLedSizeValue"],
    ["filterStrength", "filterStrengthValue"],
    ["vignetteStrength", "vignetteStrengthValue"],
    ["shadowOpacity", "shadowOpacityValue"],
    ["tableShadowScale", "tableShadowScaleValue"],
    ["floorControlsIdleOpacity", "floorControlsIdleOpacityValue"],
    ["songChangeAlbumX", "songChangeAlbumXValue"],
    ["songChangeAlbumY", "songChangeAlbumYValue"],
    ["songChangeAlbumSize", "songChangeAlbumSizeValue"],
    ["placedAlbumX", "placedAlbumXValue"],
    ["placedAlbumY", "placedAlbumYValue"],
    ["placedAlbumSize", "placedAlbumSizeValue"],
    ["placedAlbumRotateX", "placedAlbumRotateXValue"],
    ["placedAlbumRotateY", "placedAlbumRotateYValue"],
    ["placedAlbumRotateZ", "placedAlbumRotateZValue"],
    ["placedAlbumDepth", "placedAlbumDepthValue"],
    ["placedAlbumShadow", "placedAlbumShadowValue"],
    ["placedAlbumOpacity", "placedAlbumOpacityValue"],
    ["panelStartY", "panelStartYValue"],
    ["vinylClockX", "vinylClockXValue"],
    ["vinylClockY", "vinylClockYValue"],
    ["vinylClockSize", "vinylClockSizeValue"],
    ["vinylClockScale", "vinylClockScaleValue"],
    ["vinylClockTilt", "vinylClockTiltValue"],
    ["vinylClockOpacity", "vinylClockOpacityValue"],
    ["vinylClockGlow", "vinylClockGlowValue"],
    ["vinylClockShadowX", "vinylClockShadowXValue"],
    ["vinylClockShadowY", "vinylClockShadowYValue"],
    ["vinylClockShadowBlur", "vinylClockShadowBlurValue"],
    ["vinylClockShadowOpacity", "vinylClockShadowOpacityValue"],
    ["vinylClockRoomBlend", "vinylClockRoomBlendValue"],
    ["vinylClockWallFade", "vinylClockWallFadeValue"],
    ["lyricPosterGuideOpacity", "lyricPosterGuideOpacityValue"],
    ["lyricPosterCenterGuideOpacity", "lyricPosterCenterGuideOpacityValue"],
    ["lyricPosterShortGuideOpacity", "lyricPosterShortGuideOpacityValue"],
    ["lyricPosterTallGuideOpacity", "lyricPosterTallGuideOpacityValue"],
    ["lyricPosterShortTopLeftX", "lyricPosterShortTopLeftXValue"],
    ["lyricPosterShortTopLeftY", "lyricPosterShortTopLeftYValue"],
    ["lyricPosterShortTopRightX", "lyricPosterShortTopRightXValue"],
    ["lyricPosterShortTopRightY", "lyricPosterShortTopRightYValue"],
    ["lyricPosterShortBottomLeftX", "lyricPosterShortBottomLeftXValue"],
    ["lyricPosterShortBottomLeftY", "lyricPosterShortBottomLeftYValue"],
    ["lyricPosterShortBottomRightX", "lyricPosterShortBottomRightXValue"],
    ["lyricPosterShortBottomRightY", "lyricPosterShortBottomRightYValue"],
    ["lyricPosterShortVerticalStretch", "lyricPosterShortVerticalStretchValue"],
    ["lyricPosterShortPerspective", "lyricPosterShortPerspectiveValue"],
    ["lyricPosterShortTilt", "lyricPosterShortTiltValue"],
    ["lyricPosterShortTextTopLeftX", "lyricPosterShortTextTopLeftXValue"],
    ["lyricPosterShortTextTopLeftY", "lyricPosterShortTextTopLeftYValue"],
    ["lyricPosterShortTextTopRightX", "lyricPosterShortTextTopRightXValue"],
    ["lyricPosterShortTextTopRightY", "lyricPosterShortTextTopRightYValue"],
    ["lyricPosterShortTextBottomLeftX", "lyricPosterShortTextBottomLeftXValue"],
    ["lyricPosterShortTextBottomLeftY", "lyricPosterShortTextBottomLeftYValue"],
    ["lyricPosterShortTextBottomRightX", "lyricPosterShortTextBottomRightXValue"],
    ["lyricPosterShortTextBottomRightY", "lyricPosterShortTextBottomRightYValue"],
    ["lyricPosterTwoRowBandGuideOpacity", "lyricPosterTwoRowBandGuideOpacityValue"],
    ["lyricPosterThreeRowBandGuideOpacity", "lyricPosterThreeRowBandGuideOpacityValue"],
    ["lyricPosterTopLeftX", "lyricPosterTopLeftXValue"],
    ["lyricPosterTopLeftY", "lyricPosterTopLeftYValue"],
    ["lyricPosterTopRightX", "lyricPosterTopRightXValue"],
    ["lyricPosterTopRightY", "lyricPosterTopRightYValue"],
    ["lyricPosterBottomLeftX", "lyricPosterBottomLeftXValue"],
    ["lyricPosterBottomLeftY", "lyricPosterBottomLeftYValue"],
    ["lyricPosterBottomRightX", "lyricPosterBottomRightXValue"],
    ["lyricPosterBottomRightY", "lyricPosterBottomRightYValue"],
    ["lyricPosterStroke", "lyricPosterStrokeValue"],
    ["lyricPosterRowBreakpoint", "lyricPosterRowBreakpointValue"],
    ["lyricPosterStrokeOpacity", "lyricPosterStrokeOpacityValue"],
    ["lyricPosterFillOpacity", "lyricPosterFillOpacityValue"],
    ["lyricPosterGlow", "lyricPosterGlowValue"],
    ["lyricPosterOneRowVerticalStretch", "lyricPosterOneRowVerticalStretchValue"],
    ["lyricPosterOneRowTightness", "lyricPosterOneRowTightnessValue"],
    ["lyricPosterOneRowPerspective", "lyricPosterOneRowPerspectiveValue"],
    ["lyricPosterOneRowTilt", "lyricPosterOneRowTiltValue"],
    ["lyricPosterOneRowTextTopLeftX", "lyricPosterOneRowTextTopLeftXValue"],
    ["lyricPosterOneRowTextTopLeftY", "lyricPosterOneRowTextTopLeftYValue"],
    ["lyricPosterOneRowTextTopRightX", "lyricPosterOneRowTextTopRightXValue"],
    ["lyricPosterOneRowTextTopRightY", "lyricPosterOneRowTextTopRightYValue"],
    ["lyricPosterOneRowTextBottomLeftX", "lyricPosterOneRowTextBottomLeftXValue"],
    ["lyricPosterOneRowTextBottomLeftY", "lyricPosterOneRowTextBottomLeftYValue"],
    ["lyricPosterOneRowTextBottomRightX", "lyricPosterOneRowTextBottomRightXValue"],
    ["lyricPosterOneRowTextBottomRightY", "lyricPosterOneRowTextBottomRightYValue"],
    ["lyricPosterTwoRowVerticalStretch", "lyricPosterTwoRowVerticalStretchValue"],
    ["lyricPosterTwoRowTopBandTopY", "lyricPosterTwoRowTopBandTopYValue"],
    ["lyricPosterTwoRowTopBandBottomY", "lyricPosterTwoRowTopBandBottomYValue"],
    ["lyricPosterTwoRowBottomBandTopY", "lyricPosterTwoRowBottomBandTopYValue"],
    ["lyricPosterTwoRowBottomBandBottomY", "lyricPosterTwoRowBottomBandBottomYValue"],
    ["lyricPosterTwoRowTopY", "lyricPosterTwoRowTopYValue"],
    ["lyricPosterTwoRowBottomY", "lyricPosterTwoRowBottomYValue"],
    ["lyricPosterTwoRowTightness", "lyricPosterTwoRowTightnessValue"],
    ["lyricPosterTwoRowPerspective", "lyricPosterTwoRowPerspectiveValue"],
    ["lyricPosterTwoRowTilt", "lyricPosterTwoRowTiltValue"],
    ["lyricPosterThreeRowVerticalStretch", "lyricPosterThreeRowVerticalStretchValue"],
    ["lyricPosterThreeRowTopBandTopY", "lyricPosterThreeRowTopBandTopYValue"],
    ["lyricPosterThreeRowTopBandBottomY", "lyricPosterThreeRowTopBandBottomYValue"],
    ["lyricPosterThreeRowMiddleBandTopY", "lyricPosterThreeRowMiddleBandTopYValue"],
    ["lyricPosterThreeRowMiddleBandBottomY", "lyricPosterThreeRowMiddleBandBottomYValue"],
    ["lyricPosterThreeRowBottomBandTopY", "lyricPosterThreeRowBottomBandTopYValue"],
    ["lyricPosterThreeRowBottomBandBottomY", "lyricPosterThreeRowBottomBandBottomYValue"],
    ["lyricPosterThreeRowTopY", "lyricPosterThreeRowTopYValue"],
    ["lyricPosterThreeRowMiddleY", "lyricPosterThreeRowMiddleYValue"],
    ["lyricPosterThreeRowBottomY", "lyricPosterThreeRowBottomYValue"],
    ["lyricPosterThreeRowTightness", "lyricPosterThreeRowTightnessValue"],
    ["lyricPosterThreeRowPerspective", "lyricPosterThreeRowPerspectiveValue"],
    ["lyricPosterThreeRowTilt", "lyricPosterThreeRowTiltValue"],
    ["lyricPosterTwoRowTopTextTopLeftX", "lyricPosterTwoRowTopTextTopLeftXValue"],
    ["lyricPosterTwoRowTopTextTopLeftY", "lyricPosterTwoRowTopTextTopLeftYValue"],
    ["lyricPosterTwoRowTopTextTopRightX", "lyricPosterTwoRowTopTextTopRightXValue"],
    ["lyricPosterTwoRowTopTextTopRightY", "lyricPosterTwoRowTopTextTopRightYValue"],
    ["lyricPosterTwoRowTopTextBottomLeftX", "lyricPosterTwoRowTopTextBottomLeftXValue"],
    ["lyricPosterTwoRowTopTextBottomLeftY", "lyricPosterTwoRowTopTextBottomLeftYValue"],
    ["lyricPosterTwoRowTopTextBottomRightX", "lyricPosterTwoRowTopTextBottomRightXValue"],
    ["lyricPosterTwoRowTopTextBottomRightY", "lyricPosterTwoRowTopTextBottomRightYValue"],
    ["lyricPosterTwoRowBottomTextTopLeftX", "lyricPosterTwoRowBottomTextTopLeftXValue"],
    ["lyricPosterTwoRowBottomTextTopLeftY", "lyricPosterTwoRowBottomTextTopLeftYValue"],
    ["lyricPosterTwoRowBottomTextTopRightX", "lyricPosterTwoRowBottomTextTopRightXValue"],
    ["lyricPosterTwoRowBottomTextTopRightY", "lyricPosterTwoRowBottomTextTopRightYValue"],
    ["lyricPosterTwoRowBottomTextBottomLeftX", "lyricPosterTwoRowBottomTextBottomLeftXValue"],
    ["lyricPosterTwoRowBottomTextBottomLeftY", "lyricPosterTwoRowBottomTextBottomLeftYValue"],
    ["lyricPosterTwoRowBottomTextBottomRightX", "lyricPosterTwoRowBottomTextBottomRightXValue"],
    ["lyricPosterTwoRowBottomTextBottomRightY", "lyricPosterTwoRowBottomTextBottomRightYValue"],
    ["lyricPosterThreeRowTopTextTopLeftX", "lyricPosterThreeRowTopTextTopLeftXValue"],
    ["lyricPosterThreeRowTopTextTopLeftY", "lyricPosterThreeRowTopTextTopLeftYValue"],
    ["lyricPosterThreeRowTopTextTopRightX", "lyricPosterThreeRowTopTextTopRightXValue"],
    ["lyricPosterThreeRowTopTextTopRightY", "lyricPosterThreeRowTopTextTopRightYValue"],
    ["lyricPosterThreeRowTopTextBottomLeftX", "lyricPosterThreeRowTopTextBottomLeftXValue"],
    ["lyricPosterThreeRowTopTextBottomLeftY", "lyricPosterThreeRowTopTextBottomLeftYValue"],
    ["lyricPosterThreeRowTopTextBottomRightX", "lyricPosterThreeRowTopTextBottomRightXValue"],
    ["lyricPosterThreeRowTopTextBottomRightY", "lyricPosterThreeRowTopTextBottomRightYValue"],
    ["lyricPosterThreeRowMiddleTextTopLeftX", "lyricPosterThreeRowMiddleTextTopLeftXValue"],
    ["lyricPosterThreeRowMiddleTextTopLeftY", "lyricPosterThreeRowMiddleTextTopLeftYValue"],
    ["lyricPosterThreeRowMiddleTextTopRightX", "lyricPosterThreeRowMiddleTextTopRightXValue"],
    ["lyricPosterThreeRowMiddleTextTopRightY", "lyricPosterThreeRowMiddleTextTopRightYValue"],
    ["lyricPosterThreeRowMiddleTextBottomLeftX", "lyricPosterThreeRowMiddleTextBottomLeftXValue"],
    ["lyricPosterThreeRowMiddleTextBottomLeftY", "lyricPosterThreeRowMiddleTextBottomLeftYValue"],
    ["lyricPosterThreeRowMiddleTextBottomRightX", "lyricPosterThreeRowMiddleTextBottomRightXValue"],
    ["lyricPosterThreeRowMiddleTextBottomRightY", "lyricPosterThreeRowMiddleTextBottomRightYValue"],
    ["lyricPosterThreeRowBottomTextTopLeftX", "lyricPosterThreeRowBottomTextTopLeftXValue"],
    ["lyricPosterThreeRowBottomTextTopLeftY", "lyricPosterThreeRowBottomTextTopLeftYValue"],
    ["lyricPosterThreeRowBottomTextTopRightX", "lyricPosterThreeRowBottomTextTopRightXValue"],
    ["lyricPosterThreeRowBottomTextTopRightY", "lyricPosterThreeRowBottomTextTopRightYValue"],
    ["lyricPosterThreeRowBottomTextBottomLeftX", "lyricPosterThreeRowBottomTextBottomLeftXValue"],
    ["lyricPosterThreeRowBottomTextBottomLeftY", "lyricPosterThreeRowBottomTextBottomLeftYValue"],
    ["lyricPosterThreeRowBottomTextBottomRightX", "lyricPosterThreeRowBottomTextBottomRightXValue"],
    ["lyricPosterThreeRowBottomTextBottomRightY", "lyricPosterThreeRowBottomTextBottomRightYValue"],
    ["lyricPosterTallTopLeftX", "lyricPosterTallTopLeftXValue"],
    ["lyricPosterTallTopLeftY", "lyricPosterTallTopLeftYValue"],
    ["lyricPosterTallTopRightX", "lyricPosterTallTopRightXValue"],
    ["lyricPosterTallTopRightY", "lyricPosterTallTopRightYValue"],
    ["lyricPosterTallBottomLeftX", "lyricPosterTallBottomLeftXValue"],
    ["lyricPosterTallBottomLeftY", "lyricPosterTallBottomLeftYValue"],
    ["lyricPosterTallBottomRightX", "lyricPosterTallBottomRightXValue"],
    ["lyricPosterTallBottomRightY", "lyricPosterTallBottomRightYValue"],
    ["lyricPosterTallShortTopLeftX", "lyricPosterTallShortTopLeftXValue"],
    ["lyricPosterTallShortTopLeftY", "lyricPosterTallShortTopLeftYValue"],
    ["lyricPosterTallShortTopRightX", "lyricPosterTallShortTopRightXValue"],
    ["lyricPosterTallShortTopRightY", "lyricPosterTallShortTopRightYValue"],
    ["lyricPosterTallShortBottomLeftX", "lyricPosterTallShortBottomLeftXValue"],
    ["lyricPosterTallShortBottomLeftY", "lyricPosterTallShortBottomLeftYValue"],
    ["lyricPosterTallShortBottomRightX", "lyricPosterTallShortBottomRightXValue"],
    ["lyricPosterTallShortBottomRightY", "lyricPosterTallShortBottomRightYValue"],
    ["lyricPosterTallOneRowTextTopLeftX", "lyricPosterTallOneRowTextTopLeftXValue"],
    ["lyricPosterTallOneRowTextTopLeftY", "lyricPosterTallOneRowTextTopLeftYValue"],
    ["lyricPosterTallOneRowTextTopRightX", "lyricPosterTallOneRowTextTopRightXValue"],
    ["lyricPosterTallOneRowTextTopRightY", "lyricPosterTallOneRowTextTopRightYValue"],
    ["lyricPosterTallOneRowTextBottomLeftX", "lyricPosterTallOneRowTextBottomLeftXValue"],
    ["lyricPosterTallOneRowTextBottomLeftY", "lyricPosterTallOneRowTextBottomLeftYValue"],
    ["lyricPosterTallOneRowTextBottomRightX", "lyricPosterTallOneRowTextBottomRightXValue"],
    ["lyricPosterTallOneRowTextBottomRightY", "lyricPosterTallOneRowTextBottomRightYValue"],
    ["lyricPosterTallTwoRowTopBandTopY", "lyricPosterTallTwoRowTopBandTopYValue"],
    ["lyricPosterTallTwoRowTopBandBottomY", "lyricPosterTallTwoRowTopBandBottomYValue"],
    ["lyricPosterTallTwoRowBottomBandTopY", "lyricPosterTallTwoRowBottomBandTopYValue"],
    ["lyricPosterTallTwoRowBottomBandBottomY", "lyricPosterTallTwoRowBottomBandBottomYValue"],
    ["lyricPosterTallTwoRowTopTextTopLeftX", "lyricPosterTallTwoRowTopTextTopLeftXValue"],
    ["lyricPosterTallTwoRowTopTextTopLeftY", "lyricPosterTallTwoRowTopTextTopLeftYValue"],
    ["lyricPosterTallTwoRowTopTextTopRightX", "lyricPosterTallTwoRowTopTextTopRightXValue"],
    ["lyricPosterTallTwoRowTopTextTopRightY", "lyricPosterTallTwoRowTopTextTopRightYValue"],
    ["lyricPosterTallTwoRowTopTextBottomLeftX", "lyricPosterTallTwoRowTopTextBottomLeftXValue"],
    ["lyricPosterTallTwoRowTopTextBottomLeftY", "lyricPosterTallTwoRowTopTextBottomLeftYValue"],
    ["lyricPosterTallTwoRowTopTextBottomRightX", "lyricPosterTallTwoRowTopTextBottomRightXValue"],
    ["lyricPosterTallTwoRowTopTextBottomRightY", "lyricPosterTallTwoRowTopTextBottomRightYValue"],
    ["lyricPosterTallTwoRowBottomTextTopLeftX", "lyricPosterTallTwoRowBottomTextTopLeftXValue"],
    ["lyricPosterTallTwoRowBottomTextTopLeftY", "lyricPosterTallTwoRowBottomTextTopLeftYValue"],
    ["lyricPosterTallTwoRowBottomTextTopRightX", "lyricPosterTallTwoRowBottomTextTopRightXValue"],
    ["lyricPosterTallTwoRowBottomTextTopRightY", "lyricPosterTallTwoRowBottomTextTopRightYValue"],
    ["lyricPosterTallTwoRowBottomTextBottomLeftX", "lyricPosterTallTwoRowBottomTextBottomLeftXValue"],
    ["lyricPosterTallTwoRowBottomTextBottomLeftY", "lyricPosterTallTwoRowBottomTextBottomLeftYValue"],
    ["lyricPosterTallTwoRowBottomTextBottomRightX", "lyricPosterTallTwoRowBottomTextBottomRightXValue"],
    ["lyricPosterTallTwoRowBottomTextBottomRightY", "lyricPosterTallTwoRowBottomTextBottomRightYValue"],
    ["lyricPosterTallDirectOneRowTLX", "lyricPosterTallDirectOneRowTLXValue"],
    ["lyricPosterTallDirectOneRowTLY", "lyricPosterTallDirectOneRowTLYValue"],
    ["lyricPosterTallDirectOneRowTRX", "lyricPosterTallDirectOneRowTRXValue"],
    ["lyricPosterTallDirectOneRowTRY", "lyricPosterTallDirectOneRowTRYValue"],
    ["lyricPosterTallDirectOneRowBRX", "lyricPosterTallDirectOneRowBRXValue"],
    ["lyricPosterTallDirectOneRowBRY", "lyricPosterTallDirectOneRowBRYValue"],
    ["lyricPosterTallDirectOneRowBLX", "lyricPosterTallDirectOneRowBLXValue"],
    ["lyricPosterTallDirectOneRowBLY", "lyricPosterTallDirectOneRowBLYValue"],
    ["lyricPosterTallDirectTwoTopTLX", "lyricPosterTallDirectTwoTopTLXValue"],
    ["lyricPosterTallDirectTwoTopTLY", "lyricPosterTallDirectTwoTopTLYValue"],
    ["lyricPosterTallDirectTwoTopTRX", "lyricPosterTallDirectTwoTopTRXValue"],
    ["lyricPosterTallDirectTwoTopTRY", "lyricPosterTallDirectTwoTopTRYValue"],
    ["lyricPosterTallDirectTwoTopBRX", "lyricPosterTallDirectTwoTopBRXValue"],
    ["lyricPosterTallDirectTwoTopBRY", "lyricPosterTallDirectTwoTopBRYValue"],
    ["lyricPosterTallDirectTwoTopBLX", "lyricPosterTallDirectTwoTopBLXValue"],
    ["lyricPosterTallDirectTwoTopBLY", "lyricPosterTallDirectTwoTopBLYValue"],
    ["lyricPosterTallDirectTwoBottomTLX", "lyricPosterTallDirectTwoBottomTLXValue"],
    ["lyricPosterTallDirectTwoBottomTLY", "lyricPosterTallDirectTwoBottomTLYValue"],
    ["lyricPosterTallDirectTwoBottomTRX", "lyricPosterTallDirectTwoBottomTRXValue"],
    ["lyricPosterTallDirectTwoBottomTRY", "lyricPosterTallDirectTwoBottomTRYValue"],
    ["lyricPosterTallDirectTwoBottomBRX", "lyricPosterTallDirectTwoBottomBRXValue"],
    ["lyricPosterTallDirectTwoBottomBRY", "lyricPosterTallDirectTwoBottomBRYValue"],
    ["lyricPosterTallDirectTwoBottomBLX", "lyricPosterTallDirectTwoBottomBLXValue"],
    ["lyricPosterTallDirectTwoBottomBLY", "lyricPosterTallDirectTwoBottomBLYValue"],
    ["lyricPosterTallBaseShortTLX", "lyricPosterTallBaseShortTLXValue"],
    ["lyricPosterTallBaseShortTLY", "lyricPosterTallBaseShortTLYValue"],
    ["lyricPosterTallBaseShortTRX", "lyricPosterTallBaseShortTRXValue"],
    ["lyricPosterTallBaseShortTRY", "lyricPosterTallBaseShortTRYValue"],
    ["lyricPosterTallBaseShortBRX", "lyricPosterTallBaseShortBRXValue"],
    ["lyricPosterTallBaseShortBRY", "lyricPosterTallBaseShortBRYValue"],
    ["lyricPosterTallBaseShortBLX", "lyricPosterTallBaseShortBLXValue"],
    ["lyricPosterTallBaseShortBLY", "lyricPosterTallBaseShortBLYValue"],
    ["lyricPosterTallBaseOneRowTLX", "lyricPosterTallBaseOneRowTLXValue"],
    ["lyricPosterTallBaseOneRowTLY", "lyricPosterTallBaseOneRowTLYValue"],
    ["lyricPosterTallBaseOneRowTRX", "lyricPosterTallBaseOneRowTRXValue"],
    ["lyricPosterTallBaseOneRowTRY", "lyricPosterTallBaseOneRowTRYValue"],
    ["lyricPosterTallBaseOneRowBRX", "lyricPosterTallBaseOneRowBRXValue"],
    ["lyricPosterTallBaseOneRowBRY", "lyricPosterTallBaseOneRowBRYValue"],
    ["lyricPosterTallBaseOneRowBLX", "lyricPosterTallBaseOneRowBLXValue"],
    ["lyricPosterTallBaseOneRowBLY", "lyricPosterTallBaseOneRowBLYValue"],
    ["lyricPosterTallBaseTwoTopTLX", "lyricPosterTallBaseTwoTopTLXValue"],
    ["lyricPosterTallBaseTwoTopTLY", "lyricPosterTallBaseTwoTopTLYValue"],
    ["lyricPosterTallBaseTwoTopTRX", "lyricPosterTallBaseTwoTopTRXValue"],
    ["lyricPosterTallBaseTwoTopTRY", "lyricPosterTallBaseTwoTopTRYValue"],
    ["lyricPosterTallBaseTwoTopBRX", "lyricPosterTallBaseTwoTopBRXValue"],
    ["lyricPosterTallBaseTwoTopBRY", "lyricPosterTallBaseTwoTopBRYValue"],
    ["lyricPosterTallBaseTwoTopBLX", "lyricPosterTallBaseTwoTopBLXValue"],
    ["lyricPosterTallBaseTwoTopBLY", "lyricPosterTallBaseTwoTopBLYValue"],
    ["lyricPosterTallBaseTwoBottomTLX", "lyricPosterTallBaseTwoBottomTLXValue"],
    ["lyricPosterTallBaseTwoBottomTLY", "lyricPosterTallBaseTwoBottomTLYValue"],
    ["lyricPosterTallBaseTwoBottomTRX", "lyricPosterTallBaseTwoBottomTRXValue"],
    ["lyricPosterTallBaseTwoBottomTRY", "lyricPosterTallBaseTwoBottomTRYValue"],
    ["lyricPosterTallBaseTwoBottomBRX", "lyricPosterTallBaseTwoBottomBRXValue"],
    ["lyricPosterTallBaseTwoBottomBRY", "lyricPosterTallBaseTwoBottomBRYValue"],
    ["lyricPosterTallBaseTwoBottomBLX", "lyricPosterTallBaseTwoBottomBLXValue"],
    ["lyricPosterTallBaseTwoBottomBLY", "lyricPosterTallBaseTwoBottomBLYValue"],
    ["lyricPosterTallMidShortTLX", "lyricPosterTallMidShortTLXValue"],
    ["lyricPosterTallMidShortTLY", "lyricPosterTallMidShortTLYValue"],
    ["lyricPosterTallMidShortTRX", "lyricPosterTallMidShortTRXValue"],
    ["lyricPosterTallMidShortTRY", "lyricPosterTallMidShortTRYValue"],
    ["lyricPosterTallMidShortBRX", "lyricPosterTallMidShortBRXValue"],
    ["lyricPosterTallMidShortBRY", "lyricPosterTallMidShortBRYValue"],
    ["lyricPosterTallMidShortBLX", "lyricPosterTallMidShortBLXValue"],
    ["lyricPosterTallMidShortBLY", "lyricPosterTallMidShortBLYValue"],
    ["lyricPosterTallMidOneRowTLX", "lyricPosterTallMidOneRowTLXValue"],
    ["lyricPosterTallMidOneRowTLY", "lyricPosterTallMidOneRowTLYValue"],
    ["lyricPosterTallMidOneRowTRX", "lyricPosterTallMidOneRowTRXValue"],
    ["lyricPosterTallMidOneRowTRY", "lyricPosterTallMidOneRowTRYValue"],
    ["lyricPosterTallMidOneRowBRX", "lyricPosterTallMidOneRowBRXValue"],
    ["lyricPosterTallMidOneRowBRY", "lyricPosterTallMidOneRowBRYValue"],
    ["lyricPosterTallMidOneRowBLX", "lyricPosterTallMidOneRowBLXValue"],
    ["lyricPosterTallMidOneRowBLY", "lyricPosterTallMidOneRowBLYValue"],
    ["lyricPosterTallMidTwoTopTLX", "lyricPosterTallMidTwoTopTLXValue"],
    ["lyricPosterTallMidTwoTopTLY", "lyricPosterTallMidTwoTopTLYValue"],
    ["lyricPosterTallMidTwoTopTRX", "lyricPosterTallMidTwoTopTRXValue"],
    ["lyricPosterTallMidTwoTopTRY", "lyricPosterTallMidTwoTopTRYValue"],
    ["lyricPosterTallMidTwoTopBRX", "lyricPosterTallMidTwoTopBRXValue"],
    ["lyricPosterTallMidTwoTopBRY", "lyricPosterTallMidTwoTopBRYValue"],
    ["lyricPosterTallMidTwoTopBLX", "lyricPosterTallMidTwoTopBLXValue"],
    ["lyricPosterTallMidTwoTopBLY", "lyricPosterTallMidTwoTopBLYValue"],
    ["lyricPosterTallMidTwoBottomTLX", "lyricPosterTallMidTwoBottomTLXValue"],
    ["lyricPosterTallMidTwoBottomTLY", "lyricPosterTallMidTwoBottomTLYValue"],
    ["lyricPosterTallMidTwoBottomTRX", "lyricPosterTallMidTwoBottomTRXValue"],
    ["lyricPosterTallMidTwoBottomTRY", "lyricPosterTallMidTwoBottomTRYValue"],
    ["lyricPosterTallMidTwoBottomBRX", "lyricPosterTallMidTwoBottomBRXValue"],
    ["lyricPosterTallMidTwoBottomBRY", "lyricPosterTallMidTwoBottomBRYValue"],
    ["lyricPosterTallMidTwoBottomBLX", "lyricPosterTallMidTwoBottomBLXValue"],
    ["lyricPosterTallMidTwoBottomBLY", "lyricPosterTallMidTwoBottomBLYValue"],
    ["lyricPosterTallFinalShortTLX", "lyricPosterTallFinalShortTLXValue"],
    ["lyricPosterTallFinalShortTLY", "lyricPosterTallFinalShortTLYValue"],
    ["lyricPosterTallFinalShortTRX", "lyricPosterTallFinalShortTRXValue"],
    ["lyricPosterTallFinalShortTRY", "lyricPosterTallFinalShortTRYValue"],
    ["lyricPosterTallFinalShortBRX", "lyricPosterTallFinalShortBRXValue"],
    ["lyricPosterTallFinalShortBRY", "lyricPosterTallFinalShortBRYValue"],
    ["lyricPosterTallFinalShortBLX", "lyricPosterTallFinalShortBLXValue"],
    ["lyricPosterTallFinalShortBLY", "lyricPosterTallFinalShortBLYValue"],
    ["lyricPosterTallFinalOneRowTLX", "lyricPosterTallFinalOneRowTLXValue"],
    ["lyricPosterTallFinalOneRowTLY", "lyricPosterTallFinalOneRowTLYValue"],
    ["lyricPosterTallFinalOneRowTRX", "lyricPosterTallFinalOneRowTRXValue"],
    ["lyricPosterTallFinalOneRowTRY", "lyricPosterTallFinalOneRowTRYValue"],
    ["lyricPosterTallFinalOneRowBRX", "lyricPosterTallFinalOneRowBRXValue"],
    ["lyricPosterTallFinalOneRowBRY", "lyricPosterTallFinalOneRowBRYValue"],
    ["lyricPosterTallFinalOneRowBLX", "lyricPosterTallFinalOneRowBLXValue"],
    ["lyricPosterTallFinalOneRowBLY", "lyricPosterTallFinalOneRowBLYValue"],
    ["lyricPosterTallFinalTwoTopTLX", "lyricPosterTallFinalTwoTopTLXValue"],
    ["lyricPosterTallFinalTwoTopTLY", "lyricPosterTallFinalTwoTopTLYValue"],
    ["lyricPosterTallFinalTwoTopTRX", "lyricPosterTallFinalTwoTopTRXValue"],
    ["lyricPosterTallFinalTwoTopTRY", "lyricPosterTallFinalTwoTopTRYValue"],
    ["lyricPosterTallFinalTwoTopBRX", "lyricPosterTallFinalTwoTopBRXValue"],
    ["lyricPosterTallFinalTwoTopBRY", "lyricPosterTallFinalTwoTopBRYValue"],
    ["lyricPosterTallFinalTwoTopBLX", "lyricPosterTallFinalTwoTopBLXValue"],
    ["lyricPosterTallFinalTwoTopBLY", "lyricPosterTallFinalTwoTopBLYValue"],
    ["lyricPosterTallFinalTwoBottomTLX", "lyricPosterTallFinalTwoBottomTLXValue"],
    ["lyricPosterTallFinalTwoBottomTLY", "lyricPosterTallFinalTwoBottomTLYValue"],
    ["lyricPosterTallFinalTwoBottomTRX", "lyricPosterTallFinalTwoBottomTRXValue"],
    ["lyricPosterTallFinalTwoBottomTRY", "lyricPosterTallFinalTwoBottomTRYValue"],
    ["lyricPosterTallFinalTwoBottomBRX", "lyricPosterTallFinalTwoBottomBRXValue"],
    ["lyricPosterTallFinalTwoBottomBRY", "lyricPosterTallFinalTwoBottomBRYValue"],
    ["lyricPosterTallFinalTwoBottomBLX", "lyricPosterTallFinalTwoBottomBLXValue"],
    ["lyricPosterTallFinalTwoBottomBLY", "lyricPosterTallFinalTwoBottomBLYValue"],
  ] as const;

  controls.forEach(([inputId, labelId]) => {
    const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
    if (!input) return;
    const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter" | "lyricPosterMaxRows" | "lyricPosterTransition">;
    input.value = String(roomUtility[key]);
    setUtilityLabel(labelId, Number(input.value));

    input.addEventListener("input", () => {
      roomUtility = { ...roomUtility, [key]: Number(input.value) };
      setUtilityLabel(labelId, Number(input.value));
      if (String(key).startsWith("lyric")) lyricAnimationRevision += 1;
      applyRoomUtilitySettings();
    });
  });

  sceneFilter?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, sceneFilter: sceneFilter.value as SceneFilter };
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  lyricPosterMaxRows?.addEventListener("change", () => {
    lyricAnimationRevision += 1;
    roomUtility = { ...roomUtility, lyricPosterMaxRows: lyricPosterMaxRows.value as RoomUtilitySettings["lyricPosterMaxRows"] };
    applyRoomUtilitySettings();
  });

  lyricPosterTransition?.addEventListener("change", () => {
    lyricAnimationRevision += 1;
    roomUtility = { ...roomUtility, lyricPosterTransition: lyricPosterTransition.value as RoomUtilitySettings["lyricPosterTransition"] };
    applyRoomUtilitySettings();
  });

  lyricPosterStrokeColor?.addEventListener("input", () => {
    roomUtility = { ...roomUtility, lyricPosterStrokeColor: lyricPosterStrokeColor.value };
    applyRoomUtilitySettings();
  });

  lyricPosterFillColor?.addEventListener("input", () => {
    roomUtility = { ...roomUtility, lyricPosterFillColor: lyricPosterFillColor.value };
    applyRoomUtilitySettings();
  });

  [
    [lyricPosterEffectDropShadow, "lyricPosterEffectDropShadow"],
    [lyricPosterEffectEmboss, "lyricPosterEffectEmboss"],
    [lyricPosterEffectInsetEmboss, "lyricPosterEffectInsetEmboss"],
    [lyricPosterEffectBevel, "lyricPosterEffectBevel"],
    [lyricPosterEffectSoftBlur, "lyricPosterEffectSoftBlur"],
  ].forEach(([checkbox, key]) => {
    if (!checkbox) return;
    (checkbox as HTMLInputElement).addEventListener("change", () => {
      roomUtility = { ...roomUtility, [key as keyof RoomUtilitySettings]: (checkbox as HTMLInputElement).checked };
      applyRoomUtilitySettings();
    });
  });

  lyricPosterTallGuideEnabled?.addEventListener("change", () => {
    roomUtility = { ...roomUtility, lyricPosterTallGuideEnabled: lyricPosterTallGuideEnabled.checked };
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#saveRoomUtility").addEventListener("click", () => {
    saveRoomUtilitySettings();
    applyRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#resetRoomUtility").addEventListener("click", () => {
    roomUtility = { ...DEFAULT_ROOM_UTILITY };
    if (sceneFilter) sceneFilter.value = roomUtility.sceneFilter;
    if (lyricPosterMaxRows) lyricPosterMaxRows.value = roomUtility.lyricPosterMaxRows;
    if (lyricPosterTransition) lyricPosterTransition.value = roomUtility.lyricPosterTransition;
    if (lyricPosterStrokeColor) lyricPosterStrokeColor.value = roomUtility.lyricPosterStrokeColor;
    if (lyricPosterFillColor) lyricPosterFillColor.value = roomUtility.lyricPosterFillColor;
    if (lyricPosterEffectDropShadow) lyricPosterEffectDropShadow.checked = roomUtility.lyricPosterEffectDropShadow;
    if (lyricPosterEffectEmboss) lyricPosterEffectEmboss.checked = roomUtility.lyricPosterEffectEmboss;
    if (lyricPosterEffectInsetEmboss) lyricPosterEffectInsetEmboss.checked = roomUtility.lyricPosterEffectInsetEmboss;
    if (lyricPosterEffectBevel) lyricPosterEffectBevel.checked = roomUtility.lyricPosterEffectBevel;
    if (lyricPosterEffectSoftBlur) lyricPosterEffectSoftBlur.checked = roomUtility.lyricPosterEffectSoftBlur;
    if (lyricPosterTallGuideEnabled) lyricPosterTallGuideEnabled.checked = roomUtility.lyricPosterTallGuideEnabled;
    if (panelHeightAdjustEnabled) panelHeightAdjustEnabled.checked = roomUtility.panelHeightAdjustEnabled;
    if (roomFillStretchMode) roomFillStretchMode.checked = roomUtility.roomFillStretchMode;
    if (utilityPanelLeftSide) utilityPanelLeftSide.checked = roomUtility.utilityPanelLeftSide;
    if (songChangeMode) songChangeMode.checked = roomUtility.songChangeMode;
  if (placedAlbumEnabled) placedAlbumEnabled.checked = roomUtility.placedAlbumEnabled;
    if (vinylClockEnabled) vinylClockEnabled.checked = roomUtility.vinylClockEnabled;
    if (speakerPulseUseTempo) speakerPulseUseTempo.checked = roomUtility.speakerPulseUseTempo;
  if (speakerPulseUseExternalTempo) speakerPulseUseExternalTempo.checked = roomUtility.speakerPulseUseExternalTempo;

    controls.forEach(([inputId, labelId]) => {
      const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
      if (!input) return;
      const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter" | "lyricPosterMaxRows" | "lyricPosterTransition">;
      input.value = String(roomUtility[key]);
      setUtilityLabel(labelId, Number(input.value));
    });

    lyricAnimationRevision += 1;
    saveRoomUtilitySettings();
    applyRoomUtilitySettings();
  });
}

function hexToRgbParts(hex: string): string {
  const normalized = hex.replace("#", "").trim();

  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    return normalized
      .split("")
      .map((char) => parseInt(`${char}${char}`, 16))
      .join(", ");
  }

  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }

  return "0, 0, 0";
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function applyRoomUtilitySettings(): void {
  const root = document.documentElement;

  root.style.setProperty("--speaker-left-x", `${roomUtility.speakerLeftX}%`);
  root.style.setProperty("--speaker-right-x", `${roomUtility.speakerRightX}%`);
  root.style.setProperty("--speaker-y", `${roomUtility.speakerY}%`);
  root.style.setProperty("--speaker-scale", String(roomUtility.speakerScale));
  root.style.setProperty("--speaker-opacity", String(roomUtility.speakerOpacity));
  root.style.setProperty("--speaker-pulse", String(roomUtility.speakerPulse));
  root.style.setProperty("--speaker-pulse-x", `${roomUtility.speakerPulseX}%`);
  root.style.setProperty("--speaker-pulse-y", `${roomUtility.speakerPulseY}%`);
  root.style.setProperty("--speaker-pulse-size", `${roomUtility.speakerPulseSize}%`);
  root.style.setProperty("--speaker-warp-opacity", String(roomUtility.speakerWarpOpacity));
  root.style.setProperty("--mixer-tempo-led-x", `${roomUtility.mixerTempoLedX}%`);
  root.style.setProperty("--mixer-tempo-led-y", `${roomUtility.mixerTempoLedY}%`);
  root.style.setProperty("--mixer-tempo-led-size", `${roomUtility.mixerTempoLedSize}%`);
  root.style.setProperty("--mixer-lyrics-led-x", `${roomUtility.mixerLyricsLedX}%`);
  root.style.setProperty("--mixer-lyrics-led-y", `${roomUtility.mixerLyricsLedY}%`);
  root.style.setProperty("--mixer-lyrics-led-size", `${roomUtility.mixerLyricsLedSize}%`);
  root.style.setProperty("--speaker-pulse-duration", `${speakerPulseDurationMs()}ms`);
  root.classList.toggle("speaker-pulse-tempo-enabled", roomUtility.speakerPulseUseTempo);
  root.style.setProperty("--scene-filter-strength", String(roomUtility.filterStrength));
  root.style.setProperty("--scene-vignette-strength", String(roomUtility.vignetteStrength));
  root.style.setProperty("--shadow-opacity", String(roomUtility.shadowOpacity));
  root.style.setProperty("--table-shadow-scale", String(roomUtility.tableShadowScale));
  root.style.setProperty("--floor-controls-idle-opacity", String(roomUtility.floorControlsIdleOpacity));
  root.style.setProperty("--song-change-album-x", `${roomUtility.songChangeAlbumX}%`);
  root.style.setProperty("--song-change-album-y", `${roomUtility.songChangeAlbumY}%`);
  root.style.setProperty("--song-change-album-size", `${roomUtility.songChangeAlbumSize}%`);
  root.style.setProperty("--placed-album-x", `${roomUtility.placedAlbumX}%`);
  root.style.setProperty("--placed-album-y", `${roomUtility.placedAlbumY}%`);
  root.style.setProperty("--placed-album-size", `${roomUtility.placedAlbumSize}%`);
  root.style.setProperty("--placed-album-rotate-x", `${roomUtility.placedAlbumRotateX}deg`);
  root.style.setProperty("--placed-album-rotate-y", `${roomUtility.placedAlbumRotateY}deg`);
  root.style.setProperty("--placed-album-rotate-z", `${roomUtility.placedAlbumRotateZ}deg`);
  root.style.setProperty("--placed-album-depth", String(roomUtility.placedAlbumDepth));
  root.style.setProperty("--placed-album-shadow", String(roomUtility.placedAlbumShadow));
  root.style.setProperty("--placed-album-opacity", String(roomUtility.placedAlbumOpacity));
  root.classList.toggle("placed-active-album-disabled", !roomUtility.placedAlbumEnabled);
  root.classList.toggle("song-change-preview", roomUtility.songChangeMode);
  root.style.setProperty("--panel-start-y", `${roomUtility.panelStartY}%`);
  root.style.setProperty("--panel-start-y-ratio", String(roomUtility.panelStartY / 100));
  root.classList.toggle("panel-height-adjust-enabled", roomUtility.panelHeightAdjustEnabled);
  root.classList.toggle("room-fill-stretch", roomUtility.roomFillStretchMode);
  root.classList.toggle("utility-panel-left-side", roomUtility.utilityPanelLeftSide);
  root.classList.toggle("vinyl-clock-hidden", !roomUtility.vinylClockEnabled);
  const vinylClockVars: Array<[string, string]> = [
    ["--vinyl-clock-x", `${roomUtility.vinylClockX}px`],
    ["--vinyl-clock-y", `${roomUtility.vinylClockY}px`],
    ["--vinyl-clock-size", `${roomUtility.vinylClockSize}px`],
    ["--vinyl-clock-scale", String(roomUtility.vinylClockScale)],
    ["--vinyl-clock-tilt", `${roomUtility.vinylClockTilt}deg`],
    ["--vinyl-clock-opacity", String(roomUtility.vinylClockOpacity)],
    ["--vinyl-clock-glow", String(roomUtility.vinylClockGlow)],
    ["--vinyl-clock-shadow-x", `${roomUtility.vinylClockShadowX}px`],
    ["--vinyl-clock-shadow-y", `${roomUtility.vinylClockShadowY}px`],
    ["--vinyl-clock-shadow-blur", `${roomUtility.vinylClockShadowBlur}px`],
    ["--vinyl-clock-shadow-opacity", String(roomUtility.vinylClockShadowOpacity)],
    ["--vinyl-clock-room-blend", String(roomUtility.vinylClockRoomBlend)],
    ["--vinyl-clock-wall-fade", String(roomUtility.vinylClockWallFade)],
    ["--vinyl-clock-blend-brightness", String(1 - roomUtility.vinylClockRoomBlend * 0.20)],
    ["--vinyl-clock-blend-saturation", String(1 - roomUtility.vinylClockRoomBlend * 0.28)],
    ["--vinyl-clock-blend-contrast", String(1 - roomUtility.vinylClockRoomBlend * 0.10)],
    ["--vinyl-clock-blend-sepia", String(roomUtility.vinylClockRoomBlend * 0.18)],
    ["--vinyl-clock-warm-wash-opacity", String(roomUtility.vinylClockRoomBlend * 0.22)],
  ];
  const roomElement = document.querySelector<HTMLElement>(".room");
  vinylClockVars.forEach(([name, value]) => {
    root.style.setProperty(name, value);
    // The room element has local fallback variables for the scene. Mirror the utility
    // values there so the sliders win over those local defaults immediately.
    roomElement?.style.setProperty(name, value);
  });
  syncAspectModeControls();

  const filterOverlay = document.querySelector<HTMLElement>("#roomFilterOverlay");
  if (filterOverlay) {
    filterOverlay.className = `room-filter-overlay ${roomUtility.sceneFilter}`;
  }

  root.style.setProperty("--lyric-poster-guide-opacity", String(roomUtility.lyricPosterGuideOpacity));
  root.style.setProperty("--lyric-poster-center-guide-opacity", String(roomUtility.lyricPosterCenterGuideOpacity));
  root.style.setProperty("--lyric-poster-short-guide-opacity", String(roomUtility.lyricPosterShortGuideOpacity));
  root.style.setProperty("--lyric-poster-tall-guide-opacity", String(roomUtility.lyricPosterTallGuideOpacity));
  root.classList.toggle("tall-lyric-guides-enabled", roomUtility.lyricPosterTallGuideEnabled && roomUtility.lyricPosterTallGuideOpacity > 0);
  root.style.setProperty("--lyric-poster-tall-clamp-top-left-x", `${roomUtility.lyricPosterTallClampTopLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-clamp-top-left-y", `${roomUtility.lyricPosterTallClampTopLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-clamp-top-right-x", `${roomUtility.lyricPosterTallClampTopRightX}px`);
  root.style.setProperty("--lyric-poster-tall-clamp-top-right-y", `${roomUtility.lyricPosterTallClampTopRightY}px`);
  root.style.setProperty("--lyric-poster-short-tl-x", `${roomUtility.lyricPosterShortTopLeftX}px`);
  root.style.setProperty("--lyric-poster-short-tl-y", `${roomUtility.lyricPosterShortTopLeftY}px`);
  root.style.setProperty("--lyric-poster-short-tr-x", `${roomUtility.lyricPosterShortTopRightX}px`);
  root.style.setProperty("--lyric-poster-short-tr-y", `${roomUtility.lyricPosterShortTopRightY}px`);
  root.style.setProperty("--lyric-poster-short-bl-x", `${roomUtility.lyricPosterShortBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-short-bl-y", `${roomUtility.lyricPosterShortBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-short-br-x", `${roomUtility.lyricPosterShortBottomRightX}px`);
  root.style.setProperty("--lyric-poster-short-br-y", `${roomUtility.lyricPosterShortBottomRightY}px`);
  root.style.setProperty("--lyric-poster-short-vertical-stretch", String(roomUtility.lyricPosterShortVerticalStretch));
  root.style.setProperty("--lyric-poster-short-perspective", String(roomUtility.lyricPosterShortPerspective));
  root.style.setProperty("--lyric-poster-short-tilt", `${roomUtility.lyricPosterShortTilt}deg`);
  root.style.setProperty("--lyric-poster-short-text-tl-x", `${roomUtility.lyricPosterShortTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-short-text-tl-y", `${roomUtility.lyricPosterShortTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-short-text-tr-x", `${roomUtility.lyricPosterShortTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-short-text-tr-y", `${roomUtility.lyricPosterShortTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-short-text-bl-x", `${roomUtility.lyricPosterShortTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-short-text-bl-y", `${roomUtility.lyricPosterShortTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-short-text-br-x", `${roomUtility.lyricPosterShortTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-short-text-br-y", `${roomUtility.lyricPosterShortTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-band-guide-opacity", String(roomUtility.lyricPosterTwoRowBandGuideOpacity));
  root.style.setProperty("--lyric-poster-three-row-band-guide-opacity", String(roomUtility.lyricPosterThreeRowBandGuideOpacity));
  root.style.setProperty("--lyric-poster-top-left-x", `${roomUtility.lyricPosterTopLeftX}px`);
  root.style.setProperty("--lyric-poster-top-left-y", `${roomUtility.lyricPosterTopLeftY}px`);
  root.style.setProperty("--lyric-poster-top-right-x", `${roomUtility.lyricPosterTopRightX}px`);
  root.style.setProperty("--lyric-poster-top-right-y", `${roomUtility.lyricPosterTopRightY}px`);
  root.style.setProperty("--lyric-poster-bottom-left-x", `${roomUtility.lyricPosterBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-bottom-left-y", `${roomUtility.lyricPosterBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-bottom-right-x", `${roomUtility.lyricPosterBottomRightX}px`);
  root.style.setProperty("--lyric-poster-bottom-right-y", `${roomUtility.lyricPosterBottomRightY}px`);
  root.style.setProperty("--lyric-poster-tall-top-left-x", `${roomUtility.lyricPosterTallTopLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-top-left-y", `${roomUtility.lyricPosterTallTopLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-top-right-x", `${roomUtility.lyricPosterTallTopRightX}px`);
  root.style.setProperty("--lyric-poster-tall-top-right-y", `${roomUtility.lyricPosterTallTopRightY}px`);
  root.style.setProperty("--lyric-poster-tall-bottom-left-x", `${roomUtility.lyricPosterTallBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-bottom-left-y", `${roomUtility.lyricPosterTallBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-bottom-right-x", `${roomUtility.lyricPosterTallBottomRightX}px`);
  root.style.setProperty("--lyric-poster-tall-bottom-right-y", `${roomUtility.lyricPosterTallBottomRightY}px`);
  root.style.setProperty("--lyric-poster-tall-short-top-left-x", `${roomUtility.lyricPosterTallShortTopLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-short-top-left-y", `${roomUtility.lyricPosterTallShortTopLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-short-top-right-x", `${roomUtility.lyricPosterTallShortTopRightX}px`);
  root.style.setProperty("--lyric-poster-tall-short-top-right-y", `${roomUtility.lyricPosterTallShortTopRightY}px`);
  root.style.setProperty("--lyric-poster-tall-short-bottom-left-x", `${roomUtility.lyricPosterTallShortBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-short-bottom-left-y", `${roomUtility.lyricPosterTallShortBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-short-bottom-right-x", `${roomUtility.lyricPosterTallShortBottomRightX}px`);
  root.style.setProperty("--lyric-poster-tall-short-bottom-right-y", `${roomUtility.lyricPosterTallShortBottomRightY}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-top-left-x", `${roomUtility.lyricPosterTallOneRowTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-top-left-y", `${roomUtility.lyricPosterTallOneRowTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-top-right-x", `${roomUtility.lyricPosterTallOneRowTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-top-right-y", `${roomUtility.lyricPosterTallOneRowTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-bottom-left-x", `${roomUtility.lyricPosterTallOneRowTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-bottom-left-y", `${roomUtility.lyricPosterTallOneRowTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-bottom-right-x", `${roomUtility.lyricPosterTallOneRowTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-tall-one-row-text-bottom-right-y", `${roomUtility.lyricPosterTallOneRowTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-band-top-y", `${roomUtility.lyricPosterTallTwoRowTopBandTopY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-band-bottom-y", `${roomUtility.lyricPosterTallTwoRowTopBandBottomY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-band-top-y", `${roomUtility.lyricPosterTallTwoRowBottomBandTopY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-band-bottom-y", `${roomUtility.lyricPosterTallTwoRowBottomBandBottomY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-top-left-x", `${roomUtility.lyricPosterTallTwoRowTopTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-top-left-y", `${roomUtility.lyricPosterTallTwoRowTopTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-top-right-x", `${roomUtility.lyricPosterTallTwoRowTopTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-top-right-y", `${roomUtility.lyricPosterTallTwoRowTopTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-bottom-left-x", `${roomUtility.lyricPosterTallTwoRowTopTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-bottom-left-y", `${roomUtility.lyricPosterTallTwoRowTopTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-bottom-right-x", `${roomUtility.lyricPosterTallTwoRowTopTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-top-text-bottom-right-y", `${roomUtility.lyricPosterTallTwoRowTopTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-top-left-x", `${roomUtility.lyricPosterTallTwoRowBottomTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-top-left-y", `${roomUtility.lyricPosterTallTwoRowBottomTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-top-right-x", `${roomUtility.lyricPosterTallTwoRowBottomTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-top-right-y", `${roomUtility.lyricPosterTallTwoRowBottomTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-bottom-left-x", `${roomUtility.lyricPosterTallTwoRowBottomTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-bottom-left-y", `${roomUtility.lyricPosterTallTwoRowBottomTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-bottom-right-x", `${roomUtility.lyricPosterTallTwoRowBottomTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-tall-two-row-bottom-text-bottom-right-y", `${roomUtility.lyricPosterTallTwoRowBottomTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-tl-x", `${roomUtility.lyricPosterTallDirectOneRowTLX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-tl-y", `${roomUtility.lyricPosterTallDirectOneRowTLY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-tr-x", `${roomUtility.lyricPosterTallDirectOneRowTRX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-tr-y", `${roomUtility.lyricPosterTallDirectOneRowTRY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-br-x", `${roomUtility.lyricPosterTallDirectOneRowBRX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-br-y", `${roomUtility.lyricPosterTallDirectOneRowBRY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-bl-x", `${roomUtility.lyricPosterTallDirectOneRowBLX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-one-row-bl-y", `${roomUtility.lyricPosterTallDirectOneRowBLY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-tl-x", `${roomUtility.lyricPosterTallDirectTwoTopTLX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-tl-y", `${roomUtility.lyricPosterTallDirectTwoTopTLY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-tr-x", `${roomUtility.lyricPosterTallDirectTwoTopTRX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-tr-y", `${roomUtility.lyricPosterTallDirectTwoTopTRY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-br-x", `${roomUtility.lyricPosterTallDirectTwoTopBRX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-br-y", `${roomUtility.lyricPosterTallDirectTwoTopBRY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-bl-x", `${roomUtility.lyricPosterTallDirectTwoTopBLX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-top-bl-y", `${roomUtility.lyricPosterTallDirectTwoTopBLY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-tl-x", `${roomUtility.lyricPosterTallDirectTwoBottomTLX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-tl-y", `${roomUtility.lyricPosterTallDirectTwoBottomTLY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-tr-x", `${roomUtility.lyricPosterTallDirectTwoBottomTRX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-tr-y", `${roomUtility.lyricPosterTallDirectTwoBottomTRY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-br-x", `${roomUtility.lyricPosterTallDirectTwoBottomBRX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-br-y", `${roomUtility.lyricPosterTallDirectTwoBottomBRY}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-bl-x", `${roomUtility.lyricPosterTallDirectTwoBottomBLX}px`);
  root.style.setProperty("--lyric-poster-tall-direct-two-bottom-bl-y", `${roomUtility.lyricPosterTallDirectTwoBottomBLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-tl-x", `${roomUtility.lyricPosterTallBaseShortTLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-tl-y", `${roomUtility.lyricPosterTallBaseShortTLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-tr-x", `${roomUtility.lyricPosterTallBaseShortTRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-tr-y", `${roomUtility.lyricPosterTallBaseShortTRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-br-x", `${roomUtility.lyricPosterTallBaseShortBRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-br-y", `${roomUtility.lyricPosterTallBaseShortBRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-bl-x", `${roomUtility.lyricPosterTallBaseShortBLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-short-bl-y", `${roomUtility.lyricPosterTallBaseShortBLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-tl-x", `${roomUtility.lyricPosterTallBaseOneRowTLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-tl-y", `${roomUtility.lyricPosterTallBaseOneRowTLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-tr-x", `${roomUtility.lyricPosterTallBaseOneRowTRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-tr-y", `${roomUtility.lyricPosterTallBaseOneRowTRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-br-x", `${roomUtility.lyricPosterTallBaseOneRowBRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-br-y", `${roomUtility.lyricPosterTallBaseOneRowBRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-bl-x", `${roomUtility.lyricPosterTallBaseOneRowBLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-one-row-bl-y", `${roomUtility.lyricPosterTallBaseOneRowBLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-tl-x", `${roomUtility.lyricPosterTallBaseTwoTopTLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-tl-y", `${roomUtility.lyricPosterTallBaseTwoTopTLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-tr-x", `${roomUtility.lyricPosterTallBaseTwoTopTRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-tr-y", `${roomUtility.lyricPosterTallBaseTwoTopTRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-br-x", `${roomUtility.lyricPosterTallBaseTwoTopBRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-br-y", `${roomUtility.lyricPosterTallBaseTwoTopBRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-bl-x", `${roomUtility.lyricPosterTallBaseTwoTopBLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-top-bl-y", `${roomUtility.lyricPosterTallBaseTwoTopBLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-tl-x", `${roomUtility.lyricPosterTallBaseTwoBottomTLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-tl-y", `${roomUtility.lyricPosterTallBaseTwoBottomTLY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-tr-x", `${roomUtility.lyricPosterTallBaseTwoBottomTRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-tr-y", `${roomUtility.lyricPosterTallBaseTwoBottomTRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-br-x", `${roomUtility.lyricPosterTallBaseTwoBottomBRX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-br-y", `${roomUtility.lyricPosterTallBaseTwoBottomBRY}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-bl-x", `${roomUtility.lyricPosterTallBaseTwoBottomBLX}px`);
  root.style.setProperty("--lyric-poster-tall-base-two-bottom-bl-y", `${roomUtility.lyricPosterTallBaseTwoBottomBLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-tl-x", `${roomUtility.lyricPosterTallMidShortTLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-tl-y", `${roomUtility.lyricPosterTallMidShortTLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-tr-x", `${roomUtility.lyricPosterTallMidShortTRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-tr-y", `${roomUtility.lyricPosterTallMidShortTRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-br-x", `${roomUtility.lyricPosterTallMidShortBRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-br-y", `${roomUtility.lyricPosterTallMidShortBRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-bl-x", `${roomUtility.lyricPosterTallMidShortBLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-short-bl-y", `${roomUtility.lyricPosterTallMidShortBLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-tl-x", `${roomUtility.lyricPosterTallMidOneRowTLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-tl-y", `${roomUtility.lyricPosterTallMidOneRowTLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-tr-x", `${roomUtility.lyricPosterTallMidOneRowTRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-tr-y", `${roomUtility.lyricPosterTallMidOneRowTRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-br-x", `${roomUtility.lyricPosterTallMidOneRowBRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-br-y", `${roomUtility.lyricPosterTallMidOneRowBRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-bl-x", `${roomUtility.lyricPosterTallMidOneRowBLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-one-row-bl-y", `${roomUtility.lyricPosterTallMidOneRowBLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-tl-x", `${roomUtility.lyricPosterTallMidTwoTopTLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-tl-y", `${roomUtility.lyricPosterTallMidTwoTopTLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-tr-x", `${roomUtility.lyricPosterTallMidTwoTopTRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-tr-y", `${roomUtility.lyricPosterTallMidTwoTopTRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-br-x", `${roomUtility.lyricPosterTallMidTwoTopBRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-br-y", `${roomUtility.lyricPosterTallMidTwoTopBRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-bl-x", `${roomUtility.lyricPosterTallMidTwoTopBLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-top-bl-y", `${roomUtility.lyricPosterTallMidTwoTopBLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-tl-x", `${roomUtility.lyricPosterTallMidTwoBottomTLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-tl-y", `${roomUtility.lyricPosterTallMidTwoBottomTLY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-tr-x", `${roomUtility.lyricPosterTallMidTwoBottomTRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-tr-y", `${roomUtility.lyricPosterTallMidTwoBottomTRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-br-x", `${roomUtility.lyricPosterTallMidTwoBottomBRX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-br-y", `${roomUtility.lyricPosterTallMidTwoBottomBRY}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-bl-x", `${roomUtility.lyricPosterTallMidTwoBottomBLX}px`);
  root.style.setProperty("--lyric-poster-tall-mid-two-bottom-bl-y", `${roomUtility.lyricPosterTallMidTwoBottomBLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-tl-x", `${roomUtility.lyricPosterTallFinalShortTLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-tl-y", `${roomUtility.lyricPosterTallFinalShortTLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-tr-x", `${roomUtility.lyricPosterTallFinalShortTRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-tr-y", `${roomUtility.lyricPosterTallFinalShortTRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-br-x", `${roomUtility.lyricPosterTallFinalShortBRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-br-y", `${roomUtility.lyricPosterTallFinalShortBRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-bl-x", `${roomUtility.lyricPosterTallFinalShortBLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-short-bl-y", `${roomUtility.lyricPosterTallFinalShortBLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-tl-x", `${roomUtility.lyricPosterTallFinalOneRowTLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-tl-y", `${roomUtility.lyricPosterTallFinalOneRowTLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-tr-x", `${roomUtility.lyricPosterTallFinalOneRowTRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-tr-y", `${roomUtility.lyricPosterTallFinalOneRowTRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-br-x", `${roomUtility.lyricPosterTallFinalOneRowBRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-br-y", `${roomUtility.lyricPosterTallFinalOneRowBRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-bl-x", `${roomUtility.lyricPosterTallFinalOneRowBLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-one-row-bl-y", `${roomUtility.lyricPosterTallFinalOneRowBLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-tl-x", `${roomUtility.lyricPosterTallFinalTwoTopTLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-tl-y", `${roomUtility.lyricPosterTallFinalTwoTopTLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-tr-x", `${roomUtility.lyricPosterTallFinalTwoTopTRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-tr-y", `${roomUtility.lyricPosterTallFinalTwoTopTRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-br-x", `${roomUtility.lyricPosterTallFinalTwoTopBRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-br-y", `${roomUtility.lyricPosterTallFinalTwoTopBRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-bl-x", `${roomUtility.lyricPosterTallFinalTwoTopBLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-top-bl-y", `${roomUtility.lyricPosterTallFinalTwoTopBLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-tl-x", `${roomUtility.lyricPosterTallFinalTwoBottomTLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-tl-y", `${roomUtility.lyricPosterTallFinalTwoBottomTLY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-tr-x", `${roomUtility.lyricPosterTallFinalTwoBottomTRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-tr-y", `${roomUtility.lyricPosterTallFinalTwoBottomTRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-br-x", `${roomUtility.lyricPosterTallFinalTwoBottomBRX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-br-y", `${roomUtility.lyricPosterTallFinalTwoBottomBRY}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-bl-x", `${roomUtility.lyricPosterTallFinalTwoBottomBLX}px`);
  root.style.setProperty("--lyric-poster-tall-final-two-bottom-bl-y", `${roomUtility.lyricPosterTallFinalTwoBottomBLY}px`);
  root.style.setProperty("--lyric-poster-stroke", `${roomUtility.lyricPosterStroke}px`);
  root.style.setProperty("--lyric-poster-stroke-color", roomUtility.lyricPosterStrokeColor);
  root.style.setProperty("--lyric-poster-fill-color", roomUtility.lyricPosterFillColor);
  root.style.setProperty("--lyric-poster-stroke-opacity", String(roomUtility.lyricPosterStrokeOpacity));
  root.style.setProperty("--lyric-poster-fill-opacity", String(roomUtility.lyricPosterFillOpacity));
  root.style.setProperty("--lyric-poster-glow", String(roomUtility.lyricPosterGlow));
  root.style.setProperty("--lyric-poster-one-row-vertical-stretch", String(roomUtility.lyricPosterOneRowVerticalStretch));
  root.style.setProperty("--lyric-poster-one-row-tightness", String(roomUtility.lyricPosterOneRowTightness));
  root.style.setProperty("--lyric-poster-one-row-perspective", String(roomUtility.lyricPosterOneRowPerspective));
  root.style.setProperty("--lyric-poster-one-row-tilt", String(roomUtility.lyricPosterOneRowTilt));
  root.style.setProperty("--lyric-poster-one-row-text-top-left-x", `${roomUtility.lyricPosterOneRowTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-top-left-y", `${roomUtility.lyricPosterOneRowTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-one-row-text-top-right-x", `${roomUtility.lyricPosterOneRowTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-top-right-y", `${roomUtility.lyricPosterOneRowTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-left-x", `${roomUtility.lyricPosterOneRowTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-left-y", `${roomUtility.lyricPosterOneRowTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-right-x", `${roomUtility.lyricPosterOneRowTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-right-y", `${roomUtility.lyricPosterOneRowTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-vertical-stretch", String(roomUtility.lyricPosterTwoRowVerticalStretch));
  root.style.setProperty("--lyric-poster-two-row-top-band-top-y", `${roomUtility.lyricPosterTwoRowTopBandTopY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-band-bottom-y", `${roomUtility.lyricPosterTwoRowTopBandBottomY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-band-top-y", `${roomUtility.lyricPosterTwoRowBottomBandTopY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-band-bottom-y", `${roomUtility.lyricPosterTwoRowBottomBandBottomY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-y", `${roomUtility.lyricPosterTwoRowTopY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-y", `${roomUtility.lyricPosterTwoRowBottomY}px`);
  root.style.setProperty("--lyric-poster-two-row-tightness", String(roomUtility.lyricPosterTwoRowTightness));
  root.style.setProperty("--lyric-poster-two-row-perspective", String(roomUtility.lyricPosterTwoRowPerspective));
  root.style.setProperty("--lyric-poster-two-row-tilt", String(roomUtility.lyricPosterTwoRowTilt));
  root.style.setProperty("--lyric-poster-three-row-vertical-stretch", String(roomUtility.lyricPosterThreeRowVerticalStretch));
  root.style.setProperty("--lyric-poster-three-row-top-band-top-y", `${roomUtility.lyricPosterThreeRowTopBandTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-band-bottom-y", `${roomUtility.lyricPosterThreeRowTopBandBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-band-top-y", `${roomUtility.lyricPosterThreeRowMiddleBandTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-band-bottom-y", `${roomUtility.lyricPosterThreeRowMiddleBandBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-band-top-y", `${roomUtility.lyricPosterThreeRowBottomBandTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-band-bottom-y", `${roomUtility.lyricPosterThreeRowBottomBandBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-y", `${roomUtility.lyricPosterThreeRowTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-y", `${roomUtility.lyricPosterThreeRowMiddleY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-y", `${roomUtility.lyricPosterThreeRowBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-tightness", String(roomUtility.lyricPosterThreeRowTightness));
  root.style.setProperty("--lyric-poster-three-row-perspective", String(roomUtility.lyricPosterThreeRowPerspective));
  root.style.setProperty("--lyric-poster-three-row-tilt", String(roomUtility.lyricPosterThreeRowTilt));
  root.style.setProperty("--lyric-poster-two-row-top-text-top-left-x", `${roomUtility.lyricPosterTwoRowTopTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-top-left-y", `${roomUtility.lyricPosterTwoRowTopTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-top-right-x", `${roomUtility.lyricPosterTwoRowTopTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-top-right-y", `${roomUtility.lyricPosterTwoRowTopTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-left-x", `${roomUtility.lyricPosterTwoRowTopTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-left-y", `${roomUtility.lyricPosterTwoRowTopTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-right-x", `${roomUtility.lyricPosterTwoRowTopTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-right-y", `${roomUtility.lyricPosterTwoRowTopTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-left-x", `${roomUtility.lyricPosterTwoRowBottomTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-left-y", `${roomUtility.lyricPosterTwoRowBottomTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-right-x", `${roomUtility.lyricPosterTwoRowBottomTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-right-y", `${roomUtility.lyricPosterTwoRowBottomTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-left-x", `${roomUtility.lyricPosterTwoRowBottomTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-left-y", `${roomUtility.lyricPosterTwoRowBottomTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-right-x", `${roomUtility.lyricPosterTwoRowBottomTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-right-y", `${roomUtility.lyricPosterTwoRowBottomTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-left-x", `${roomUtility.lyricPosterThreeRowTopTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-left-y", `${roomUtility.lyricPosterThreeRowTopTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-right-x", `${roomUtility.lyricPosterThreeRowTopTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-right-y", `${roomUtility.lyricPosterThreeRowTopTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-left-x", `${roomUtility.lyricPosterThreeRowTopTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-left-y", `${roomUtility.lyricPosterThreeRowTopTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-right-x", `${roomUtility.lyricPosterThreeRowTopTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-right-y", `${roomUtility.lyricPosterThreeRowTopTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-left-x", `${roomUtility.lyricPosterThreeRowMiddleTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-left-y", `${roomUtility.lyricPosterThreeRowMiddleTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-right-x", `${roomUtility.lyricPosterThreeRowMiddleTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-right-y", `${roomUtility.lyricPosterThreeRowMiddleTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-left-x", `${roomUtility.lyricPosterThreeRowMiddleTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-left-y", `${roomUtility.lyricPosterThreeRowMiddleTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-right-x", `${roomUtility.lyricPosterThreeRowMiddleTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-right-y", `${roomUtility.lyricPosterThreeRowMiddleTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-left-x", `${roomUtility.lyricPosterThreeRowBottomTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-left-y", `${roomUtility.lyricPosterThreeRowBottomTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-right-x", `${roomUtility.lyricPosterThreeRowBottomTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-right-y", `${roomUtility.lyricPosterThreeRowBottomTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-left-x", `${roomUtility.lyricPosterThreeRowBottomTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-left-y", `${roomUtility.lyricPosterThreeRowBottomTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-right-x", `${roomUtility.lyricPosterThreeRowBottomTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-right-y", `${roomUtility.lyricPosterThreeRowBottomTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-max-rows", roomUtility.lyricPosterMaxRows);
  root.style.setProperty("--lyric-poster-row-breakpoint", String(roomUtility.lyricPosterRowBreakpoint));
  root.style.setProperty("--lyric-poster-transition", roomUtility.lyricPosterTransition);
  root.style.setProperty("--lyrics-animation-revision", String(lyricAnimationRevision));

  root.classList.toggle("lyric-poster-transition-none", roomUtility.lyricPosterTransition === "none");
  root.classList.toggle("lyric-poster-transition-push", roomUtility.lyricPosterTransition === "push-slide");
  root.classList.toggle("lyric-poster-transition-fade", roomUtility.lyricPosterTransition === "fade-slide");
  root.classList.toggle("lyric-poster-transition-shadow-slide", roomUtility.lyricPosterTransition === "shadow-slide");
  root.classList.toggle("lyric-poster-transition-ceiling-stamp", roomUtility.lyricPosterTransition === "ceiling-stamp");
  root.classList.toggle("lyric-poster-transition-soft-dissolve", roomUtility.lyricPosterTransition === "soft-dissolve");
  root.classList.toggle("lyric-poster-transition-ghost-drift", roomUtility.lyricPosterTransition === "ghost-drift");
  root.classList.toggle("lyric-poster-transition-back-push", roomUtility.lyricPosterTransition === "back-push");
  root.classList.toggle("lyric-poster-effect-drop-shadow", false);
  root.classList.toggle("lyric-poster-effect-emboss", false);
  root.classList.toggle("lyric-poster-effect-inset-emboss", false);
  root.classList.toggle("lyric-poster-effect-bevel", false);
  root.classList.toggle("lyric-poster-effect-soft-blur", false);
  renderTallLyricGuideOverlay();
}


function primeSongChangeAlbumReveal(track: AppState["playback"], now = Date.now()): boolean {
  const trackId = track.trackId || "";
  const albumArtUrl = track.albumArtUrl || "";

  if (!trackId || !albumArtUrl) {
    albumRevealPreloadTrackId = trackId || null;
    albumRevealPreloadUrl = "";
    albumRevealLoadedUrl = "";
    albumRevealPreloadImage = null;
    return true;
  }

  if (albumRevealPreloadTrackId !== trackId || albumRevealPreloadUrl !== albumArtUrl) {
    albumRevealPreloadTrackId = trackId;
    albumRevealPreloadUrl = albumArtUrl;
    albumRevealPreloadStartedAt = now;
    albumRevealLoadedUrl = "";
    albumRevealPreloadImage = new Image();

    const image = albumRevealPreloadImage;
    image.onload = () => {
      if (albumRevealPreloadTrackId === trackId && albumRevealPreloadUrl === albumArtUrl) {
        albumRevealLoadedUrl = albumArtUrl;
        updateSongChangeAlbumOverlay(track);
      }
    };
    image.onerror = () => {
      if (albumRevealPreloadTrackId === trackId && albumRevealPreloadUrl === albumArtUrl) {
        albumRevealLoadedUrl = "";
      }
    };
    image.src = albumArtUrl;

    if (typeof image.decode === "function") {
      void image.decode()
        .then(() => {
          if (albumRevealPreloadTrackId === trackId && albumRevealPreloadUrl === albumArtUrl) {
            albumRevealLoadedUrl = albumArtUrl;
            updateSongChangeAlbumOverlay(track);
          }
        })
        .catch(() => {
          // onerror/onload will handle the final state where supported.
        });
    }
  }

  return albumRevealLoadedUrl === albumArtUrl || now - albumRevealPreloadStartedAt >= ALBUM_REVEAL_MAX_WAIT_MS;
}

function updateSongChangeAlbumOverlay(track: AppState["playback"]): void {
  const albumCover = document.querySelector<HTMLImageElement>("#songChangeAlbumCover");
  const albumLayer = document.querySelector<HTMLElement>("#songChangeAlbumLayer");
  if (!albumCover || !albumLayer) return;

  const albumArtUrl = track.albumArtUrl || "";
  const readyUrl = albumArtUrl && albumRevealLoadedUrl === albumArtUrl ? albumArtUrl : "";
  albumLayer.classList.toggle("song-change-album-has-art", Boolean(readyUrl));

  if (readyUrl && albumCover.src !== readyUrl) {
    albumCover.src = readyUrl;
  }

  if (!readyUrl) {
    albumCover.removeAttribute("src");
  }

  albumCover.alt = readyUrl ? `${track.title} album cover` : "";
  updatePlacedActiveAlbum(track);
}

function playbackAlbumTrackKey(track: AppState["playback"]): string {
  if (track.trackId) return track.trackId;
  if (track.source === "demo" && track.title) return `demo:${track.title}|${track.artist}|${track.album}`;
  return "";
}

function isSongChangeRevealActive(): boolean {
  return roomUtility.songChangeMode || document.documentElement.classList.contains("dj-pose-a41");
}

function commitPlacedActiveAlbum(trackKey: string, url: string): void {
  placedAlbumCommittedTrackKey = trackKey;
  placedAlbumCommittedUrl = url;
  placedAlbumPendingTrackKey = "";
  placedAlbumPendingUrl = "";
  placedAlbumPendingRequiresReveal = false;
  placedAlbumPendingRevealSeen = false;
}

function updatePlacedActiveAlbum(track: AppState["playback"]): void {
  const layer = document.querySelector<HTMLElement>("#placedActiveAlbumLayer");
  const image = document.querySelector<HTMLImageElement>("#placedActiveAlbumCover");
  if (!layer || !image) return;

  const trackKey = playbackAlbumTrackKey(track);
  const albumArtUrl = track.albumArtUrl || "";
  const readyUrl = albumArtUrl && albumRevealLoadedUrl === albumArtUrl ? albumArtUrl : "";
  const revealActive = isSongChangeRevealActive();

  if (placedAlbumPendingTrackKey && revealActive) {
    placedAlbumPendingRevealSeen = true;
  }

  if (trackKey && readyUrl) {
    const alreadyCommitted = placedAlbumCommittedTrackKey === trackKey && placedAlbumCommittedUrl === readyUrl;
    const alreadyPending = placedAlbumPendingTrackKey === trackKey && placedAlbumPendingUrl === readyUrl;

    if (!alreadyCommitted && !alreadyPending) {
      placedAlbumPendingTrackKey = trackKey;
      placedAlbumPendingUrl = readyUrl;
      placedAlbumPendingRequiresReveal = Boolean(placedAlbumCommittedUrl && placedAlbumCommittedTrackKey && trackKey !== placedAlbumCommittedTrackKey);
      placedAlbumPendingRevealSeen = revealActive;
    }
  }

  const pendingCanCommit = Boolean(
    placedAlbumPendingTrackKey &&
    placedAlbumPendingUrl &&
    (
      !placedAlbumPendingRequiresReveal ||
      (placedAlbumPendingRevealSeen && !revealActive)
    )
  );

  if (pendingCanCommit) {
    commitPlacedActiveAlbum(placedAlbumPendingTrackKey, placedAlbumPendingUrl);
  }

  const displayUrl = placedAlbumCommittedUrl;
  const showAlbum = Boolean(roomUtility.placedAlbumEnabled && displayUrl);
  layer.classList.toggle("placed-active-album-has-art", showAlbum);

  if (showAlbum && image.getAttribute("src") !== displayUrl) image.src = displayUrl;
  if (!showAlbum) image.removeAttribute("src");
  image.alt = showAlbum ? "Placed album cover on the back shelf" : "";
}

function speakerPulseDurationMs(): number {
  const bpm = Math.max(55, Math.min(190, speakerTempoBpm || SPEAKER_PULSE_FALLBACK_BPM));
  return Math.round(60_000 / bpm);
}

function estimateTrackTempoBpm(track: AppState["playback"]): number {
  const text = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
  const durationMinutes = track.durationMs > 0 ? track.durationMs / 60_000 : 3.5;

  let estimate = 98;
  if (/remix|club|dance|party|jump|hype|work|run|fast|shake|bounce|pump|uptempo/.test(text)) estimate += 22;
  if (/intro|interlude|outro|acoustic|piano|ballad|slow|wait|heaven|love|blue|dream|night|rain|cry|sad/.test(text)) estimate -= 16;
  if (/hip.?hop|rap|trap|wayne|jay|missy|beastie|chance|tribe|roots|madvillain|kendrick|nas|pac|biggie/.test(text)) estimate += 7;
  if (/r.?&.?b|soul|janet|sza|usher|marvin|stevie|michael jackson/.test(text)) estimate -= 3;
  if (/rock|punk|blink|nirvana|beatles/.test(text)) estimate += 15;
  if (/jazz|miles|pink floyd/.test(text)) estimate -= 10;
  if (durationMinutes > 5.5) estimate -= 8;
  if (durationMinutes < 2.6) estimate += 6;

  let hash = 0;
  const seed = `${track.title}|${track.artist}|${track.album}|${track.durationMs}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  estimate += (hash % 25) - 12;
  return Math.max(62, Math.min(168, Math.round(estimate)));
}

function updateMixerTempoLedStatus(source: typeof speakerTempoSource): void {
  const root = document.documentElement;
  const led = document.querySelector<HTMLElement>("#mixerTempoLed");
  const status =
    source === "getsongbpm" || source === "spotify" || source === "demo"
      ? "locked"
      : source === "lookup"
        ? "lookup"
        : source === "estimate" || source === "nomatch"
          ? "estimated"
          : "fallback";

  root.dataset.tempoStatus = status;
  root.classList.toggle("tempo-status-locked", status === "locked");
  root.classList.toggle("tempo-status-lookup", status === "lookup");
  root.classList.toggle("tempo-status-estimated", status === "estimated");
  root.classList.toggle("tempo-status-fallback", status === "fallback");

  if (!led) return;
  const readable =
    status === "locked"
      ? "Tempo source: lookup succeeded"
      : status === "lookup"
        ? "Tempo source: looking up"
        : status === "estimated"
          ? "Tempo source: estimated"
          : "Tempo source: fallback";
  led.title = readable;
  led.setAttribute("aria-label", readable);
}

function setSpeakerTempo(nextBpm: number | null, source: typeof speakerTempoSource): void {
  speakerTempoBpm = nextBpm && Number.isFinite(nextBpm) && nextBpm > 0 ? nextBpm : SPEAKER_PULSE_FALLBACK_BPM;
  speakerTempoSource = source;
  document.documentElement.style.setProperty("--speaker-pulse-duration", `${speakerPulseDurationMs()}ms`);
  setSpeakerPulseBpmLabel();
  updateMixerTempoLedStatus(source);
}

function setSpeakerPulseBpmLabel(): void {
  const label = document.querySelector<HTMLElement>("#speakerPulseBpmValue");
  if (!label) return;
  const bpm = speakerTempoBpm || SPEAKER_PULSE_FALLBACK_BPM;
  const sourceLabel =
    speakerTempoSource === "getsongbpm"
      ? "GetSongBPM"
      : speakerTempoSource === "spotify"
        ? "Spotify"
        : speakerTempoSource === "demo"
          ? "demo"
          : speakerTempoSource === "estimate"
            ? "estimated"
            : speakerTempoSource === "lookup"
              ? "looking up..."
              : speakerTempoSource === "nomatch"
                ? "estimated (no match)"
                : "fallback";
  label.textContent = `${Math.round(bpm)} ${sourceLabel}`;
}

function speakerTempoExternalKey(track: AppState["playback"]): string {
  return `${track.artist.trim().toLowerCase()}::${track.title.trim().toLowerCase()}`;
}

function applySpeakerPulseTempo(track: AppState["playback"]): void {
  const trackKey = track.trackId || `${track.source}:${track.title}:${track.artist}:${track.durationMs}`;
  const externalKey = speakerTempoExternalKey(track);

  if (!roomUtility.speakerPulseUseTempo) {
    speakerTempoTrackKey = trackKey;
    setSpeakerTempo(SPEAKER_PULSE_FALLBACK_BPM, "fallback");
    return;
  }

  if (!track.isPlaying && track.source !== "demo") {
    setSpeakerPulseBpmLabel();
    return;
  }

  if (typeof track.tempoBpm === "number" && Number.isFinite(track.tempoBpm) && track.tempoBpm > 0) {
    speakerTempoTrackKey = trackKey;
    setSpeakerTempo(track.tempoBpm, track.source === "demo" ? "demo" : "spotify");
    return;
  }

  if (!track.trackId || track.source !== "spotify") {
    speakerTempoTrackKey = trackKey;
    setSpeakerTempo(estimateTrackTempoBpm(track), "estimate");
    return;
  }

  const externalCached = externalSpeakerTempoCache.get(externalKey);
  if (externalCached) {
    speakerTempoTrackKey = trackKey;
    setSpeakerTempo(externalCached, "getsongbpm");
    return;
  }

  const cached = speakerTempoCache.get(track.trackId);
  if (cached) {
    speakerTempoTrackKey = track.trackId;
    setSpeakerTempo(cached, "spotify");
    return;
  }

  if (speakerTempoTrackKey !== trackKey) {
    speakerTempoTrackKey = trackKey;
    setSpeakerTempo(estimateTrackTempoBpm(track), "estimate");
  }

  if (
    roomUtility.speakerPulseUseExternalTempo &&
    GETSONGBPM_BROWSER_API_KEY &&
    !externalSpeakerTempoMisses.has(externalKey) &&
    speakerTempoFetchKey !== `getsongbpm:${externalKey}`
  ) {
    speakerTempoFetchKey = `getsongbpm:${externalKey}`;
    setSpeakerTempo(speakerTempoBpm || estimateTrackTempoBpm(track), "lookup");

    void getExternalTrackTempoBpm(GETSONGBPM_BROWSER_API_KEY, track.title, track.artist)
      .then((tempo) => {
        if (speakerTempoTrackKey !== trackKey) return;

        if (tempo && Number.isFinite(tempo) && tempo > 0) {
          externalSpeakerTempoCache.set(externalKey, tempo);
          setSpeakerTempo(tempo, "getsongbpm");
          return;
        }

        externalSpeakerTempoMisses.add(externalKey);
        setSpeakerTempo(estimateTrackTempoBpm(track), "nomatch");
      })
      .catch(() => {
        if (speakerTempoTrackKey !== trackKey) return;
        externalSpeakerTempoMisses.add(externalKey);
        setSpeakerTempo(estimateTrackTempoBpm(track), "nomatch");
      });

    return;
  }

  if (speakerTempoFetchKey === track.trackId) return;
  speakerTempoFetchKey = track.trackId;
  void getTrackTempoBpm(state.spotifyClientId, track.trackId)
    .then((tempo) => {
      if (!tempo || speakerTempoTrackKey !== trackKey) return;
      speakerTempoCache.set(track.trackId || "", tempo);
      setSpeakerTempo(tempo, "spotify");
    })
    .catch(() => {
      // Keep the local estimate if Spotify tempo/audio-analysis data is unavailable.
      if (speakerTempoTrackKey === trackKey && speakerTempoSource !== "spotify" && speakerTempoSource !== "getsongbpm") {
        setSpeakerPulseBpmLabel();
      }
    });
}

async function refreshLyricsForCurrentTrack(): Promise<void> {
  const track = state.playback;
  const key = getLyricsTrackKey(track);

  if (!key || track.source === "none") {
    lyricsState = emptyLyrics("idle");
    lyricsFetchKey = "";
    updateLyricsCeiling(lyricsState, 0, -1, lyricsEnabled, false);
    updateMarqueeLyricsAvailability(lyricsState.status, lyricsEnabled);
    return;
  }

  if (key === lyricsFetchKey) return;

  lyricsFetchKey = key;
  lyricsState = { ...emptyLyrics("loading"), trackKey: key };
  updateLyricsCeiling(lyricsState, getEstimatedPlaybackProgress(track), -1, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");
  updateMarqueeLyricsAvailability(lyricsState.status, lyricsEnabled);

  lyricsState = await fetchLyricsForTrack(track);
  const lyricProgressMs = getEstimatedPlaybackProgress(track);
  const activeLyricIndex = getActiveLyricIndex(lyricsState.syncedLyrics, lyricProgressMs);
  updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");
  updateMarqueeLyricsAvailability(lyricsState.status, lyricsEnabled);
}

async function pollSpotifyNow(): Promise<void> {
  if (useDemo) return;
  if (!state.spotifyClientId) return;

  try {
    lastPollError = "";
    state.playback = await getCurrentlyPlaying(state.spotifyClientId);
    updatePlaybackUi(state.playback, state.debugOpen);
    void refreshLyricsForCurrentTrack();

    if (Date.now() - lastDeviceRefreshAt > 5_000) {
      lastDeviceRefreshAt = Date.now();
      void refreshSpotifyDevices();
    }

    if (state.playback.isAuthenticated && !panelAutoHiddenAfterConnect) {
      panelAutoHiddenAfterConnect = true;
      window.setTimeout(() => setControlPanelOpen(false), 900);
    }
  } catch (error) {
    lastPollError = error instanceof Error ? error.message : String(error);
    console.warn(lastPollError);
  } finally {
    // Keep visible-page polling fast so the DJ state changes quickly when Spotify starts,
    // pauses, stops, or switches tracks. The previous 7s/18s visible intervals made
    // idle-to-active and active-to-idle transitions feel delayed.
    const interval = document.hidden ? 45_000 : 2_500;
    scheduleNextPoll(interval);
  }
}

function scheduleNextPoll(delayMs: number): void {
  if (pollTimer) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => void pollSpotifyNow(), delayMs);
}

function tick(): void {
  if (useDemo) {
    state.playback = getDemoTrack();
  }

  const albumRevealReady = primeSongChangeAlbumReveal(state.playback);

  if (roomUtility.songChangeMode) {
    dj.setPose("a41.png");
    state.djMode = "playing";
  } else {
    state.djMode = dj.update(state.playback, Date.now(), albumRevealReady);
  }

  updateSongChangeAlbumOverlay(state.playback);
  applySpeakerPulseTempo(state.playback);
  updateReactiveRoomPalette(state.playback);
  syncMusicReactiveEnvironment(state.playback);
  updateSpeakerPulse(state.playback.isPlaying || state.playback.source === "demo");
  updatePlaybackUi(state.playback, state.debugOpen);
  if (menu2Open) renderMenu2NowPlaying();

  const lyricProgressMs = getEstimatedPlaybackProgress(state.playback);
  const activeLyricIndex = getActiveLyricIndex(lyricsState.syncedLyrics, lyricProgressMs);
  updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");

  requestAnimationFrame(tick);
}

void boot();
