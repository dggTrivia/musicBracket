import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  TriangleAlert,
  AudioLines,
  ChevronRight,
  Check,
  Download,
  History,
  House,
  Info,
  LayoutGrid,
  Library,
  List,
  Menu,
  Moon,
  Pin,
  Plus,
  Search,
  Settings as SettingsIcon,
  Shuffle,
  Sun,
  Trophy,
  Undo2,
  Upload,
  Volume2,
  X,
  GitBranch,
  Play,
  Lock,
  Unlock,
  Trash2,
  Disc3,
  CheckCircle2,
  Link2,
  Users,
} from "lucide-react";
import type {
  Album,
  Artist,
  BracketOptions,
  Catalog,
  Definition,
  HistoryEntry,
  Run,
  Settings,
  Song,
  SourceOverride,
} from "./types";
import {
  choose,
  currentMatch,
  decisionCount,
  makeDefinition,
  matchSongs,
  outcomes,
  plan,
  selectEntrants,
  songArtist,
  undo,
  validateDefinition,
} from "./engine";
import { download, storage } from "./storage";
import { exportBracket, renderHistoryEntry } from "./exports";
import { parseVideo, SongPlayer } from "./Player";
import type { SongPlayback } from "./Player";
import { useDialogFocus } from "./useDialogFocus";
import { artistCategories } from "./artistCategories";
import { suggestedMixes } from "./suggestedMixes";
import {
  challengeSnapshot,
  createChallengeLink,
  isChallengeLink,
  readChallengeLink,
} from "./share";

const defaults: Settings = {
  dark: false,
  pinned: false,
  hover: true,
  volume: 65,
  delay: 220,
};
const settingsActions = {
  reset: {
    label: "Reset settings",
    summary: "Restore the original theme, playback, and display preferences.",
    title: "Reset settings to default?",
    detail:
      "Your appearance, playback, display, and picker preferences will return to their defaults. Your saved brackets and history will be kept.",
  },
  wipe: {
    label: "Wipe all saved brackets",
    summary:
      "Permanently delete every active run and completed result on this browser.",
    title: "Wipe all saved brackets?",
    detail:
      "This permanently deletes every active run and all completed results, including their bracket images, from this browser. You can’t undo this.",
  },
};
const artistPortraits = new Set([
  "50-cent",
  "a-tribe-called-quest",
  "abba",
  "ac-dc",
  "action-bronson",
  "al-green",
  "alex-g",
  "aphex-twin",
  "arctic-monkeys",
  "aretha-franklin",
  "beyonce",
  "bjork",
  "black-sabbath",
  "bob-dylan",
  "bruce-springsteen",
  "creedence-clearwater-revival",
  "curtis-mayfield",
  "daft-punk",
  "danny-brown",
  "david-bowie",
  "deftones",
  "drake",
  "earl-sweatshirt",
  "eminem",
  "fleetwood-mac",
  "frank-ocean",
  "freddie-gibbs",
  "gorillaz",
  "green-day",
  "j-cole",
  "james-blake",
  "jay-z",
  "jimi-hendrix",
  "john-coltrane",
  "jpegmafia",
  "ka",
  "kanye-west",
  "kendrick-lamar",
  "kid-cudi",
  "kraftwerk",
  "lana-del-rey",
  "led-zeppelin",
  "linkin-park",
  "mac-miller",
  "marvin-gaye",
  "mary-j-blige",
  "metallica",
  "mf-doom",
  "michael-jackson",
  "mitski",
  "neil-young",
  "nine-inch-nails",
  "nirvana",
  "olivia-rodrigo",
  "otis-redding",
  "outkast",
  "paramore",
  "pink-floyd",
  "pixies",
  "playboi-carti",
  "portishead",
  "prince",
  "queen",
  "r-kelly",
  "radiohead",
  "rage-against-the-machine",
  "ramones",
  "ray-charles",
  "rihanna",
  "sam-cooke",
  "smino",
  "stevie-wonder",
  "sufjan-stevens",
  "sza",
  "talking-heads",
  "tame-impala",
  "the-beach-boys",
  "the-beatles",
  "the-clash",
  "the-cure",
  "the-rolling-stones",
  "the-weeknd",
  "the-who",
  "tom-waits",
  "tyler-the-creator",
  "vince-staples",
  "wilco",
  "young-thug",
]);
const emptyOptions: BracketOptions = {
  artistId: "kanye-west",
  albumIds: [],
  includeInterludes: false,
  size: 0,
  first: 2,
  second: 2,
  randomness: 28,
  seed: Math.floor(Math.random() * 2 ** 31),
  name: "",
};
type View =
  "home" | "new" | "game" | "active" | "history" | "library" | "settings";
