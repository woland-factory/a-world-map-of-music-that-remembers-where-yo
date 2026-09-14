// Core genres to fetch first in the resumable network stages. These are
// the ground-truth genres the layout is judged on plus the demo passport,
// so a partial run still yields a meaningful, demo-ready, testable file.
export const PRIORITY_GENRES = [
  "black metal", "death metal", "thrash metal", "doom metal", "heavy metal",
  "progressive metal", "power metal", "speed metal", "groove metal",
  "jazz", "blues", "bebop", "swing", "hard bop", "cool jazz", "delta blues",
  "chicago blues", "free jazz", "jazz fusion",
  "progressive rock", "zeuhl", "krautrock", "psychedelic rock", "art rock",
  "techno", "house", "deep house", "detroit techno", "trance", "ambient",
  "drum and bass", "dub techno", "acid house", "minimal techno",
];
