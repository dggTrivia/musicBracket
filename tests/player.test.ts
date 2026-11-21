import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVideo } from "../src/Player.tsx";

test("video edits accept YouTube URLs and save only the video ID", () => {
  const id = "38wlfeXPoZI";
  for (const input of [
    id,
    ` https://www.youtube.com/watch?v=${id}&t=40s `,
    `https://youtu.be/${id}?si=example`,
    `music.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ])
    assert.equal(parseVideo(input), id);
  for (const input of [
    "",
    "https://youtube.com/watch?v=short",
    `https://youtube.com.example/watch?v=${id}`,
    `https://youtube.com/embed/${id}extra`,
  ])
    assert.equal(parseVideo(input), "");
});
