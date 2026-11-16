interface SuggestedMix {
  name: string;
  years?: [number, number];
  size: number;
  artists: string[];
}

export const suggestedMixes: SuggestedMix[] = [
  {
    name: "’90s Alternative Rock",
    years: [1990, 1999],
    size: 32,
    artists: [
      "nirvana",
      "radiohead",
      "pixies",
      "rage-against-the-machine",
      "green-day",
      "nine-inch-nails",
    ],
  },
  {
    name: "2010s Hip-Hop",
    years: [2010, 2019],
    size: 32,
    artists: [
      "kendrick-lamar",
      "kanye-west",
      "j-cole",
      "tyler-the-creator",
      "danny-brown",
      "freddie-gibbs",
    ],
  },
  {
    name: "’70s Soul",
    years: [1970, 1979],
    size: 32,
    artists: [
      "aretha-franklin",
      "marvin-gaye",
      "stevie-wonder",
      "al-green",
      "curtis-mayfield",
    ],
  },
  {
    name: "’80s New Wave & Synths",
    years: [1980, 1989],
    size: 16,
    artists: [
      "talking-heads",
      "the-cure",
      "kraftwerk",
      "david-bowie",
      "the-clash",
    ],
  },
  {
    name: "2000s Indie & Alternative",
    years: [2000, 2009],
    size: 32,
    artists: [
      "arctic-monkeys",
      "sufjan-stevens",
      "wilco",
      "gorillaz",
      "radiohead",
    ],
  },
  {
    name: "’70s Classic Rock",
    years: [1970, 1979],
    size: 32,
    artists: [
      "led-zeppelin",
      "the-rolling-stones",
      "the-who",
      "fleetwood-mac",
      "pink-floyd",
      "bruce-springsteen",
    ],
  },
  {
    name: "Classic Rock Heavyweights",
    size: 64,
    artists: [
      "the-beatles",
      "the-rolling-stones",
      "led-zeppelin",
      "pink-floyd",
      "queen",
      "fleetwood-mac",
      "david-bowie",
      "bruce-springsteen",
    ],
  },
  {
    name: "Pop & R&B Hitmakers",
    size: 64,
    artists: [
      "michael-jackson",
      "prince",
      "beyonce",
      "rihanna",
      "the-weeknd",
      "stevie-wonder",
      "abba",
      "sza",
    ],
  },
  {
    name: "Trip-Hop & Leftfield Pop",
    size: 16,
    artists: ["portishead", "bjork", "gorillaz", "james-blake"],
  },
  {
    name: "Hip-Hop Across Eras",
    size: 32,
    artists: [
      "outkast",
      "jay-z",
      "eminem",
      "50-cent",
      "mf-doom",
      "drake",
      "kendrick-lamar",
      "playboi-carti",
    ],
  },
];
