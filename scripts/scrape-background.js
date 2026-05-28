#!/usr/bin/env node
/**
 * Scrapes a D&D 5e background from dnd5e.wikidot.com and writes it to
 * data/backgrounds/{slug}.json in the project schema format.
 *
 * Usage: node scripts/scrape-background.js <slug>
 * Example: node scripts/scrape-background.js house-agent
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/scrape-background.js <slug>');
  process.exit(1);
}

const url = `https://dnd5e.wikidot.com/background:${slug}`;
const outPath = path.join(__dirname, '..', 'data', 'backgrounds', `${slug}.json`);

// ── HTML utilities ────────────────────────────────────────────────────────────

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8230;/g, '…');
}

function stripTags(str) {
  // Remove hover spans (they contain tooltip text as nested spans — drop the inner span)
  str = str.replace(/<span class="hover">([\s\S]*?)<span>[\s\S]*?<\/span><\/span>/g, '$1');
  // Remove remaining tags
  str = str.replace(/<[^>]+>/g, '');
  return decodeEntities(str).trim();
}

// ── Section extractors ────────────────────────────────────────────────────────

/** Extract text from <strong>Label:</strong> ... <br /> pattern in the stats block */
function extractStat(html, label) {
  const re = new RegExp(`<strong>${label}[:\\s]*<\\/strong>([^<]*(?:<(?!br|strong)[^>]*>[^<]*)*)`, 'i');
  const m = html.match(re);
  if (!m) return '';
  // Grab up to next <br> or end of string
  const raw = m[1].replace(/<br\s*\/?>.*/s, '').replace(/<[^>]+>/g, '');
  return decodeEntities(raw).trim();
}

/** Extract the description from the first <p><strong><em>...</em></strong></p> block */
function extractDescription(html) {
  const m = html.match(/<p><strong><em>([\s\S]*?)<\/em><\/strong><\/p>/);
  if (!m) return '';
  return stripTags(m[1]);
}

/** Extract feature: returns { name, description } for the first h2 after the Features h1 */
function extractFeature(html) {
  // Find the Features section
  const featIdx = html.search(/<h1[^>]*>[\s\S]*?Features[\s\S]*?<\/h1>/i);
  if (featIdx === -1) return { name: '', description: '' };

  const after = html.substring(featIdx);

  // First h2 in that section is the feature name
  const h2m = after.match(/<h2[^>]*><span[^>]*><span[^>]*>([\s\S]*?)<\/span>/);
  if (!h2m) return { name: '', description: '' };
  const name = stripTags(h2m[1]);

  // Paragraphs immediately after the h2 up to the next heading
  const h2End = after.indexOf(h2m[0]) + h2m[0].length;
  const rest = after.substring(h2End);
  const nextHeading = rest.search(/<h[12]/i);
  const descBlock = nextHeading === -1 ? rest : rest.substring(0, nextHeading);

  const paras = [];
  const pRe = /<p>([\s\S]*?)<\/p>/gi;
  let pm;
  while ((pm = pRe.exec(descBlock)) !== null) {
    const text = stripTags(pm[1]);
    if (text) paras.push(text);
  }
  return { name, description: paras.join('\n\n') };
}

/** Extract rows from a wiki-content-table where first column is a number (d6/d8/d10) */
function extractTableRows(html, headingText) {
  // Find the h2 with this heading
  const re = new RegExp(`<h2[^>]*>[\\s\\S]*?${headingText}[\\s\\S]*?<\\/h2>([\\s\\S]*?)(?=<h[12]|$)`, 'i');
  const m = html.match(re);
  if (!m) return [];

  const tableHtml = m[1];
  const rows = [];
  const trRe = /<tr>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(tableHtml)) !== null) {
    const tds = [];
    const tdRe = /<td>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) {
      tds.push(stripTags(td[1]));
    }
    // First column is the die number — skip it, take the second column
    if (tds.length >= 2 && /^\d+$/.test(tds[0])) {
      rows.push(tds[1]);
    }
  }
  return rows;
}

