import type { HistoryEntry, Run, Song, SourceOverride } from "./types";
import { matchSongs, outcomes, songArtist } from "./engine";
import { challengeSnapshot } from "./share";
const palettes = {
  light: {
    bg: "#f5edda",
    ink: "#35251d",
    green: "#455a32",
    line: "#baab86",
    soft: "#78684c",
    winner: "#e0e5c9",
  },
  dark: {
    bg: "#242526",
    ink: "#e5e3df",
    green: "#b8c699",
    line: "#5b5e60",
    soft: "#b9bab9",
    winner: "#363839",
  },
  streaming: {
    bg: "#141414",
    ink: "#f4f5f1",
    green: "#c4fa61",
    line: "#464844",
    soft: "#b9bdb5",
    winner: "#262e1a",
  },
};
type ExportTheme = boolean | "streaming";
export async function renderHistoryEntry(
  run: Run,
  theme: ExportTheme,
  sources: Record<string, SourceOverride> = {},
): Promise<HistoryEntry> {
  const full = await exportBracket(run, "full", theme),
    top =
      run.definition.songs.length > 16
        ? await exportBracket(run, "top", theme)
        : undefined;
  const top8 =
    run.definition.songs.length > 8
      ? await exportBracket(run, "top", theme, 8)
      : undefined;
  const won = outcomes(run),
    winner = run.definition.songs.find(
      (s) => s.id === won[run.definition.matches.at(-1)!.id],
    );
  return {
    id: run.id,
    name:
      run.definition.options.name ||
      `${run.definition.artist.name} · ${run.definition.songs.length} songs`,
    artist: run.definition.artist.name,
    winner: winner?.title || "",
    completedAt: new Date().toISOString(),
    entrantCount: run.definition.songs.length,
    full,
    top,
    top8,
    imageTheme: theme,
    result: {
      ...run,
      definition: challengeSnapshot(run.definition, {
        ...run.definition.sharedSources,
        ...sources,
      }),
      picks: run.picks.map(({ matchId, songId, at }) => ({
        matchId,
        songId,
        at,
      })),
    },
  };
}
async function picture(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => resolve(null), 5000);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = url;
  });
}
export async function exportBracket(
  run: Run,
  mode: "full" | "top",
  theme: ExportTheme = false,
  limit = 16,
): Promise<Blob> {
  await document.fonts.ready;
  const d = run.definition,
    won = outcomes(run),
    p =
      palettes[theme === "streaming" ? "streaming" : theme ? "dark" : "light"];
  const headingFont = theme === "streaming" ? "DM Sans" : "Fraunces";
  const final = d.matches.at(-1)!;
  const champion = d.songs.find((s) => s.id === won[final.id]);
  let matches = d.matches;
  if (mode === "top") {
    const maxRound = Math.max(...d.matches.map((m) => m.round));
    let start = maxRound;
    for (let r = maxRound; r >= 0; r--) {
      const candidates = d.matches
        .filter((m) => m.round === r)
        .reduce((a, m) => a + matchSongs(run, m).length, 0);
      if (candidates <= limit) start = r;
      else break;
    }
    matches = d.matches.filter((m) => m.round >= start);
  }
  const rounds = [...new Set(matches.map((m) => m.round))];
  const rows = Math.max(
    ...rounds.map((r) =>
      matches
        .filter((m) => m.round === r)
        .reduce((n, m) => n + m.slots.length + 0.35, 0),
    ),
  );
  const col = 350,
    row = 70,
    pad = 64,
    header = 260;
  const width = Math.max(1200, pad * 2 + col * rounds.length),
    height = Math.ceil(Math.max(840, header + rows * row + 100));
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    30000 / height,
    16000 / width,
    Math.sqrt(90000000 / (width * height)),
  );
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Your browser could not create the bracket image.");
  ctx.scale(scale, scale);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, width, height);
  const paper = theme === false ? await picture("/paper.webp") : null;
  if (paper) {
    const pattern = ctx.createPattern(paper, "repeat");
    if (pattern) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }
  const covers = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    d.albums.map(async (a) => covers.set(a.id, await picture(a.cover))),
  );
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    font = "DM Sans",
    color = p.ink,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${size}px "${font}"`;
    ctx.fillText(value, x, y);
  };
  text("MusicBracket", pad, 72, 38, headingFont);
  text(
    `${d.artist.name} · ${d.songs.length} songs · ${mode === "full" ? "The complete bracket" : `Final stages · up to ${limit} songs`}`,
    pad,
    108,
    18,
    "DM Sans",
    p.soft,
  );
  ctx.strokeStyle = p.line;
  ctx.beginPath();
  ctx.moveTo(pad, 132);
  ctx.lineTo(width - pad, 132);
  ctx.stroke();
  text(
    champion ? `${champion.title} takes the crown.` : "Your listening journey.",
    pad,
    195,
    40,
    headingFont,
    p.green,
  );
  text(
    "One listener. Every decision. Follow your ears.",
    pad,
    230,
    16,
    "DM Sans",
    p.soft,
  );
  const positions = new Map<string, { x: number; y: number }>();
  const drawSong = (
    s: Song | undefined,
    x: number,
    y: number,
    winner: boolean,
  ) => {
    if (winner) {
      ctx.fillStyle = p.winner;
      ctx.fillRect(x - 8, y - 41, col - 42, 58);
    }
    const art = s ? covers.get(s.albumId) : null;
    if (art) ctx.drawImage(art, x, y - 35, 42, 42);
    else {
      ctx.fillStyle = p.line;
      ctx.fillRect(x, y - 35, 42, 42);
    }
    ctx.fillStyle = winner ? p.green : p.ink;
    ctx.font = `${winner ? "600" : "400"} 17px "DM Sans"`;
    let title = s?.title || "Bye";
    while (ctx.measureText(title).width > col - 115)
      title = title.slice(0, -2) + "…";
    ctx.fillText(title, x + 54, y - 12);
    ctx.font = '11px "DM Sans"';
    ctx.fillStyle = p.soft;
    ctx.fillText(
      (s && d.artists
        ? songArtist(d, s)
        : d.albums.find((a) => a.id === s?.albumId)?.title || ""
      ).slice(0, 38),
      x + 54,
      y + 6,
    );
  };
  rounds.forEach((r, ci) => {
    const ms = matches.filter((m) => m.round === r),
      x = pad + ci * col;
    const count = ms.reduce((n, m) => n + matchSongs(run, m).length, 0);
    text(
      ms.length === 1 ? "Final" : `${count} songs remaining`,
      x,
      header + 25,
      18,
      headingFont,
      p.green,
    );
    const totalHeight = height - header - 100;
    const groupWeight = ms.reduce(
      (total, m) => total + m.slots.length + 0.35,
      0,
    );
    let offset = header + 48;
    ms.forEach((m) => {
      const unit = ((m.slots.length + 0.35) * totalHeight) / groupWeight;
      const songs = matchSongs(run, m),
        cy = offset + unit / 2,
        top = cy - ((songs.length - 1) * row) / 2 + 12;
      offset += unit;
      songs.forEach((s, j) =>
        drawSong(s, x, top + j * row, won[m.id] === s.id),
      );
      positions.set(m.id, { x: x + col - 50, y: cy - 12 });
      ctx.strokeStyle = p.line;
      ctx.beginPath();
      ctx.moveTo(x - 12, top - 48);
      ctx.lineTo(x + col - 42, top - 48);
      ctx.stroke();
      if (ci > 0)
        for (const slot of m.slots)
          if ("matchId" in slot) {
            const start = positions.get(slot.matchId);
            if (start) {
              ctx.beginPath();
              ctx.moveTo(start.x, start.y);
              ctx.lineTo(start.x + 18, start.y);
              ctx.lineTo(start.x + 18, cy - 12);
              ctx.lineTo(x - 16, cy - 12);
              ctx.stroke();
            }
          }
    });
  });
  text(
    `${new Date().toLocaleDateString("en-GB")}  /  musicbracket  /  Tournament placement, not a complete ranking`,
    pad,
    height - 32,
    13,
    "DM Sans",
    p.soft,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(Error("Could not render this image.")),
      "image/png",
    ),
  );
}