const menuGuard = { musicBracketMenuGuard: true };
function keepMenuInHistory(url?: string) {
  if (!window.history.state?.musicBracketMenuGuard)
    window.history.pushState(menuGuard, "", url);
}
function roundTitle(round: number, total: number) {
  switch (total - round) {
    case 1:
      return "Final";
    case 2:
      return "Semifinals";
    case 3:
      return "Quarterfinals";
    default:
      return `Round ${round + 1}`;
  }
}
let roundAudio: AudioContext | undefined;
function prepareRoundCue(volume: number) {
  if (!volume) return;
  try {
    const context = (roundAudio ??= new AudioContext());
    const ready = context.resume().then(
      () => true,
      () => false,
    );
    return async () => {
      if (!(await ready)) return;
      const when = context.currentTime + 0.02;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const note = context.createOscillator();
        const gain = context.createGain();
        const start = when + index * 0.085;
        note.type = "sine";
        note.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume * 0.00042, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
        note.connect(gain).connect(context.destination);
        note.start(start);
        note.stop(start + 0.24);
      });
    };
  } catch {
    // The stage heading still announces the round when sound is unavailable.
  }
}
export default function App() {
  const [snapshotSize, setSnapshotSize] = useState(16);
  const [artistChosen, setArtistChosen] = useState(false);
  const [incoming, setIncoming] = useState<Definition | null>(null);
  const incomingUrl = useRef<string | undefined>(undefined);
  const leavingForMenu = useRef(false);
  const [share, setShare] = useState<Definition | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmHome, setConfirmHome] = useState(false);
  const [settingsAction, setSettingsAction] = useState<
    keyof typeof settingsActions | null
  >(null);
  const [settingsActionBusy, setSettingsActionBusy] = useState(false);
  const [settingsActionError, setSettingsActionError] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [artistCategory, setArtistCategory] = useState("");
  const playback = useRef(new Map<string, SongPlayback>());
  const [winnerRun, setWinnerRun] = useState<Run>();
  const [archiveFailures, setArchiveFailures] = useState<string[]>([]);
  const archiving = useRef(new Set<string>());
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [settings, setSettings] = useState(defaults),
    [loaded, setLoaded] = useState(false),
    [view, setView] = useState<View>("home"),
    [runs, setRuns] = useState<Run[]>([]),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [runId, setRunId] = useState(""),
    [options, setOptions] = useState(emptyOptions),
    [preview, setPreview] = useState<Definition | null>(null),
    [menu, setMenu] = useState(false),
    [bracket, setBracket] = useState(false),
    [sources, setSources] = useState<Record<string, SourceOverride>>({}),
    [editing, setEditing] = useState<Song | null>(null),
    [activeSong, setActiveSong] = useState(""),
    [playbackLock, setPlaybackLock] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [libraryArtist, setLibraryArtist] = useState("all");
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    catalogInput = useRef<HTMLInputElement>(null);
  const menuOpener = useRef<HTMLButtonElement | null>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const streaming = settings.appearance === "streaming";
  const [wideLayout, setWideLayout] = useState(
    () => window.matchMedia("(min-width: 1100px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px)");
    const update = () => setWideLayout(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const docked = streaming && wideLayout;
  const pinned = docked || settings.pinned;
  const drawerOpen = menu || pinned;
  const exportTheme = streaming ? "streaming" : settings.dark;
  useDialogFocus(bracket && !share && !confirmHome, ".bracket-dialog", () =>
    setBracket(false),
  );
  const run =
      runs.find((r) => r.id === runId) ??
      (winnerRun?.id === runId ? winnerRun : undefined),
    match = run ? currentMatch(run) : undefined;
  const savedPositions = useMemo(
    () =>
      new Map(
        run?.picks.flatMap((pick) =>
          pick.position ? [[pick.songId, pick.position] as const] : [],
        ),
      ),
    [run],
  );
  const activeRuns = useMemo(() => runs.filter((r) => currentMatch(r)), [runs]);
  const albumSongCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of catalog?.songs ?? []) {
      if (song.kind !== "song") continue;
      for (const id of song.albumIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [catalog]);
  const sortedArtists = useMemo(
    () =>
      [...(catalog?.artists ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [catalog],
  );
  const showPrompt = confirmHome || confirmNew;
  const confirmation = settingsAction ? settingsActions[settingsAction] : null;
  useDialogFocus(Boolean(confirmation), ".settings-confirmation", () => {
    if (!settingsActionBusy) setSettingsAction(null);
  });
  const playingBracket = view === "game" && Boolean(match);
  const navigate = useCallback(
    (next: View) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (next === "new" && view !== "new") {
        setArtistChosen(false);
        setArtistQuery("");
        setArtistCategory("");
      }
      setView(next);
      setMenu(false);
      setActiveSong("");
      setQuery("");
      if (next === "home") {
        incomingUrl.current = undefined;
        setIncoming(null);
        setConfirmHome(false);
        setConfirmNew(false);
        setBracket(false);
        setShare(null);
        setEditing(null);
        setSettingsAction(null);
        if (window.history.state?.musicBracketMenuGuard) {
          leavingForMenu.current = true;
          window.history.back();
        }
      } else {
        keepMenuInHistory();
      }
    },
    [view],
  );
  const dismissPrompt = () => {
    if (confirmHome) setConfirmHome(false);
    else setConfirmNew(false);
  };
  useDialogFocus(
    showPrompt,
    confirmHome ? ".home-prompt" : ".run-prompt",
    dismissPrompt,
  );
  useLayoutEffect(() => {
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = restoration;
    };
  }, []);
  useLayoutEffect(() => {
    if (view !== "home") keepMenuInHistory();
    window.scrollTo(0, 0);
    const onBack = (event: PopStateEvent) => {
      if (leavingForMenu.current) {
        leavingForMenu.current = false;
        return;
      }
      if (view === "home" || event.state?.musicBracketMenuGuard) return;
      if (!playingBracket) {
        navigate("home");
        return;
      }
      keepMenuInHistory(incomingUrl.current);
      setConfirmHome(true);
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [view, playingBracket, navigate]);
  const notify = useCallback((s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 5000);
  }, []);
  const confirmSettingsAction = async () => {
    if (!settingsAction || settingsActionBusy) return;
    setSettingsActionBusy(true);
    setSettingsActionError("");
    try {
      if (settingsAction === "reset") {
        await storage.saveSettings(defaults);
        setSettings(defaults);
        notify("Settings reset to default.");
      } else {
        await storage.clearBrackets();
        setRuns([]);
        setHistory([]);
        setRunId("");
        setWinnerRun(undefined);
        setArchiveFailures([]);
        notify("Active runs and history cleared.");
      }
      setSettingsAction(null);
    } catch (cause) {
      setSettingsActionError(
        cause instanceof Error
          ? cause.message
          : "The change could not be saved. Try again.",
      );
    } finally {
      setSettingsActionBusy(false);
    }
  };
  const refresh = async () => {
    setRuns(
      (await storage.runs()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
    setHistory(
      (await storage.history()).sort((a, b) =>
        b.completedAt.localeCompare(a.completedAt),
      ),
    );
  };
  useEffect(() => {
    Promise.all([
      fetch("/catalog.json").then((r) => {
        if (!r.ok) throw Error("The music catalog could not load.");
        return r.json();
      }),
      storage.settings(),
      storage.runs(),
      storage.history(),
      storage.sources(),
    ])
      .then(([data, prefs, active, completed, overrides]) => {
        const local = localStorage.getItem("musicbracket.catalog");
        const saved: Catalog | undefined = local
          ? JSON.parse(local)
          : undefined;
        const published: Catalog = data;
        const merge = <T extends { id: string }>(
          defaults: T[],
          additions: T[] = [],
        ) => [
          ...new Map(
            [...defaults, ...additions].map((entry) => [entry.id, entry]),
          ).values(),
        ];
        const c: Catalog = {
          ...published,
          artists: merge(published.artists, saved?.artists),
          albums: merge(saved?.albums ?? [], published.albums),
          songs: merge(published.songs, saved?.songs),
        };
        const latest = new Map<string, Song>(
          data.songs.map((song: Song) => [song.id, song]),
        );
        c.songs = c.songs.map((song) => {
          const published = latest.get(song.id);
          if (!published) return song;
          return {
            ...song,
            artistIds: [
              ...new Set([...published.artistIds, ...song.artistIds]),
            ],
            albumIds: [...new Set([...published.albumIds, ...song.albumIds])],
            ...(song.scoreSource !== "Personal override"
              ? {
                  quality: published.quality,
                  popularity: published.popularity,
                  scoreSource: published.scoreSource,
                }
              : {}),
            youtubeId: published.youtubeId ?? song.youtubeId,
            backupYoutubeId: published.backupYoutubeId ?? song.backupYoutubeId,
          };
        });
        setCatalog(c);
        setSettings(prefs || defaults);
        setRuns(active);
        setHistory(completed);
        setSources(overrides);
        const a = c.artists.find((a) => a.id === "kanye-west") || c.artists[0];
        setOptions((o) => ({
          ...o,
          artistId: a.id,
          albumIds: c.albums
            .filter(
              (x) => x.artistIds.includes(a.id) && x.defaultSelected !== false,
            )
            .map((x) => x.id),
        }));
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let request = 0;
    const openLink = async () => {
      const id = ++request;
      const hash = window.location.hash;
      if (!isChallengeLink(hash)) {
        incomingUrl.current = undefined;
        setIncoming(null);
        return;
      }
      // Keep the menu entry free of replay data so Back can return to it.
      const url = new URL(window.location.href);
      const replayUrl = url.href;
      incomingUrl.current = replayUrl;
      if (!window.history.state?.musicBracketMenuGuard) {
        url.hash = "";
        window.history.replaceState(window.history.state, "", url);
        keepMenuInHistory(replayUrl);
      }
      setView("new");
      setMenu(false);
      setBracket(false);
      setShare(null);
      setActiveSong("");
      try {
        const definition = await readChallengeLink(hash);
        if (id === request && incomingUrl.current === replayUrl) {
          setError("");
          setIncoming(definition);
        }
      } catch {
        if (id === request && incomingUrl.current === replayUrl) {
          setIncoming(null);
          setError(
            "This challenge link is invalid or incomplete. Ask your friend to send it again.",
          );
        }
      }
    };
    const onHashChange = (event: HashChangeEvent) => {
      if (event.newURL === window.location.href) void openLink();
    };
    void openLink();
    window.addEventListener("hashchange", onHashChange);
    return () => {
      request++;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.appearance = streaming
      ? "streaming"
      : "soul";
    document.documentElement.dataset.theme =
      streaming || settings.dark ? "dark" : "light";
    document.documentElement.dataset.display = settings.displayScale ?? "auto";
    if (loaded)
      storage.saveSettings(settings).catch((e) => setError(e.message));
  }, [settings, streaming, loaded]);
  useEffect(() => {
    if (!menu || pinned) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menu, pinned]);
  useLayoutEffect(() => {
    if (drawerOpen) {
      if (menuOpener.current) drawerClose.current?.focus();
    } else if (menuOpener.current) {
      menuOpener.current.focus();
      menuOpener.current = null;
    }
  }, [drawerOpen]);
  const openMenu = (opener: HTMLButtonElement) => {
    menuOpener.current = opener;
    setMenu(true);
  };
  const requestHome = () => {
    if (view === "home") setMenu(false);
    else if (playingBracket) setConfirmHome(true);
    else navigate("home");
  };
  const resume = (savedRun: Run) => {
    setRunId(savedRun.id);
    navigate("game");
  };
  const requestNew = () => {
    if (view === "game" && match) setConfirmNew(true);
    else navigate("new");
  };
  const activate = (id: string) => setActiveSong(id);
  const vote = useCallback(
    async (id: string) => {
      if (!run || busy) return;
      try {
        setBusy(true);
        const next = choose(
          run,
          id,
          settings.resumeSongs
            ? playback.current.get(id)?.getPosition()
            : undefined,
        );
        const following = currentMatch(next);
        const cue =
          following && match && following.round > match.round
            ? prepareRoundCue(settings.volume)
            : undefined;
        await storage.saveRun(next, { existing: true });
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setRuns((list) => list.map((r) => (r.id === next.id ? next : r)));
        setActiveSong("");
        void cue?.().catch(() => {});
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [run, busy, match, settings.resumeSongs, settings.volume],
  );
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest("input,select,textarea,button,a") ||
        editing ||
        bracket ||
        showPrompt ||
        view !== "game" ||
        !run
      )
        return;
      if (e.key === "Escape") setActiveSong("");
      if (e.code === "Space") {
        e.preventDefault();
        setPlaybackLock((x) => !x);
      }
      const index = Number(e.key) - 1;
      if (index >= 0 && index < 4 && match) {
        const s = matchSongs(run, match)[index];
        if (s) void vote(s.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run, match, view, editing, bracket, vote, showPrompt]);
  const archive = useCallback(
    async (finished: Run) => {
      if (archiving.current.has(finished.id)) return;
      archiving.current.add(finished.id);
      try {
        const entry = await renderHistoryEntry(finished, exportTheme);
        if (!(await storage.archive(entry))) return;
        if (finished.id === runId) setWinnerRun(finished);
        setHistory((items) => [
          entry,
          ...items.filter((item) => item.id !== entry.id),
        ]);
        setRuns((items) => items.filter((item) => item.id !== finished.id));
      } catch (e) {
        setArchiveFailures((ids) => [...ids, finished.id]);
        setError(
          "Result images could not be saved. Retry from History. " +
            (e as Error).message,
        );
      } finally {
        archiving.current.delete(finished.id);
      }
    },
    [runId, exportTheme],
  );
  useEffect(() => {
    for (const finished of runs) {
      if (!currentMatch(finished) && !archiveFailures.includes(finished.id))
        void archive(finished);
    }
  }, [runs, archiveFailures, archive]);
  if (error && !catalog)
    return (
      <div className="load-state">
        <h1>Let’s get the music back.</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  if (!catalog || !loaded)
    return (
      <div className="load-state">
        <Disc3 className="loading-disc" size={44} />
        <h1>Finding your groove.</h1>
        <p>Opening the record collection…</p>
      </div>
    );
  const c = catalog;
  const searchKey = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\p{L}]+/gu, "");
  const artistSearch = searchKey(artistQuery);
  const category = artistCategories.find(
    (group) => group.label === artistCategory,
  );
  const visibleArtists =
    view === "new" && !artistChosen
      ? sortedArtists.filter(
          (a) =>
            (!category || category.artists.includes(a.id)) &&
            searchKey(a.name).includes(artistSearch),
        )
      : [];
  const artistAlbums = options.artistAlbums;
  const mixed = artistAlbums !== undefined;
  const mixedArtists = mixed
    ? Object.keys(artistAlbums).flatMap(
        (id) => c.artists.find((artist) => artist.id === id) ?? [],
      )
    : [];
  const artist =
    c.artists.find((a) => a.id === options.artistId) || c.artists[0];
  const bracketArtist = mixed
    ? {
        id: "mixed",
        name:
          mixedArtists.length === 2
            ? mixedArtists.map((a) => a.name).join(" & ")
            : "Mixed artist bracket",
      }
    : artist;
  const artistReleases = c.albums.filter((a) =>
    a.artistIds.includes(artist.id),
  );
  const singles = artistReleases.find((release) => release.singles);
  const albums = artistReleases
    .filter((release) => !release.singles)
    .sort((a, b) => a.year - b.year);
  const artistPickerView = settings.artistPickerView ?? "grid";
  const albumPickerView = settings.albumPickerView ?? "grid";
  const librarySelection =
    view === "library" && libraryArtist !== "all"
      ? c.artists.find((a) => a.id === libraryArtist)
      : undefined;
  const libraryTracks = librarySelection
    ? c.songs.filter((s) => s.artistIds.includes(librarySelection.id))
    : c.songs;
  const libraryAlbumCount = c.albums.filter(
    (a) =>
      !a.singles &&
      (!librarySelection || a.artistIds.includes(librarySelection.id)),
  ).length;
  const selectedAlbums = artistAlbums?.[artist.id] ?? options.albumIds;
  const singlesSelected = Boolean(
    singles && selectedAlbums.includes(singles.id),
  );
  const field =
    view === "new" && artistChosen ? selectEntrants(options, c.songs) : null;
  const entrants = field?.entrants.length ?? 0;
  const canStart =
    entrants >= 2 &&
    (!mixed || mixedArtists.every((a) => (field?.counts.get(a.id) ?? 0) > 0));
  const stages =
    entrants >= 2 ? plan(entrants, options.first, options.second) : [];
  const setOption = <K extends keyof BracketOptions>(
    key: K,
    value: BracketOptions[K],
  ) => {
    setOptions((o) => ({ ...o, [key]: value }));
    setPreview(null);
  };
  const defaultAlbums = (id: string) =>
    c.albums
      .filter(
        (album) =>
          album.artistIds.includes(id) && album.defaultSelected !== false,
      )
      .map((album) => album.id);
  const setArtistAlbums = (
    selection: Record<string, string[]>,
    focused: string,
  ) => {
    setOptions((o) => ({
      ...o,
      artistId: focused,
      artistAlbums: selection,
      albumIds: [...new Set(Object.values(selection).flat())],
    }));
    setPreview(null);
  };
  const chooseArtist = (a: Artist) => {
    if (!artistAlbums) {
      if (a.id !== options.artistId) {
        setOptions((o) => ({
          ...o,
          artistId: a.id,
          albumIds: defaultAlbums(a.id),
        }));
        setPreview(null);
      }
      setArtistChosen(true);
      return;
    }
    if (Object.hasOwn(artistAlbums, a.id)) {
      const selection = { ...artistAlbums };
      delete selection[a.id];
      setArtistAlbums(selection, Object.keys(selection)[0] ?? a.id);
    } else if (mixedArtists.length < 8) {
      setArtistAlbums(
        { ...artistAlbums, [a.id]: defaultAlbums(a.id) },
        options.artistId,
      );
    }
  };
  const updateVisibleAlbums = (selection: string[]) => {
    if (artistAlbums)
      setArtistAlbums({ ...artistAlbums, [artist.id]: selection }, artist.id);
    else setOption("albumIds", selection);
  };
  const selectMode = (nextMixed: boolean) => {
    if (nextMixed === mixed) return;
    setOptions((o) => ({
      ...o,
      artistAlbums: nextMixed ? {} : undefined,
      albumIds: nextMixed ? [] : defaultAlbums(o.artistId),
      size: nextMixed ? 32 : 0,
    }));
    setPreview(null);
  };
  const openSuggestedMix = (mix: (typeof suggestedMixes)[number]) => {
    const years = mix.years;
    const artists = mix.artists.flatMap((id) => {
      const albums = c.albums.filter(
        (album) =>
          album.artistIds.includes(id) &&
          (!years ||
            (!album.singles &&
              album.year >= years[0] &&
              album.year <= years[1])) &&
          (albumSongCounts.get(album.id) ?? 0) > 0,
      );
      return albums.length
        ? [[id, albums.map((album) => album.id)] as const]
        : [];
    });
    if (artists.length < 2) return;
    setOptions((o) => ({
      ...o,
      artistId: artists[0][0],
      artistAlbums: Object.fromEntries(artists),
      albumIds: [...new Set(artists.flatMap(([, albumIds]) => albumIds))],
      size: mix.size,
      name: mix.name,
      seed: Math.floor(Math.random() * 2 ** 31),
    }));
    setPreview(null);
    setArtistChosen(true);
  };
  const buildDefinition = (opts: BracketOptions) =>
    makeDefinition(
      opts,
      c.songs,
      c.albums,
      bracketArtist,
      mixed ? mixedArtists : undefined,
    );
  const newPreview = () => {
    try {
      const next = { ...options, seed: Math.floor(Math.random() * 2 ** 31) };
      setOptions(next);
      setPreview(buildDefinition(next));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const dismissChallenge = () => {
    incomingUrl.current = undefined;
    setIncoming(null);
    if (isChallengeLink(window.location.hash)) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(window.history.state, "", url.href);
    }
  };
  const start = async (challenge?: Definition) => {
    if (busy) return;
    try {
      setBusy(true);
      if (activeRuns.length >= 5)
        throw Error(
          "You have five active runs. Finish or delete one in Active runs first.",
        );
      const definition = challenge || preview || buildDefinition(options);
      const next: Run = {
        id: crypto.randomUUID(),
        definition,
        picks: [],
        updatedAt: new Date().toISOString(),
      };
      await storage.saveRun(next);
      setRuns((r) => [next, ...r]);
      setRunId(next.id);
      if (challenge) dismissChallenge();
      navigate("game");
      notify(challenge ? "Your replay is saved." : "Your bracket is saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const undoPick = async () => {
    if (!run || !run.picks.length) return;
    try {
      const next = undo(run);
      await storage.saveRun(next, { existing: true });
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setRuns((list) => list.map((r) => (r.id === next.id ? next : r)));
      setActiveSong("");
      notify("Last pick undone.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 8_000_000) throw Error("This file is too large.");
      const input = JSON.parse(await file.text());
      const d = validateDefinition(input.definition || input);
      let next: Run = {
        id: crypto.randomUUID(),
        definition: d,
        picks: [],
        updatedAt: new Date().toISOString(),
      };
      if (Array.isArray(input.picks)) {
        for (const p of input.picks) {
          const pos = p.position;
          const parsedPosition =
            pos &&
            typeof pos.videoId === "string" &&
            /^[\w-]{11}$/.test(pos.videoId) &&
            Number.isFinite(pos.seconds) &&
            pos.seconds >= 0
              ? { videoId: pos.videoId, seconds: pos.seconds }
              : undefined;
          next = choose(next, p.songId, parsedPosition);
        }
      }
      await storage.saveRun(next);
      if (input.sources && typeof input.sources === "object") {
        for (const song of d.songs) {
          const v = input.sources[song.id];
          if (
            v &&
            (!v.primary || /^[\w-]{11}$/.test(v.primary)) &&
            (!v.backup || /^[\w-]{11}$/.test(v.backup))
          ) {
            await storage.saveSource(song.id, v);
          }
        }
        setSources(await storage.sources());
      }
      await refresh();
      setRunId(next.id);
      navigate("game");
      notify("Bracket imported.");
    } catch (e) {
      setError("Could not import: " + (e as Error).message);
    }
  };
  const saveBackup = () => {
    if (run)
      download(
        new Blob(
          [
            JSON.stringify(
              {
                ...run,
                sources: Object.fromEntries(
                  run.definition.songs
                    .filter((s) => sources[s.id])
                    .map((s) => [s.id, sources[s.id]]),
                ),
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        "musicbracket-save.json",
      );
  };
  const shareDefinition = () => {
    if (!run) return;
    if (run.definition.sharedSources) {
      setShare(run.definition);
      return;
    }
    const currentSongs = new Map(c.songs.map((song) => [song.id, song]));
    setShare(
      challengeSnapshot(
        {
          ...run.definition,
          songs: run.definition.songs.map((song) => {
            const current = currentSongs.get(song.id);
            return current
              ? {
                  ...song,
                  youtubeId: current.youtubeId,
                  backupYoutubeId: current.backupYoutubeId,
                }
              : song;
          }),
        },
        sources,
      ),
    );
  };
  const navItems: {
    id: View;
    label: string;
    icon: typeof Plus;
    count?: number;
  }[] = [
    { id: "home", label: "Main menu", icon: House },
    { id: "new", label: "New bracket", icon: Plus },
    {
      id: "active",
      label: "Active runs",
      icon: Play,
      count: activeRuns.length,
    },
    { id: "history", label: "History", icon: History, count: history.length },
    { id: "library", label: "Music library", icon: Library },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];
  const stageLabel =
    run && match
      ? roundTitle(match.round, run.definition.roundSizes.length - 1)
      : "";
  const stageSize = match && run ? run.definition.roundSizes[match.round] : 0;
  return (
    <div
      className={`app ${pinned ? "menu-pinned" : ""} ${docked ? "streaming-docked" : ""}`}
    >
      {drawerOpen && (
        <>
          <button
            className={`menu-scrim ${pinned ? "pinned-scrim" : ""}`}
            aria-label="Close menu"
            onClick={() => setMenu(false)}
          />
          <aside
            id="site-drawer"
            className="drawer"
            aria-label="Site menu"
            inert={
              bracket || Boolean(editing) || showPrompt || Boolean(confirmation)
                ? true
                : undefined
            }
          >
            <div className="drawer-heading">
              <button className="wordmark" onClick={requestHome}>
                {streaming && <AudioLines size={24} aria-hidden="true" />}
                MusicBracket<span>.</span>
              </button>
              {!docked && (
                <>
                  <button
                    className={`icon-button ${settings.pinned ? "selected" : ""}`}
                    onClick={() =>
                      setSettings((s) => ({ ...s, pinned: !s.pinned }))
                    }
                    aria-label={settings.pinned ? "Unpin menu" : "Pin menu"}
                  >
                    <Pin size={17} />
                  </button>
                  <button
                    ref={drawerClose}
                    className="icon-button"
                    aria-label="Close menu"
                    onClick={() => {
                      setMenu(false);
                      setSettings((s) => ({ ...s, pinned: false }));
                    }}
                  >
                    <X size={18} />
                  </button>
                </>
              )}
            </div>
            <nav>
              {run && (
                <button
                  className={view === "game" ? "nav-active" : ""}
                  onClick={() => navigate("game")}
                >
                  <Disc3 size={19} /> Current game
                </button>
              )}
              <button
                disabled={!run}
                onClick={() => {
                  setBracket(true);
                  setMenu(false);
                }}
              >
                <GitBranch size={19} /> Full bracket
              </button>
              <div className="nav-rule" />
              {navItems.map((n) => (
                <button
                  key={n.id}
                  className={view === n.id ? "nav-active" : ""}
                  onClick={() =>
                    n.id === "new"
                      ? requestNew()
                      : n.id === "home"
                        ? requestHome()
                        : navigate(n.id)
                  }
                >
                  <n.icon size={19} />
                  {n.label}
                  {n.count !== undefined && (
                    <span className="nav-count">{n.count}</span>
                  )}
                </button>
              ))}
            </nav>
            {streaming && run && view === "game" && (
              <div className="streaming-shelf">
                <strong>{run.definition.artist.name}</strong>
                <div aria-hidden="true">
                  {run.definition.albums.slice(0, 3).map((album) => (
                    <img key={album.id} src={album.cover} alt="" />
                  ))}
                </div>
              </div>
            )}
            {!streaming && (
              <div className="drawer-bottom">
                <button
                  onClick={() => setSettings((s) => ({ ...s, dark: !s.dark }))}
                >
                  {settings.dark ? <Sun size={18} /> : <Moon size={18} />}{" "}
                  {settings.dark ? "Light listening" : "Dark listening"}
                </button>
              </div>
            )}
          </aside>
        </>
      )}
      <div
        className="app-body"
        inert={
          bracket || Boolean(editing) || showPrompt || Boolean(confirmation)
            ? true
            : undefined
        }
      >
        <button
          type="button"
          className="edge-trigger"
          hidden={drawerOpen}
          aria-label="Open side menu"
          aria-expanded={drawerOpen}
          aria-controls="site-drawer"
          onClick={(event) => openMenu(event.currentTarget)}
        >
          <ChevronRight size={19} aria-hidden="true" />
        </button>
        <header className="masthead">
          <div className="brand-group">
            <button
              className="icon-button"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="site-drawer"
              onClick={(event) =>
                menu
                  ? setMenu(false)
                  : drawerOpen
                    ? drawerClose.current?.focus()
                    : openMenu(event.currentTarget)
              }
            >
              <Menu size={21} />
            </button>
            <button className="wordmark" onClick={requestHome}>
              {streaming && <AudioLines size={24} aria-hidden="true" />}
              MusicBracket<span>.</span>
            </button>
          </div>
          <nav className="header-nav">
            {view !== "home" && (
              <button className="new-bracket-button" onClick={requestNew}>
                <Plus size={16} /> New bracket
              </button>
            )}
            {run && view !== "home" && (
              <button className="full-bracket" onClick={() => setBracket(true)}>
                <GitBranch size={15} /> Full bracket
              </button>
            )}
          </nav>
          <div className="header-end">
            <span className="save-state">
              <CheckCircle2 size={14} /> Saved locally
            </span>
            {!streaming && (
              <button
                className="icon-button theme-switch"
                aria-label={
                  settings.dark ? "Switch to light mode" : "Switch to dark mode"
                }
                onClick={() => setSettings((s) => ({ ...s, dark: !s.dark }))}
              >
                {settings.dark ? <Sun size={19} /> : <Moon size={19} />}
              </button>
            )}
          </div>
        </header>
        <main>
          {location.hostname === "127.0.0.1" && (
            <aside className="local-playback-note">
              <span>
                Open MusicBracket at its named local address for inline video.
                Any saves at this address stay here. You can export a run and
                import it at the new address.
              </span>
              <a
                className="secondary"
                href={`http://musicbracket.localhost:${location.port}/`}
              >
                Open MusicBracket <ArrowRight size={15} />
              </a>
            </aside>
          )}
          {view === "home" && (
            <MainMenu
              albums={c.albums}
              latestRun={activeRuns.reduce<Run | undefined>(
                (latest, item) =>
                  !latest || item.updatedAt > latest.updatedAt ? item : latest,
                undefined,
              )}
              onNew={requestNew}
              onResume={resume}
              onNavigate={navigate}
            />
          )}
          {view === "new" && incoming && (
            <section className="challenge-card">
              <Link2 size={26} aria-hidden="true" />
              <h1>{incoming.options.name || incoming.artist.name}</h1>
              <p>
                {incoming.songs.length} songs · {decisionCount(incoming)} picks
              </p>
              {incoming.artists && (
                <p>{incoming.artists.map((a) => a.name).join(" · ")}</p>
              )}
              <p>Play your friend’s bracket with your own picks.</p>
              {activeRuns.length >= 5 && (
                <p>
                  Five active runs are saved. Finish or delete one to start this
                  replay.
                </p>
              )}
              <div className="inline">
                <button
                  className="primary"
                  disabled={busy || activeRuns.length >= 5}
                  onClick={() => void start(incoming)}
                >
                  Play this bracket <ArrowRight size={16} />
                </button>
                <button className="secondary" onClick={dismissChallenge}>
                  Back to setup
                </button>
              </div>
            </section>
          )}
          {view === "new" && !incoming && (
            <>
              <div className="page-intro">
                <div>
                  <h1>New bracket</h1>
                  <p>Choose the artists and albums you want to hear.</p>
                </div>
                <div className="intro-note">
                  <Disc3 size={32} />
                  <span>
                    {c.artists.length} artists
                    <br />
                    {c.albums.filter((album) => !album.singles).length} albums
                  </span>
                </div>
              </div>
              {!artistChosen ? (
                <section className="artist-step">
                  <div
                    className="bracket-modes"
                    role="group"
                    aria-label="Bracket type"
                  >
                    <button
                      type="button"
                      aria-pressed={!mixed}
                      onClick={() => selectMode(false)}
                    >
                      <Disc3 size={17} aria-hidden="true" /> Single artist
                    </button>
                    <button
                      type="button"
                      aria-pressed={mixed}
                      onClick={() => selectMode(true)}
                    >
                      <Users size={17} aria-hidden="true" /> Mixed artists
                    </button>
                  </div>
                  <div className="artist-picker-heading">
                    <div>
                      <h2>
                        {mixed
                          ? "1. Choose 2–8 artists"
                          : "1. Choose an artist"}
                      </h2>
                      <p>
                        {mixed
                          ? "Build your lineup, then choose albums for each artist."
                          : "Next you’ll choose albums and set the bracket size."}
                      </p>
                    </div>
                    <PickerViewControl
                      name="Artist"
                      view={artistPickerView}
                      onChange={(value) =>
                        setSettings((s) => ({ ...s, artistPickerView: value }))
                      }
                    />
                  </div>
                  <details className="suggested-mixes">
                    <summary>
                      <Shuffle size={16} aria-hidden="true" /> Suggested mixes
                    </summary>
                    <ul>
                      {suggestedMixes.map((mix) => (
                        <li key={mix.name}>
                          <button
                            type="button"
                            onClick={() => openSuggestedMix(mix)}
                          >
                            <span>
                              <strong>{mix.name}</strong>
                              <small>
                                {mix.size} songs · {mix.artists.length} artists
                              </small>
                            </span>
                            <ArrowRight size={16} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <div className="artist-filters">
                    <label className="search-field">
                      <Search size={17} aria-hidden="true" />
                      <input
                        aria-label="Search artists"
                        placeholder="Search artists…"
                        type="search"
                        value={artistQuery}
                        onChange={(event) => setArtistQuery(event.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Artist category"
                      value={artistCategory}
                      onChange={(event) =>
                        setArtistCategory(event.target.value)
                      }
                    >
                      <option value="">All categories</option>
                      {artistCategories.map((group) => (
                        <option key={group.label}>{group.label}</option>
                      ))}
                    </select>
                    <span className="artist-result-count" role="status">
                      {visibleArtists.length}{" "}
                      {visibleArtists.length === 1 ? "artist" : "artists"}
                    </span>
                  </div>
                  {mixed && (
                    <div className="lineup-bar">
                      <div className="lineup-selection">
                        <span role="status">
                          {mixedArtists.length} of 8 selected
                        </span>
                        <button
                          type="button"
                          className="lineup-clear"
                          disabled={mixedArtists.length === 0}
                          onClick={() => setArtistAlbums({}, artist.id)}
                        >
                          Deselect all
                        </button>
                      </div>
                      <button
                        className="primary"
                        disabled={mixedArtists.length < 2}
                        onClick={() => {
                          setOption("artistId", mixedArtists[0].id);
                          setArtistChosen(true);
                        }}
                      >
                        Choose albums <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  <div
                    className={`artist-grid ${artistPickerView === "list" ? "artist-list" : ""}`}
                  >
                    {visibleArtists.map((a) => (
                      <button
                        key={a.id}
                        className="artist-choice"
                        aria-pressed={
                          artistAlbums
                            ? Object.hasOwn(artistAlbums, a.id)
                            : undefined
                        }
                        disabled={
                          artistAlbums &&
                          mixedArtists.length >= 8 &&
                          !Object.hasOwn(artistAlbums, a.id)
                        }
                        onClick={() => chooseArtist(a)}
                      >
                        <span className="artist-portrait" aria-hidden="true">
                          {artistPortraits.has(a.id) ? (
                            <img
                              src={`/artists/${a.id}.webp?v=2`}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <Disc3 size={30} />
                          )}
                        </span>
                        <span className="artist-name">{a.name}</span>
                        <span className="artist-arrow" aria-hidden="true">
                          {mixed ? (
                            Object.hasOwn(artistAlbums, a.id) ? (
                              <>
                                <Check size={15} strokeWidth={3} />
                                <span className="artist-picked-label">
                                  Picked
                                </span>
                              </>
                            ) : (
                              <Plus size={16} />
                            )
                          ) : (
                            <ArrowRight size={16} />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!visibleArtists.length && (
                    <p>
                      No artists match those filters.{" "}
                      <button
                        className="text-button"
                        onClick={() => {
                          setArtistQuery("");
                          setArtistCategory("");
                        }}
                      >
                        Clear filters
                      </button>
                    </p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={15} /> Import a save or challenge
                  </button>
                </section>
              ) : (
                <>
                  <div className="setup-layout">
                    <section className="record-collection">
                      <div className="section-heading">
                        <div>
                          <h2>
                            {mixed
                              ? "2. Choose albums"
                              : "2. Choose albums by " + artist.name}
                          </h2>
                          <p>
                            {mixed
                              ? "Switch artists to edit their selections. Your choices stay checked."
                              : "Everything checked goes into the mix."}
                          </p>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => setArtistChosen(false)}
                        >
                          {mixed ? "Edit lineup" : "Change artist"}
                        </button>
                      </div>
                      {artistAlbums && (
                        <div
                          className="lineup-tabs"
                          role="group"
                          aria-label="Whose releases to show"
                        >
                          {mixedArtists.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              aria-pressed={artist.id === a.id}
                              onClick={() =>
                                setOptions((o) => ({ ...o, artistId: a.id }))
                              }
                            >
                              <span>{a.name}</span>
                              <small>{artistAlbums[a.id].length}</small>
                            </button>
                          ))}
                        </div>
                      )}
                      {singles && (
                        <div className="singles-picker">
                          <label className="singles-picker-toggle">
                            <input
                              type="checkbox"
                              checked={singlesSelected}
                              aria-describedby="setup-singles-tracks"
                              onChange={() =>
                                updateVisibleAlbums(
                                  singlesSelected
                                    ? selectedAlbums.filter(
                                        (id) => id !== singles.id,
                                      )
                                    : [...selectedAlbums, singles.id],
                                )
                              }
                            />
                            <span>Include non-album singles</span>
                          </label>
                          <p id="setup-singles-tracks">
                            {c.songs
                              .filter((song) =>
                                song.albumIds.includes(singles.id),
                              )
                              .sort((a, b) => b.popularity - a.popularity)
                              .map((song) => song.title)
                              .join(" · ")}
                          </p>
                        </div>
                      )}
                      <div className="collection-toolbar">
                        <span>
                          {
                            selectedAlbums.filter((id) =>
                              albums.some((a) => a.id === id),
                            ).length
                          }{" "}
                          of {albums.length} albums selected
                        </span>
                        <div className="collection-actions">
                          <div className="album-selection-actions">
                            <button
                              onClick={() =>
                                updateVisibleAlbums([
                                  ...albums.map((a) => a.id),
                                  ...(singlesSelected && singles
                                    ? [singles.id]
                                    : []),
                                ])
                              }
                            >
                              Select all
                            </button>
                            <span> / </span>
                            <button
                              onClick={() =>
                                updateVisibleAlbums(
                                  singlesSelected && singles
                                    ? [singles.id]
                                    : [],
                                )
                              }
                            >
                              Clear
                            </button>
                          </div>
                          <PickerViewControl
                            name="Album"
                            view={albumPickerView}
                            onChange={(value) =>
                              setSettings((s) => ({
                                ...s,
                                albumPickerView: value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div
                        className={`album-grid ${mixed ? "mixed-albums" : ""} ${albumPickerView === "list" ? "album-list" : ""}`}
                      >
                        {albums.map((a) => (
                          <label
                            key={a.id}
                            className={`album ${selectedAlbums.includes(a.id) ? "album-selected" : ""}`}
                          >
                            <div className="album-cover">
                              <img src={a.cover} alt="" loading="lazy" />
                            </div>
                            <input
                              type="checkbox"
                              checked={selectedAlbums.includes(a.id)}
                              onChange={() =>
                                updateVisibleAlbums(
                                  selectedAlbums.includes(a.id)
                                    ? selectedAlbums.filter((id) => id !== a.id)
                                    : [...selectedAlbums, a.id],
                                )
                              }
                            />
                            <span className="album-check" aria-hidden="true">
                              <Check size={13} />
                            </span>
                            <div className="album-caption">
                              <strong>{a.title}</strong>
                              {a.credit && <span>{a.credit}</span>}
                              <span>
                                {a.year} · {albumSongCounts.get(a.id) ?? 0}{" "}
                                songs
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </section>
                    <aside className="setup-settings">
                      <div className="summary-stamp">
                        <span>{entrants}</span>
                        <div>
                          songs in the mix
                          <br />
                          <small>
                            {mixed
                              ? `${mixedArtists.length} artists`
                              : artist.name}
                          </small>
                        </div>
                      </div>
                      {mixed && (
                        <ul
                          className="lineup-counts"
                          aria-label="Songs entering for each artist"
                        >
                          {mixedArtists.map((a) => (
                            <li key={a.id}>
                              <span>{a.name}</span>
                              <strong>{field?.counts.get(a.id) ?? 0}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="field">
                        <SettingLabel id="setup-name" label="Bracket name">
                          Give this run a name so it’s easy to find in Active
                          runs and History.
                        </SettingLabel>
                        <input
                          id="setup-name"
                          placeholder={`${bracketArtist.name} · My favorites`}
                          value={options.name}
                          onChange={(e) => setOption("name", e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <SettingLabel id="setup-size" label="How many songs?">
                          {mixed
                            ? "Smaller brackets give each artist an even share where possible. Extra slots go to artists with songs left."
                            : "Smaller brackets pick songs using 60% popularity and 40% quality. If fewer songs are available, they all enter."}
                        </SettingLabel>
                        <select
                          id="setup-size"
                          value={options.size}
                          onChange={(e) =>
                            setOption("size", Number(e.target.value))
                          }
                        >
                          <option value={0}>Every selected song</option>
                          {[8, 16, 32, 64, 128].map((n) => (
                            <option key={n} value={n}>
                              {mixed
                                ? `${n} songs · balanced mix`
                                : `Best ${n} songs`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <SettingLabel id="setup-opening" label="Round 1">
                          Choose one winner in each matchup. The game balances
                          the opening groups and runs every later round one on
                          one.
                        </SettingLabel>
                        <select
                          id="setup-opening"
                          value={options.first}
                          onChange={(e) =>
                            setOption("first", Number(e.target.value))
                          }
                        >
                          <option value={2}>1 vs 1</option>
                          <option value={3}>Up to 3 songs</option>
                          <option value={4}>Up to 4 songs</option>
                        </select>
                      </div>
                      <div className="field range-label">
                        <SettingLabel
                          id="setup-shuffle"
                          label="Shuffle character"
                        >
                          Balanced spreads high-scoring songs across the bracket
                          using 60% popularity and 40% quality. Surprising
                          allows more variation.
                        </SettingLabel>
                        <strong>
                          {options.randomness < 25
                            ? "Carefully seeded"
                            : options.randomness < 65
                              ? "A little unexpected"
                              : "Feeling adventurous"}
                        </strong>
                        <input
                          id="setup-shuffle"
                          type="range"
                          min="0"
                          max="100"
                          value={options.randomness}
                          onChange={(e) =>
                            setOption("randomness", +e.target.value)
                          }
                        />
                        <span className="range-ends">
                          <span>Balanced</span>
                          <span>Surprising</span>
                        </span>
                      </div>
                      <div className="check-field">
                        <input
                          id="setup-interludes"
                          type="checkbox"
                          checked={options.includeInterludes}
                          onChange={(e) =>
                            setOption("includeInterludes", e.target.checked)
                          }
                        />
                        <SettingLabel
                          id="setup-interludes"
                          label="Include skits & interludes"
                        >
                          Add spoken skits and interludes from your selected
                          albums to the eligible tracks.
                        </SettingLabel>
                      </div>
                      <div className="check-field">
                        <input
                          id="setup-start-time"
                          type="checkbox"
                          checked={options.startAt40 ?? false}
                          onChange={(event) =>
                            setOption("startAt40", event.target.checked)
                          }
                        />
                        <SettingLabel
                          id="setup-start-time"
                          label="Start songs at 40 seconds"
                        >
                          Start playback 40 seconds into each song when the
                          video is long enough.
                        </SettingLabel>
                      </div>
                      <div className="route-preview">
                        {canStart ? (
                          <>
                            <span>
                              {[entrants, ...stages.map((s) => s.length)].join(
                                " → ",
                              )}
                            </span>
                            <small>
                              {stages.reduce(
                                (n, s) => n + s.filter((k) => k > 1).length,
                                0,
                              )}{" "}
                              picks to find your winner
                            </small>
                          </>
                        ) : (
                          <small>
                            {mixed
                              ? "Choose enough albums for every artist to have a song in the mix."
                              : "Select at least two songs."}
                          </small>
                        )}
                      </div>
                      <button
                        className="secondary wide"
                        disabled={!canStart}
                        onClick={newPreview}
                      >
                        <Shuffle size={16} /> Preview & shuffle
                      </button>
                      <button
                        className="primary wide start-button"
                        disabled={!canStart || busy || activeRuns.length >= 5}
                        onClick={() => void start()}
                      >
                        Let’s listen <ArrowRight size={17} />
                      </button>
                      {activeRuns.length >= 5 && (
                        <p className="field-note">
                          Five active runs are saved. Finish or delete one
                          first.
                        </p>
                      )}
                      <button
                        className="text-button import-button"
                        onClick={() => fileInput.current?.click()}
                      >
                        <Upload size={14} /> Import a save or challenge
                      </button>
                    </aside>
                  </div>
                  {preview && (
                    <section className="preview-section">
                      <div className="section-heading">
                        <div>
                          <h2>A look at the opening round</h2>
                          <p>
                            {preview.songs.length} songs ·{" "}
                            {decisionCount(preview)} choices · Shuffle until it
                            feels right.
                          </p>
                        </div>
                        <button className="secondary" onClick={newPreview}>
                          <Shuffle size={16} /> Shuffle again
                        </button>
                      </div>
                      <div className="preview-grid">
                        {preview.matches
                          .filter((m) => m.round === 0)
                          .map((m, i) => (
                            <div className="preview-group" key={m.id}>
                              <small>
                                Match {i + 1}
                                {m.slots.length === 1 ? " · bye" : ""}
                              </small>
                              {m.slots.map((slot) => {
                                const s = preview.songs.find(
                                  (s) =>
                                    "songId" in slot && s.id === slot.songId,
                                )!;
                                return (
                                  <div key={s.id}>
                                    <Cover song={s} albums={c.albums} />
                                    <span>{s.title}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {view === "game" && run && (
            <>
              {match ? (
                <>
                  <div className="game-status">
                    <button
                      className="text-button"
                      onClick={() => setBracket(true)}
                    >
                      <ArrowLeft size={14} /> {run.definition.artist.name}
                    </button>
                    <span>
                      Match {run.picks.length + 1} of{" "}
                      {decisionCount(run.definition)}
                    </span>
                    <div className="round-dots">
                      {run.definition.roundSizes.slice(1).map((_, i) => (
                        <span
                          className={
                            i === match.round
                              ? "current"
                              : i < match.round
                                ? "done"
                                : ""
                          }
                          key={i}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="round-announcement" role="status">
                    <div
                      className="round-heading"
                      key={`${run.id}:${match.round}`}
                    >
                      <h1>{stageLabel}</h1>
                      {stageSize > 2 && <span>Top {stageSize}</span>}
                      {stageSize === 2 && <span>One last matchup</span>}
                    </div>
                  </div>
                  <div
                    className={`matchup-grid players-${match.slots.length}`}
                    key={match.id}
                  >
                    {matchSongs(run, match).map((song, i) => (
                      <section
                        key={song.id}
                        className={`song-panel ${activeSong === song.id ? "is-playing" : ""}`}
                        onMouseEnter={() => {
                          if (activeSong && settings.hover && !playbackLock) {
                            if (hoverTimer.current)
                              clearTimeout(hoverTimer.current);
                            hoverTimer.current = setTimeout(
                              () => activate(song.id),
                              settings.delay,
                            );
                          }
                        }}
                        onMouseLeave={() => {
                          if (hoverTimer.current)
                            clearTimeout(hoverTimer.current);
                        }}
                      >
                        <div className="song-title-row">
                          <Cover song={song} albums={run.definition.albums} />
                          <div>
                            <h2 title={song.title}>{song.title}</h2>
                            {run.definition.artists && (
                              <div className="song-artist">
                                {songArtist(run.definition, song)}
                              </div>
                            )}
                            <span className="album-tag">
                              {
                                run.definition.albums.find(
                                  (a) => a.id === song.albumId,
                                )?.title
                              }
                            </span>
                          </div>
                        </div>
                        <div className="player-wrap">
                          <SongPlayer
                            ref={(controls) => {
                              if (controls)
                                playback.current.set(song.id, controls);
                              else playback.current.delete(song.id);
                            }}
                            resumePosition={
                              settings.resumeSongs
                                ? savedPositions.get(song.id)
                                : undefined
                            }
                            artistName={songArtist(run.definition, song)}
                            song={
                              run.definition.sharedSources
                                ? song
                                : c.songs.find(
                                    (entry) => entry.id === song.id,
                                  ) || song
                            }
                            source={{
                              ...((run.definition.sharedSources ?? sources)[
                                song.id
                              ] || {}),
                              ...(run.definition.options.startAt40
                                ? {
                                    start:
                                      song.duration && song.duration <= 40
                                        ? 0
                                        : 40,
                                  }
                                : {}),
                            }}
                            active={activeSong === song.id}
                            volume={settings.volume}
                            onActivate={() => activate(song.id)}
                            onEdit={() => setEditing(song)}
                          />
                        </div>
                        <button
                          className="choose-button"
                          aria-label={`Choose ${song.title}`}
                          disabled={busy}
                          onClick={() => void vote(song.id)}
                        >
                          Choose
                          <span>{i + 1}</span>
                        </button>
                      </section>
                    ))}
                  </div>
                  <p className="mobile-matchup-hint">
                    Swipe across to see the other song.
                  </p>
                  <div className="listening-toolbar">
                    <button
                      className="text-button"
                      disabled={!run.picks.length || busy}
                      onClick={() => void undoPick()}
                    >
                      <Undo2 size={16} /> Undo last pick
                    </button>
                    <div className="listening-hint">
                      <span className="live-dot" />
                      {activeSong && settings.hover
                        ? "Hover another song to switch. Leaving keeps it playing."
                        : "Click play on a song to start listening."}
                    </div>
                    <button
                      className={`text-button ${playbackLock ? "accent-text" : ""}`}
                      onClick={() => setPlaybackLock(!playbackLock)}
                    >
                      {playbackLock ? <Lock size={15} /> : <Unlock size={15} />}{" "}
                      {playbackLock ? "Playback locked" : "Lock playback"}
                    </button>
                  </div>
                  <div className="game-footer">
                    <span>
                      <Check size={14} /> Every pick saved automatically
                    </span>
                    <label>
                      <Volume2 size={16} />
                      <span className="sr-only">Volume</span>
                      <input
                        aria-label="Volume"
                        type="range"
                        value={settings.volume}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            volume: +e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button className="text-button" onClick={saveBackup}>
                      <Download size={14} /> Save backup
                    </button>
                  </div>
                </>
              ) : (
                <div className="completed">
                  <Trophy size={40} />
                  <span className="completion-label">Your winner</span>
                  <h1>
                    {
                      run.definition.songs.find(
                        (s) =>
                          s.id ===
                          outcomes(run)[run.definition.matches.at(-1)!.id],
                      )?.title
                    }
                  </h1>
                  <p>
                    {run.definition.artist.name} · {run.definition.songs.length}{" "}
                    songs · {run.picks.length} decisions
                  </p>
                  <div className="winner-art">
                    {(() => {
                      const winner = run.definition.songs.find(
                        (s) =>
                          s.id ===
                          outcomes(run)[run.definition.matches.at(-1)!.id],
                      );
                      return winner ? (
                        <Cover song={winner} albums={run.definition.albums} />
                      ) : null;
                    })()}
                  </div>
                  <p>You followed your ears. Here’s where they took you.</p>
                  <div className="inline centered">
                    <button
                      className="primary"
                      onClick={() => navigate("history")}
                    >
                      View History <ArrowRight size={17} />
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setBracket(true)}
                    >
                      View full bracket
                    </button>
                    <button className="secondary" onClick={shareDefinition}>
                      <Link2 size={15} /> Share bracket
                    </button>
                  </div>
                  <div className="result-downloads">
                    <select
                      aria-label="Snapshot size"
                      value={snapshotSize}
                      onChange={(e) => setSnapshotSize(+e.target.value)}
                    >
                      <option value={8}>Final 8 snapshot</option>
                      <option value={16}>Final 16 snapshot</option>
                      <option value={32}>Final 32 snapshot</option>
                    </select>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          setBusy(true);
                          download(
                            await exportBracket(
                              run,
                              "top",
                              exportTheme,
                              snapshotSize,
                            ),
                            `final-${snapshotSize}.png`,
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Download size={15} /> Download snapshot
                    </button>
                  </div>
                  <small>
                    {history.some((item) => item.id === run.id)
                      ? "Full bracket and Final 16 saved to History."
                      : archiveFailures.includes(run.id)
                        ? "Your result is safe. Retry saving its images from History."
                        : "Saving your result images to History…"}
                  </small>
                  <button className="text-button" onClick={requestHome}>
                    <ArrowLeft size={14} /> Back to main menu
                  </button>
                </div>
              )}
            </>
          )}
          {view === "game" && !run && (
            <Empty
              title="Your next favorite is waiting."
              text="Choose a few records and start a listening tournament."
              action="Make a bracket"
              onAction={() => navigate("new")}
            />
          )}
          {view === "active" && (
            <>
              <PageTitle
                title="Still in the mix."
                text={`${activeRuns.length} of 5 active runs. Pick up exactly where you left off.`}
              />
              <div className="run-list">
                {activeRuns.map((r) => (
                  <article className="run-row" key={r.id}>
                    <div className="record-stack">
                      {r.definition.albums.slice(0, 3).map((a) => (
                        <img key={a.id} src={a.cover} alt="" />
                      ))}
                    </div>
                    <div>
                      <h2>
                        {r.definition.options.name || r.definition.artist.name}
                      </h2>
                      <p>
                        {r.definition.songs.length} songs · {r.picks.length}/
                        {decisionCount(r.definition)} picks ·{" "}
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </p>
                      <progress
                        value={r.picks.length}
                        max={decisionCount(r.definition)}
                      />
                    </div>
                    <button className="primary" onClick={() => resume(r)}>
                      Resume <ArrowRight size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${r.definition.artist.name} run`}
                      onClick={() => {
                        if (
                          confirm(
                            "Delete this active run? This cannot be undone.",
                          )
                        )
                          storage
                            .deleteRun(r.id)
                            .then(refresh)
                            .catch((e) => setError(e.message));
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))}
              </div>
              {!activeRuns.length && (
                <Empty
                  title="Nothing left on pause."
                  text="Your active brackets will be kept here."
                  action="Start a bracket"
                  onAction={() => navigate("new")}
                />
              )}
              <button
                className="secondary"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={16} /> Import save or challenge
              </button>
            </>
          )}
          {view === "history" && (
            <>
              <PageTitle
                title="The ones that stayed."
                text="Your completed brackets, kept as pictures. A little record of your taste."
              />
              {runs
                .filter((r) => archiveFailures.includes(r.id))
                .map((r) => (
                  <button
                    className="secondary"
                    key={r.id}
                    onClick={() => void archive(r)}
                  >
                    Retry saving{" "}
                    {r.definition.options.name || r.definition.artist.name}
                  </button>
                ))}
              <div className="history-grid">
                {history.map((h) => (
                  <HistoryCard
                    key={h.id}
                    entry={h}
                    onDelete={() => {
                      if (confirm("Delete these result images?"))
                        storage
                          .deleteHistory(h.id)
                          .then(refresh)
                          .catch((e) => setError(e.message));
                    }}
                  />
                ))}
              </div>
              {!history.length && (
                <Empty
                  title="Your wall of favorites starts here."
                  text="Finish a bracket to save its complete tree and Final 16 snapshot."
                  action="Start listening"
                  onAction={() => navigate("new")}
                />
              )}
            </>
          )}
          {view === "library" && (
            <>
              <PageTitle
                title="The record collection."
                text={
                  librarySelection
                    ? `${librarySelection.name} · ${libraryAlbumCount} ${libraryAlbumCount === 1 ? "album" : "albums"} · ${libraryTracks.length} ${libraryTracks.length === 1 ? "track" : "tracks"}`
                    : `${c.artists.length} artists · ${libraryAlbumCount} albums · ${libraryTracks.length} tracks`
                }
              />
              <div className="library-tools">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    placeholder="Find a song or album…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter library by artist"
                  value={libraryArtist}
                  onChange={(e) => setLibraryArtist(e.target.value)}
                >
                  <option value="all">All artists</option>
                  {sortedArtists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  onClick={() => catalogInput.current?.click()}
                >
                  <Upload size={15} /> Import catalog
                </button>
              </div>
              <p className="data-note">
                Quality and popularity are initial estimates unless a source is
                stated. Edit a song’s video to choose your preferred recording.
                Catalog imports can add artists and albums.
              </p>
              <div className="library-table">
                <div className="library-table-head">
                  <span>Song / album</span>
                  <span>Quality</span>
                  <span>Popularity</span>
                  <span>Video</span>
                </div>
                {libraryTracks
                  .filter((s) =>
                    (
                      s.title +
                      " " +
                      c.albums.find((a) => a.id === s.albumId)?.title
                    )
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .slice(0, 250)
                  .map((s) => (
                    <button
                      className="library-row"
                      key={s.id}
                      onClick={() => setEditing(s)}
                    >
                      <div>
                        <Cover song={s} albums={c.albums} />
                        <span>
                          <strong>{s.title}</strong>
                          <small>
                            {c.albums.find((a) => a.id === s.albumId)?.title}
                            {s.kind !== "song" ? ` · ${s.kind}` : ""}
                          </small>
                        </span>
                      </div>
                      <span title={s.scoreSource}>{Math.round(s.quality)}</span>
                      <span title={s.scoreSource}>
                        {Math.round(s.popularity)}
                      </span>
                      <span>
                        {sources[s.id]?.primary || s.youtubeId
                          ? "Linked"
                          : "Add link"}{" "}
                        <ArrowRight size={13} />
                      </span>
                    </button>
                  ))}
              </div>
              <p className="field-note">
                Showing up to 250 matches. Search or filter to narrow the
                collection.
              </p>
            </>
          )}
          {view === "settings" && (
            <>
              <PageTitle
                title="Make yourself comfortable."
                text="A few small things for a better listening session."
              />
              <div className="preferences">
                <label className="preference">
                  <span>
                    <strong>Display size</strong>
                    <small>
                      Automatic enlarges the interface on wide, high-resolution
                      displays.
                    </small>
                  </span>
                  <select
                    value={settings.displayScale ?? "auto"}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        displayScale: e.target
                          .value as Settings["displayScale"],
                      }))
                    }
                  >
                    <option value="auto">Automatic</option>
                    <option value="standard">Standard</option>
                    <option value="large">Large · 1440p</option>
                  </select>
                </label>
                <label className="preference">
                  <span>
                    <strong>Resume songs in later rounds</strong>
                    <small>
                      Continue from where you chose the song in its previous
                      matchup.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.resumeSongs ?? false}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        resumeSongs: e.target.checked,
                      }))
                    }
                  />
                </label>
                <label className="preference">
                  <span>
                    <strong>Theme</strong>
                    <small>
                      Choose Soul Paper or the dark, lime-accented Streaming
                      Club.
                    </small>
                  </span>
                  <select
                    value={streaming ? "streaming" : "soul"}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        appearance:
                          e.target.value === "streaming" ? "streaming" : "soul",
                      }))
                    }
                  >
                    <option value="soul">Soul Paper</option>
                    <option value="streaming">Streaming Club</option>
                  </select>
                </label>
                {!streaming && (
                  <label className="preference">
                    <span>
                      <strong>Dark listening</strong>
                      <small>Dark gray surfaces and softer light text.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.dark}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, dark: e.target.checked }))
                      }
                    />
                  </label>
                )}
                <label className="preference">
                  <span>
                    <strong>Hover to listen</strong>
                    <small>Switch only when you hover a different song.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.hover}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, hover: e.target.checked }))
                    }
                  />
                </label>
                <label className="preference">
                  <span>
                    <strong>Hover delay</strong>
                    <small>Prevent switches while passing across a song.</small>
                  </span>
                  <select
                    value={settings.delay}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, delay: +e.target.value }))
                    }
                  >
                    <option value={120}>Quick · 120 ms</option>
                    <option value={220}>Balanced · 220 ms</option>
                    <option value={400}>Relaxed · 400 ms</option>
                  </select>
                </label>
                <label className="preference">
                  <span>
                    <strong>Keep the menu open</strong>
                    <small>
                      {streaming
                        ? "Keep navigation open on smaller screens."
                        : "Pin navigation beside your listening space."}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.pinned}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, pinned: e.target.checked }))
                    }
                  />
                </label>
                <div className="preference">
                  <span>
                    <strong>Shared volume</strong>
                    <small>
                      YouTube controls the audio stream. Measured loudness
                      normalization is unavailable.
                    </small>
                  </span>
                  <input
                    aria-label="Shared volume"
                    type="range"
                    value={settings.volume}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, volume: +e.target.value }))
                    }
                  />
                </div>
                <div className="preferences-note">
                  <h2>Yours, on this browser.</h2>
                  <p>
                    Active runs and result images are saved in your browser’s
                    database. Clearing site data removes them. Download backups
                    of active runs and result images you want to keep.
                  </p>
                  <p>
                    Share a bracket from the Full bracket view. The link opens a
                    fresh replay with the same opening matchups.
                  </p>
                  <div className="inline">
                    <button
                      className="secondary"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Upload size={15} /> Import backup
                    </button>
                    {run && (
                      <button className="secondary" onClick={saveBackup}>
                        <Download size={15} /> Export current run
                      </button>
                    )}
                  </div>
                </div>
                <section
                  className="settings-danger"
                  aria-labelledby="settings-danger-title"
                >
                  <h2 id="settings-danger-title">
                    <TriangleAlert size={22} aria-hidden="true" /> Reset and
                    delete
                  </h2>
                  {Object.entries(settingsActions).map(([action, item]) => (
                    <div className="settings-danger-row" key={action}>
                      <p>{item.summary}</p>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={settingsActionBusy}
                        onClick={() => {
                          setSettingsActionError("");
                          setSettingsAction(
                            action as keyof typeof settingsActions,
                          );
                        }}
                      >
                        {action === "wipe" ? (
                          <Trash2 size={15} aria-hidden="true" />
                        ) : (
                          <TriangleAlert size={15} aria-hidden="true" />
                        )}
                        {item.label}
                      </button>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
        </main>
        <footer className="site-footer">
          <span className="footer-brand">MusicBracket.</span>
          <button onClick={() => navigate("settings")}>
            Local saves · Your own pace
          </button>
        </footer>
      </div>
      {confirmation && (
        <div className="dialog-backdrop">
          <section
            className="source-dialog settings-confirmation"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="settings-confirmation-title"
            aria-describedby="settings-confirmation-detail"
          >
            <TriangleAlert size={29} aria-hidden="true" />
            <h2 id="settings-confirmation-title">{confirmation.title}</h2>
            <p id="settings-confirmation-detail">{confirmation.detail}</p>
            {settingsActionError && (
              <p role="alert" className="settings-action-error">
                {settingsActionError}
              </p>
            )}
            <div className="inline">
              <button
                className="secondary"
                type="button"
                disabled={settingsActionBusy}
                onClick={() => setSettingsAction(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button danger-button-confirm"
                type="button"
                disabled={settingsActionBusy}
                onClick={() => void confirmSettingsAction()}
              >
                {settingsActionBusy ? "Applying…" : confirmation.label}
              </button>
            </div>
          </section>
        </div>
      )}
      {showPrompt && (
        <div className="dialog-backdrop">
          <section
            className={`source-dialog bracket-prompt ${confirmHome ? "home-prompt" : "run-prompt"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bracket-prompt-title"
          >
            {confirmHome ? <House size={27} /> : <Plus size={27} />}
            <h2 id="bracket-prompt-title">
              {confirmHome
                ? "Return to the main menu?"
                : "Start a new bracket?"}
            </h2>
            <p>
              {confirmHome
                ? view === "game" && match
                  ? "Your bracket is saved. You can pick up where you left off from Active runs."
                  : "You’ll leave this screen and go back to the main menu."
                : "Your current bracket is saved. You can resume it from Active runs."}
            </p>
            <div className="inline centered">
              {(confirmHome || confirmNew) && (
                <button className="secondary" onClick={dismissPrompt}>
                  {confirmHome && (view !== "game" || !match)
                    ? "Stay here"
                    : "Keep playing"}
                </button>
              )}
              <button
                className="primary"
                onClick={() => {
                  dismissPrompt();
                  if (confirmHome) navigate("home");
                  else if (confirmNew) navigate("new");
                }}
              >
                {confirmHome ? "Back to menu" : "Start new bracket"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
      {bracket && run && !confirmHome && (
        <div className="dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Full bracket"
            className="bracket-dialog"
          >
            <div className="dialog-header">
              <div>
                <h2>The whole journey.</h2>
                <p>
                  {run.definition.artist.name} · {run.picks.length} of{" "}
                  {decisionCount(run.definition)} decisions made
                </p>
              </div>
              <div className="inline">
                <button className="secondary" onClick={shareDefinition}>
                  <Link2 size={15} /> Share bracket
                </button>
                <button
                  className="icon-button"
                  aria-label="Close full bracket"
                  onClick={() => setBracket(false)}
                >
                  <X size={23} />
                </button>
              </div>
            </div>
            <p className="field-note">
              Highlighted: your current matchup. Lines progress from left to
              right. Later opponents follow your picks.
            </p>
            <BracketTree run={run} />
            <div className="bracket-bottom">
              <span>
                <span className="live-dot" /> Current matchup
              </span>
              <span>
                <Check size={13} /> Chosen winner
              </span>
              <button className="text-button" onClick={saveBackup}>
                <Download size={14} /> Save backup
              </button>
            </div>
          </section>
        </div>
      )}
      {share && !confirmHome && (
        <ShareDialog definition={share} onClose={() => setShare(null)} />
      )}
      {editing && !confirmHome && (
        <SourceEditor
          song={editing}
          source={sources[editing.id] || {}}
          onClose={() => setEditing(null)}
          onSave={async (value, quality, popularity) => {
            try {
              await storage.saveSource(editing.id, value);
              setSources((s) => ({ ...s, [editing.id]: value }));
              if (
                quality !== editing.quality ||
                popularity !== editing.popularity
              ) {
                const next = {
                  ...c,
                  songs: c.songs.map((s) =>
                    s.id === editing.id
                      ? {
                          ...s,
                          quality,
                          popularity,
                          scoreSource: "Personal override",
                        }
                      : s,
                  ),
                };
                localStorage.setItem(
                  "musicbracket.catalog",
                  JSON.stringify(next),
                );
                setCatalog(next);
              }
              setEditing(null);
              notify(
                "Song details saved. Existing brackets keep their original scores.",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      {error && (
        <div className="toast error-toast" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}
      <input
        type="file"
        accept=".json"
        hidden
        ref={fileInput}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        accept=".json"
        hidden
        ref={catalogInput}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const data = JSON.parse(await f.text());
            if (
              !Array.isArray(data.artists) ||
              !Array.isArray(data.albums) ||
              !Array.isArray(data.songs) ||
              !data.artists.length
            )
              throw Error("Expected artists, albums and songs arrays.");
            const merged = {
              ...c,
              artists: [
                ...new Map(
                  [...c.artists, ...data.artists].map((a) => [a.id, a]),
                ).values(),
              ],
              albums: [
                ...new Map(
                  [...c.albums, ...data.albums].map((a) => [a.id, a]),
                ).values(),
              ],
              songs: [
                ...new Map(
                  [...c.songs, ...data.songs].map((a) => [a.id, a]),
                ).values(),
              ],
            };
            localStorage.setItem(
              "musicbracket.catalog",
              JSON.stringify(merged),
            );
            setCatalog(merged);
            notify("Catalog merged into your collection.");
          } catch (err) {
            setError((err as Error).message);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
type PickerView = "grid" | "list";
function PickerViewControl({
  name,
  view,
  onChange,
}: {
  name: "Artist" | "Album";
  view: PickerView;
  onChange: (view: PickerView) => void;
}) {
  return (
    <div className="picker-view" role="group" aria-label={`${name} view`}>
      <button
        type="button"
        aria-label={`${name} grid view`}
        title="Grid view"
        aria-pressed={view === "grid"}
        onClick={() => onChange("grid")}
      >
        <LayoutGrid size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`${name} list view`}
        title="List view"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
      >
        <List size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
function SettingLabel({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: string;
}) {
  const tooltipId = useId();
  const [showHelp, setShowHelp] = useState(false);
  return (
    <span className="setting-label">
      <label htmlFor={id}>{label}</label>
      <span
        className="setting-help"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setShowHelp(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setShowHelp(false);
        }}
      >
        <button
          type="button"
          aria-label={`About ${label}`}
          aria-describedby={tooltipId}
          onFocus={() => setShowHelp(true)}
          onBlur={() => setShowHelp(false)}
          onClick={() => setShowHelp(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setShowHelp(false);
          }}
        >
          <Info size={15} aria-hidden="true" />
        </button>
        <span role="tooltip" id={tooltipId} hidden={!showHelp}>
          {children}
        </span>
      </span>
    </span>
  );
}
const featuredSleeves = [
  "fleetwood-mac-rumours",
  "outkast-stankonia",
  "olivia-rodrigo-sour",
  "daft-punk-discovery",
];
const mainMenuLinks = [
  { view: "active", label: "Active runs", icon: Play },
  { view: "history", label: "History", icon: History },
  { view: "library", label: "Music library", icon: Library },
  { view: "settings", label: "Settings", icon: SettingsIcon },
] as const;
function MainMenu({
  albums,
  latestRun,
  onNew,
  onResume,
  onNavigate,
}: {
  albums: Album[];
  latestRun?: Run;
  onNew: () => void;
  onResume: (run: Run) => void;
  onNavigate: (view: View) => void;
}) {
  const sleeves = featuredSleeves.flatMap(
    (id) => albums.find((album) => album.id === id) ?? [],
  );
  return (
    <div className="main-menu">
      <section className="menu-feature" aria-labelledby="menu-title">
        <div className="menu-feature-copy">
          <h1 id="menu-title">Follow your ears.</h1>
          <p>
            Pick an artist or mix a few. Play songs head to head until one wins.
          </p>
          <button className="primary menu-start" onClick={onNew}>
            Start a bracket <ArrowRight size={19} />
          </button>
          {latestRun && (
            <button
              className="menu-resume"
              title={
                latestRun.definition.options.name ||
                latestRun.definition.artist.name
              }
              onClick={() => onResume(latestRun)}
            >
              <Play size={14} />
              <span>
                Resume{" "}
                {latestRun.definition.options.name ||
                  latestRun.definition.artist.name}
              </span>
            </button>
          )}
        </div>
        {sleeves.length === featuredSleeves.length && (
          <div className="menu-sleeves" aria-hidden="true">
            {sleeves.map((album) => (
              <img
                key={album.id}
                src={album.cover}
                alt=""
                width={180}
                height={180}
              />
            ))}
          </div>
        )}
      </section>
      <nav className="menu-index" aria-label="Main menu">
        {mainMenuLinks.map(({ view, label, icon: Icon }) => (
          <button key={view} onClick={() => onNavigate(view)}>
            <Icon size={19} aria-hidden="true" />
            <span>{label}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        ))}
      </nav>
    </div>
  );
}
function ShareDialog({
  definition,
  onClose,
}: {
  definition: Definition;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useDialogFocus(true, ".share-dialog", onClose);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setMessage("");
    createChallengeLink(definition, window.location.href).then(
      (value) => {
        if (!cancelled) setUrl(value);
      },
      (error) => {
        if (!cancelled) {
          setMessage(error.message);
          setFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [definition, attempt]);
  const local = /^(localhost|127(?:\.\d+){3}|\[::1\])$|\.localhost$/i.test(
    window.location.hostname,
  );
  return (
    <div className="dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-heading"
        className="bracket-prompt share-dialog"
      >
        <div className="share-heading">
          <h2 id="share-heading">Share this bracket</h2>
          <button
            className="icon-button"
            aria-label="Close share dialog"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <p>
          Your friend gets the same matchups and starts with their own picks.
        </p>
        {local && (
          <p className="field-note">
            This address opens on this device. Use the hosted site to send a
            link to a friend.
          </p>
        )}
        {url && (
          <label className="field">
            Bracket link
            <input
              ref={input}
              value={url}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        )}
        {!url && !failed && (
          <p role="status" className="field-note">
            Creating your bracket link…
          </p>
        )}
        <div className="inline">
          {failed && (
            <button
              className="secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          )}
          <button
            className="primary"
            disabled={!url}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMessage("Link copied.");
              } catch {
                input.current?.focus();
                input.current?.select();
                setMessage("The link is selected. Copy it to share.");
              }
            }}
          >
            <Link2 size={16} /> Copy link
          </button>
        </div>
        {message && (
          <p role="status" className="field-note">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
function Cover({ song, albums }: { song: Song; albums: Album[] }) {
  const album =
    albums.find((a) => a.id === song.albumId) ||
    albums.find((a) => song.albumIds.includes(a.id));
  return (
    <img
      className="cover-thumb"
      src={album?.cover || "/record.svg"}
      alt=""
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = "/record.svg";
      }}
    />
  );
}
function PageTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="page-intro compact">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <Disc3 size={40} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={onAction}>
        {action}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function HistoryCard({
  entry,
  onDelete,
}: {
  entry: HistoryEntry;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState(""),
    [top, setTop] = useState(true);
  useEffect(() => {
    const src = URL.createObjectURL(top ? entry.top : entry.full);
    setUrl(src);
    return () => URL.revokeObjectURL(src);
  }, [entry, top]);
  return (
    <article className="history-card">
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt={`${entry.name} ${top ? "Final 16" : "full bracket"} result`}
        />
      </a>
      <div className="history-description">
        <div>
          <h2>{entry.winner}</h2>
          <p>
            {entry.name} · {new Date(entry.completedAt).toLocaleDateString()}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Delete result"
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="history-actions">
        <button className="text-button" onClick={() => setTop(!top)}>
          {top ? "View full bracket" : "View Final 16"}
        </button>
        <button
          className="text-button"
          onClick={() =>
            download(
              top ? entry.top : entry.full,
              `${entry.artist}-${top ? "final-16" : "full-bracket"}.png`,
            )
          }
        >
          <Download size={14} /> Download PNG
        </button>
      </div>
    </article>
  );
}
function BracketTree({ run }: { run: Run }) {
  const won = outcomes(run),
    current = currentMatch(run);
  const [zoom, setZoom] = useState(1);
  const tree = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  useLayoutEffect(() => {
    const el = tree.current;
    if (!el) return;
    const redraw = () => {
      const root = el.getBoundingClientRect();
      const result: string[] = [];
      for (const node of el.querySelectorAll<HTMLElement>("[data-from]")) {
        const from = node.dataset.from;
        const source = [
          ...el.querySelectorAll<HTMLElement>("[data-match]"),
        ].find((n) => n.dataset.match === from);
        if (!source) continue;
        const a = source.getBoundingClientRect(),
          b = node.getBoundingClientRect();
        const x1 = (a.right - root.left) / zoom,
          y1 = (a.top + a.height / 2 - root.top) / zoom,
          x2 = (b.left - root.left) / zoom,
          y2 = (b.top + b.height / 2 - root.top) / zoom;
        result.push(
          "M " +
            x1 +
            " " +
            y1 +
            " H " +
            (x1 + x2) / 2 +
            " V " +
            y2 +
            " H " +
            x2,
        );
      }
      setPaths(result);
    };
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [run, zoom]);
  const rounds = [...new Set(run.definition.matches.map((m) => m.round))];
  return (
    <>
      <label className="zoom-control">
        Zoom{" "}
        <input
          type="range"
          min="40"
          max="120"
          value={zoom * 100}
          onChange={(e) => setZoom(+e.target.value / 100)}
        />
        <span>{Math.round(zoom * 100)}%</span>
      </label>
      <div className="bracket-scroll">
        <div className="bracket-tree" ref={tree} style={{ zoom }}>
          <svg
            className="tree-connectors"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--line)"
                strokeWidth="1"
              />
            ))}
          </svg>
          {rounds.map((r) => (
            <div className="bracket-round" key={r}>
              <h3>{roundTitle(r, rounds.length)}</h3>
              <div className="round-matches">
                {run.definition.matches
                  .filter((m) => m.round === r)
                  .map((m) => (
                    <div
                      className={`tree-match ${current?.id === m.id ? "tree-current" : ""} ${won[m.id] ? "tree-complete" : ""}`}
                      key={m.id}
                      data-match={m.id}
                    >
                      <small>
                        {m.slots.length === 1
                          ? "Bye"
                          : `${m.slots.length} songs`}
                        {current?.id === m.id ? " · You are here" : ""}
                      </small>
                      {m.slots.map((slot, i) => {
                        const id =
                          "songId" in slot ? slot.songId : won[slot.matchId];
                        const song = run.definition.songs.find(
                          (s) => s.id === id,
                        );
                        return (
                          <div
                            key={i}
                            data-from={
                              "matchId" in slot ? slot.matchId : undefined
                            }
                            className={
                              won[m.id] === id && id ? "tree-winner" : ""
                            }
                          >
                            {song ? (
                              <>
                                <Cover
                                  song={song}
                                  albums={run.definition.albums}
                                />
                                <span>
                                  {song.title}
                                  {run.definition.artists && (
                                    <small className="tree-artist">
                                      {songArtist(run.definition, song)}
                                    </small>
                                  )}
                                </span>
                                {won[m.id] === id && <Check size={13} />}
                              </>
                            ) : (
                              <span className="tbd">
                                Winner of{" "}
                                {("matchId" in slot ? slot.matchId : "")
                                  .replace("r", "round ")
                                  .replace("-m", ", match ")}{" "}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
function SourceEditor({
  song,
  source,
  onClose,
  onSave,
}: {
  song: Song;
  source: SourceOverride;
  onClose: () => void;
  onSave: (
    value: SourceOverride,
    quality: number,
    popularity: number,
  ) => Promise<void>;
}) {
  const [primary, setPrimary] = useState(
      source.primary || song.youtubeId || "",
    ),
    [backup, setBackup] = useState(source.backup || song.backupYoutubeId || ""),
    [start, setStart] = useState(source.start || 0),
    [quality, setQuality] = useState(song.quality),
    [popularity, setPopularity] = useState(song.popularity),
    [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("input")?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>("button,input");
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        className="source-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${song.title}`}
        ref={ref}
      >
        <div className="dialog-header">
          <h2>{song.title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close song details"
          >
            <X size={22} />
          </button>
        </div>
        <p>One preferred recording. One backup, if you need it.</p>
        <label className="field">
          YouTube link or video ID
          <input
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </label>
        <label className="field">
          Backup video <small>optional</small>
          <input
            value={backup}
            onChange={(e) => setBackup(e.target.value)}
            placeholder="Only used if the primary fails"
          />
        </label>
        <label className="field">
          Preview starts at (seconds)
          <input
            type="number"
            min="0"
            max="36000"
            value={start}
            onChange={(e) => setStart(Math.max(0, +e.target.value))}
          />
        </label>
        <div className="fields-pair">
          <label className="field">
            Quality / 100
            <input
              type="number"
              min="0"
              max="100"
              value={quality}
              onChange={(e) =>
                setQuality(Math.min(100, Math.max(0, +e.target.value)))
              }
            />
          </label>
          <label className="field">
            Popularity / 100
            <input
              type="number"
              min="0"
              max="100"
              value={popularity}
              onChange={(e) =>
                setPopularity(Math.min(100, Math.max(0, +e.target.value)))
              }
            />
          </label>
        </div>
        <p className="field-note">
          Score source: {song.scoreSource}. Changes affect new brackets only.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button
          className="primary wide"
          onClick={() => {
            const p = primary ? parseVideo(primary) : "",
              b = backup ? parseVideo(backup) : "";
            if (
              (primary && !/^[\w-]{11}$/.test(p)) ||
              (backup && !/^[\w-]{11}$/.test(b))
            ) {
              setError(
                "Paste a valid YouTube video link or 11-character video ID.",
              );
              return;
            }
            void onSave({ primary: p, backup: b, start }, quality, popularity);
          }}
        >
          Save song details <Check size={16} />
        </button>
      </div>
    </div>
  );
}
