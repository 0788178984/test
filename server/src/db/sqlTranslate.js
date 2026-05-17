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

  s = s.replace(/date\s*\(\s*'now'\s*,\s*'\+(\d+)\s+days'\s*\)/gi, "(CURRENT_DATE + INTERVAL '$1 days')");
  s = s.replace(/date\s*\(\s*'now'\s*,\s*'\s*\+\s*'\s*\|\|\s*\?\s*\|\|\s*'\s+days\s*'\s*\)/gi,
    "(CURRENT_DATE + (?::text || ' days')::interval)");
  s = s.replace(/date\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
  s = s.replace(/date\s*\(\s*([a-z_.]+)\s*\)/gi, 'DATE($1)');

  // SQLite strftime → PostgreSQL
  s = s.replace(
    /strftime\s*\(\s*'%H'\s*,\s*([a-z_.]+)\s*\)/gi,
    "LPAD(EXTRACT(HOUR FROM $1)::text, 2, '0')"
  );
  s = s.replace(
    /strftime\s*\(\s*'%Y-%m'\s*,\s*([a-z_.]+)\s*\)/gi,
    "to_char($1, 'YYYY-MM')"
  );
  s = s.replace(
    /strftime\s*\(\s*'%Y'\s*,\s*([a-z_.]+)\s*\)/gi,
    "CAST(EXTRACT(YEAR FROM $1) AS TEXT)"
  );
  s = s.replace(
    /strftime\s*\(\s*'%m'\s*,\s*([a-z_.]+)\s*\)/gi,
    "LPAD(EXTRACT(MONTH FROM $1)::text, 2, '0')"
  );

  s = s.replace(/json_extract\s*\(\s*meta\s*,\s*'\$\.([^']+)'\s*\)/gi, "(meta::jsonb->>'$1')");

  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');

  let n = 0;
  s = s.replace(/\?/g, () => `$${++n}`);

  // date($1) from date(?) placeholders — SQLite date(?) is invalid on PostgreSQL
  s = s.replace(/date\s*\(\s*(\$\d+)\s*\)/gi, '($1)::date');

  // Cast date parameters after placeholders are numbered
  s = s.replace(/DATE\(\$(\d+)\)/g, '($$$1)::date');

  return s;
}

module.exports = { translateSql };