/** Parse skill proficiency string into array */
function parseSkills(raw) {
  if (!raw || raw.toLowerCase() === 'none') return [];
  // Split on comma but keep choice descriptions intact
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** Parse tool proficiency string into array */
function parseTools(raw) {
  if (!raw || raw.toLowerCase() === 'none') return [];
  return [raw.trim()];
}

/** Parse language string into { languages, language_choices } */
function parseLanguages(raw) {
  if (!raw || raw.toLowerCase() === 'none') return { languages: [], language_choices: 0 };

  const lower = raw.toLowerCase();

  // Pattern: "two of your choice" or "any two"
  const twoChoice = /\btwo\b.*\bchoice\b/i.test(raw) || /\bany two\b/i.test(raw);
  const oneChoice = /\bone\b.*\bchoice\b/i.test(raw) || /\bany one\b/i.test(raw);

  // Pattern: "one exotic ... plus one of your choice" or similar combo
  if (twoChoice && !/exotic/i.test(raw)) return { languages: [], language_choices: 2 };
  if (oneChoice && !/exotic/i.test(raw)) return { languages: [], language_choices: 1 };

  // Exotic language listed explicitly (haunted-one style)
  if (/exotic/i.test(raw)) {
    return { languages: [raw.trim()], language_choices: 1 };
  }

  // Specific language list (e.g. "Elvish, Gnomish, or Sylvan")
  if (raw.includes(',') || raw.includes(' or ')) {
    return { languages: [raw.trim()], language_choices: 0 };
  }

  // Single specific language
  return { languages: [raw.trim()], language_choices: 0 };
}

/** Parse equipment string into array of items */
function parseEquipment(raw) {
  if (!raw) return [];
  // Split on comma + "and" patterns but preserve sub-lists
  // Simple approach: split on ", " at top level
  return raw.split(/,\s+(?:and\s+)?/).map(s => s.trim()).filter(Boolean);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; dnd-sheet-scraper/1.0)' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => resolve(html));
    }).on('error', reject);
  });
}

async function main() {
  console.log(`Fetching ${url} ...`);
  const html = await fetchPage(url);

  // Extract the page-content block
  const startIdx = html.indexOf('id="page-content"');
  if (startIdx === -1) throw new Error('Could not find page-content div');
  const endMarker = html.indexOf('<!-- google_ad_section_end -->', startIdx);
  const content = endMarker === -1
    ? html.substring(startIdx, startIdx + 30000)
    : html.substring(startIdx, endMarker);

  // ── Parse fields ────────────────────────────────────────────────────────────
  const description = extractDescription(content);
  const skillRaw = extractStat(content, 'Skill Proficiencies');
  const toolRaw = extractStat(content, 'Tool Proficiencies');
  const langRaw = extractStat(content, 'Languages');
  const equipRaw = extractStat(content, 'Equipment');
  const feature = extractFeature(content);

  const { languages, language_choices } = parseLanguages(langRaw);

  const personality_traits = extractTableRows(content, 'Personality Traits');
  const ideals = extractTableRows(content, 'Ideals');
  const bonds = extractTableRows(content, 'Bonds');
  const flaws = extractTableRows(content, 'Flaws');

  // ── Source note ─────────────────────────────────────────────────────────────
  const sourceMatch = content.match(/Source:\s*([^<\n]+)/);
  const source = sourceMatch ? sourceMatch[1].trim() : 'Unknown source';

  const result = {
    name: `Background: ${slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}`,
    slug,
    description,
    skill_proficiencies: parseSkills(skillRaw),
    tool_proficiencies: parseTools(toolRaw),
    languages,
    language_choices,
    feature,
    starting_equipment: parseEquipment(equipRaw),
    personality_traits,
    ideals,
    bonds,
    flaws,
    _review: [`Source: ${source} — not SRD content`],
  };

  const json = JSON.stringify(result, null, 2);
  fs.writeFileSync(outPath, json, 'utf8');
  console.log(`Written to ${outPath}`);

  // Print a summary for verification
  console.log('\n--- Summary ---');
  console.log('Description:', description.substring(0, 80) + '...');
  console.log('Skills:', result.skill_proficiencies);
  console.log('Tools:', result.tool_proficiencies);
  console.log('Languages:', languages, '| choices:', language_choices);
  console.log('Equipment items:', result.starting_equipment.length);
  console.log('Feature:', feature.name);
  console.log('Traits:', personality_traits.length, '| Ideals:', ideals.length, '| Bonds:', bonds.length, '| Flaws:', flaws.length);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
