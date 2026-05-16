/** SQL dialect helpers for PostgreSQL (Supabase). */
function translateSql(sql) {
  let s = sql;

  s = s.replace(/datetime\s*\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi, (_, mod) => {
    const m = mod.trim();
    if (m.startsWith('+')) return `(NOW() + INTERVAL '${m.slice(1)}')`;
    if (m.startsWith('-')) return `(NOW() - INTERVAL '${m.slice(1)}')`;
    return 'NOW()';
  });
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');
  s = s.replace(
    /date\s*\(\s*'now'\s*,\s*'\s*\+\s*'\s*\|\|\s*\?\s*\|\|\s*'\s+days\s*'\s*\)/gi,
    "(CURRENT_DATE + (?::text || ' days')::interval)"
  );
  s = s.replace(/date\s*\(\s*'now'\s*,\s*'\+(\d+)\s+days'\s*\)/gi, "(CURRENT_DATE + INTERVAL '$1 days')");
  s = s.replace(/date\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
  s = s.replace(/date\s*\(\s*([a-z_.]+)\s*\)/gi, 'DATE($1)');

  s = s.replace(/json_extract\s*\(\s*meta\s*,\s*'\$\.([^']+)'\s*\)/gi, "(meta::jsonb->>'$1')");
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');

  // SQLite ? placeholders → PostgreSQL $1, $2, …
  let n = 0;
  s = s.replace(/\?/g, () => `$${++n}`);

  return s;
}

module.exports = { translateSql };
