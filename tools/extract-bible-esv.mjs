// Generates the bundled ESV text from the interlinear ESV.json export.
//
//   node tools/extract-bible-esv.mjs <path-to-ESV.json>
//
// Writes www/bible/<book>.json for the books the ESV covers, then rewrites the
// verse counts in www/js/bible/canon.js from what actually landed on disk.
//
// The books left alone keep the Septuagint text: the ESV follows the Masoretic
// numbering, which is a different book wherever the two disagree.

import fs from 'node:fs';
import path from 'node:path';
import { BOOKS } from '../www/js/bible/canon.js';

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/extract-bible-esv.mjs <path-to-ESV.json>');
  process.exit(1);
}

// ESV name -> our id. Absent means the Septuagint text stands: the
// deuterocanon, and Psalms, Esther, Daniel and Jeremiah, which are numbered
// differently in the two traditions.
const MAP = {
  Genesis: 'gen', Exodus: 'exo', Leviticus: 'lev', Numbers: 'num', Deuteronomy: 'deu',
  Joshua: 'jos', Judges: 'jdg', Ruth: 'rut',
  'I Samuel': '1ki', 'II Samuel': '2ki', 'I Kings': '3ki', 'II Kings': '4ki',
  'I Chronicles': '1ch', 'II Chronicles': '2ch', Ezra: '2es', Nehemiah: 'neh',
  Job: 'job', Proverbs: 'pro', Ecclesiastes: 'ecc', 'Song of Solomon': 'sng',
  Hosea: 'hos', Amos: 'amo', Micah: 'mic', Joel: 'joe', Obadiah: 'oba', Jonah: 'jon',
  Nahum: 'nah', Habakkuk: 'hab', Zephaniah: 'zep', Haggai: 'hag', Zechariah: 'zec',
  Malachi: 'mal', Isaiah: 'isa', Lamentations: 'lam', Ezekiel: 'eze',
  Matthew: 'mat', Mark: 'mrk', Luke: 'luk', John: 'jhn', Acts: 'act',
  Romans: 'rom', 'I Corinthians': '1co', 'II Corinthians': '2co', Galatians: 'gal',
  Ephesians: 'eph', Philippians: 'php', Colossians: 'col',
  'I Thessalonians': '1th', 'II Thessalonians': '2th', 'I Timothy': '1ti', 'II Timothy': '2ti',
  Titus: 'tit', Philemon: 'phm', Hebrews: 'heb', James: 'jas',
  'I Peter': '1pe', 'II Peter': '2pe', 'I John': '1jn', 'II John': '2jn', 'III John': '3jn',
  Jude: 'jud', 'Revelation of John': 'rev',
};

/* ---- text ---- */

// A verse is a run of [word, strongs?] tokens. Joining on a space leaves gaps
// before punctuation and inside quotes, which the fixups below close.
function verseText(tokens) {
  let s = tokens.map((t) => t[0]).join(' ');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s+([,.;:!?’”'")\]])/g, '$1');
  s = s.replace(/([‘“(\[])\s+/g, '$1');
  return s.trim();
}

const data = JSON.parse(fs.readFileSync(src, 'utf8')).books;
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'www', 'bible');
fs.mkdirSync(OUT, { recursive: true });

const byId = new Map(BOOKS.map((b) => [b.id, b]));
let written = 0;

for (const [name, id] of Object.entries(MAP)) {
  const chapters = data[name];
  const book = byId.get(id);
  if (!chapters) { console.warn(`no ESV book "${name}"`); continue; }
  if (!book) { console.warn(`no canon book "${id}"`); continue; }
  // A chapter count that disagrees is a different arrangement, not a fix.
  if (chapters.length !== book.chapters.length) {
    console.warn(`skip ${id}: ESV has ${chapters.length} chapters, canon has ${book.chapters.length}`);
    continue;
  }
  const out = {};
  chapters.forEach((verses, i) => {
    const ch = {};
    verses.forEach((tokens, j) => { ch[j + 1] = verseText(tokens); });
    out[i + 1] = ch;
  });
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(out));
  written++;
}

/* ---- canon ---- */

// The canon's verse counts come from the files, so the reader never asks for a
// verse that is not there.
let books = 0, chapters = 0, verses = 0;
const counts = new Map();
for (const b of BOOKS) {
  const f = path.join(OUT, `${b.id}.json`);
  if (!fs.existsSync(f)) { console.warn(`no text for ${b.id}`); continue; }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const n = [];
  for (let c = 1; c <= b.chapters.length; c++) n.push(Object.keys(d[c] || {}).length);
  counts.set(b.id, n);
  books++;
  chapters += n.length;
  verses += n.reduce((a, x) => a + x, 0);
}

const canonPath = path.join(ROOT, 'www', 'js', 'bible', 'canon.js');
let canon = fs.readFileSync(canonPath, 'utf8');
for (const [id, n] of counts) {
  const re = new RegExp(`(\\{ id: '${id}',[^\\n]*?chapters: \\[)[^\\]]*(\\])`);
  canon = canon.replace(re, `$1${n.join(',')}$2`);
}
fs.writeFileSync(canonPath, canon);

fs.writeFileSync(path.join(OUT, '_meta.json'), JSON.stringify({ books, chapters, verses, missing: 0 }));
console.log(`ESV: ${written} books. Canon: ${books} books, ${chapters} chapters, ${verses} verses.`);
