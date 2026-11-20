export interface Artist {
  id: string;
  name: string;
}
export interface Album {
  id: string;
  artistIds: string[];
  title: string;
  credit?: string;
  year: number;
  cover: string;
  singles?: boolean;
  defaultSelected?: boolean;
}
export interface Song {
  id: string;
  title: string;
  artistIds: string[];
  albumIds: string[];
  albumId: string;
  duration?: number;
  kind: "song" | "skit" | "interlude";
  quality: number;
  popularity: number;
  scoreSource: string;
  youtubeId?: string;
  backupYoutubeId?: string;
}
export interface Catalog {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
  sources?: unknown[];
  issues?: string[];
}
export interface BracketOptions {
  artistId: string;
  artistAlbums?: Record<string, string[]>;
  albumIds: string[];
  includeInterludes: boolean;
  startAt40?: boolean;
  size: number;
  first: number;
  second: number;
  randomness: number;
  seed: number;
  name: string;
}
export interface Match {
  id: string;
  round: number;
  slots: ({ songId: string } | { matchId: string })[];
}
export interface Definition {
  version: 1;
  id: string;
  createdAt: string;
  options: BracketOptions;
  songs: Song[];
  albums: Album[];
  artist: Artist;
  artists?: Artist[];
  sharedSources?: Record<string, SourceOverride>;
  matches: Match[];
  roundSizes: number[];
}
export interface Pick {
  matchId: string;
  songId: string;
  at: string;
  position?: PlaybackPosition;
}
export interface PlaybackPosition {
  videoId: string;
  seconds: number;
}
export interface Run {
  id: string;
  definition: Definition;
  picks: Pick[];
  updatedAt: string;
}
export interface HistoryEntry {
  id: string;
  name: string;
  artist: string;
  winner: string;
  completedAt: string;
  entrantCount: number;
  full: Blob;
  top?: Blob;
  result?: Run;
}
export interface SourceOverride {
  primary?: string;
  backup?: string;
  start?: number;
}
export interface Settings {
  appearance?: "soul" | "streaming";
  resumeSongs?: boolean;
  displayScale?: "auto" | "standard" | "large";
  artistPickerView?: "grid" | "list";
  albumPickerView?: "grid" | "list";
  dark: boolean;
  pinned: boolean;
  hover: boolean;
  volume: number;
  delay: number;
}
