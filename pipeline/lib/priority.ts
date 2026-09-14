// Core genres to fetch first in the resumable network stages. These are
// the ground-truth genres the layout is judged on plus the demo passport,
// so a partial run still yields a meaningful, demo-ready, testable file.
//
// MAINSTREAM_ANCHORS come first: the household-name genres a visitor taps
// on their first touch. If a partial run is all that fits, these must be
// hearable so "touch anywhere and it plays" holds for the popular core.
const MAINSTREAM_ANCHORS = [
  "rock", "pop", "hip hop", "rap", "country", "classical", "soul", "funk",
  "punk", "folk", "disco", "r&b", "electronic", "metal", "reggae", "blues",
  "jazz", "gospel", "latin", "salsa", "reggaeton", "k-pop", "j-pop", "edm",
  "dance", "dubstep", "house", "techno", "trance", "ambient", "indie rock",
  "indie pop", "alternative rock", "hard rock", "heavy metal", "grunge",
  "emo", "ska", "bluegrass", "americana", "new wave", "synthpop", "hardcore",
  "garage rock", "post-punk", "shoegaze", "dream pop", "trap", "drill",
  "afrobeat", "afrobeats", "bossa nova", "flamenco", "tango", "samba",
  "cumbia", "bachata", "merengue", "highlife", "soca", "dancehall", "grime",
  "lo-fi", "vaporwave", "chillwave", "electropop", "dance-pop", "post-rock",
  "math rock", "noise rock", "industrial", "goth", "gothic rock", "darkwave",
  "surf rock", "rockabilly", "doo-wop", "motown", "boogie", "swing",
  "big band", "ragtime", "opera", "baroque", "romantic", "minimalism",
  "world", "celtic", "klezmer", "fado", "rumba", "zydeco", "delta blues",
  "chicago blues", "hard bop", "bebop", "cool jazz", "free jazz",
  "jazz fusion", "smooth jazz", "acid jazz", "nu jazz",
];

export const PRIORITY_GENRES = [
  ...MAINSTREAM_ANCHORS,
  "black metal", "death metal", "thrash metal", "doom metal", "heavy metal",
  "progressive metal", "power metal", "speed metal", "groove metal",
  "jazz", "blues", "bebop", "swing", "hard bop", "cool jazz", "delta blues",
  "chicago blues", "free jazz", "jazz fusion",
  "progressive rock", "zeuhl", "krautrock", "psychedelic rock", "art rock",
  "techno", "house", "deep house", "detroit techno", "trance", "ambient",
  "drum and bass", "dub techno", "acid house", "minimal techno",
];
