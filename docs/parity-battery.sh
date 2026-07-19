#!/usr/bin/env bash
# Parity battery: run the same request sequence against NEW (3001) and OLD (3002) backends.
set -u
PORT=$1
JAR=$(mktemp)
OUT=""

req() {
  local desc=$1; shift
  local body
  body=$("$@" 2>&1)
  OUT+="== $desc"$'\n'"$body"$'\n\n'
}

BASE="http://localhost:$PORT/api/v1"
H='Content-Type: application/json'

req "connect" curl -s -c "$JAR" -X POST "$BASE/db/connect" -H "$H" -d '{"host":"localhost","port":"5432","database":"TEST","user":"TEST","password":"TEST"}'
req "status" curl -s -b "$JAR" "$BASE/db"
req "cypher create_graph" curl -s -b "$JAR" -X POST "$BASE/cypher" -H "$H" -d '{"cmd":"SELECT * FROM ag_catalog.create_graph('"'"'parity'"'"')"}'
req "meta empty body" curl -s -b "$JAR" -X POST "$BASE/db/meta" -H "$H" -d '{}'
req "meta currentGraph" curl -s -b "$JAR" -X POST "$BASE/db/meta" -H "$H" -d '{"currentGraph":"parity"}'
req "cypher create vertex" curl -s -b "$JAR" -X POST "$BASE/cypher" -H "$H" -d '{"cmd":"SELECT * FROM cypher('"'"'parity'"'"', $$ CREATE (:person {name:\"alice\", age:30}) $$) as (a agtype)"}'
req "cypher match vertex" curl -s -b "$JAR" -X POST "$BASE/cypher" -H "$H" -d '{"cmd":"SELECT * FROM cypher('"'"'parity'"'"', $$ MATCH (n:person) RETURN n $$) as (n agtype)"}'
req "cypher float array" curl -s -b "$JAR" -X POST "$BASE/cypher" -H "$H" -d '{"cmd":"SELECT * FROM cypher('"'"'parity'"'"', $$ MATCH (n:person) RETURN [1.5, n.age] $$) as (a agtype)"}'
req "cypher syntax error" curl -s -b "$JAR" -X POST "$BASE/cypher" -H "$H" -d '{"cmd":"THIS IS NOT SQL"}'
req "metaChart" curl -s -b "$JAR" "$BASE/db/metaChart"
req "miscellaneous head" bash -c "curl -s -b '$JAR' '$BASE/miscellaneous' | head -c 120"
req "drop graph" curl -s -b "$JAR" -X POST "$BASE/cypher" -H "$H" -d '{"cmd":"SELECT * FROM ag_catalog.drop_graph('"'"'parity'"'"', true)"}'
req "disconnect" curl -s -b "$JAR" "$BASE/db/disconnect"
printf '%s' "$OUT"
rm -f "$JAR"
