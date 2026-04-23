#!/bin/sh
set -eu
(set -o pipefail) 2>/dev/null && set -o pipefail

LC_ALL=C
export LC_ALL

run_with_retries() {
  attempt=0
  max_attempts="$1"
  shift

  until "$@"; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_attempts" ]; then
      return 1
    fi
    sleep 2
  done
}

resolve_migrations_through() {
  cutoff_migration="$1"
  found_cutoff=0
  migrations_to_resolve=""

  case "$cutoff_migration" in
    ""|*/*|*..*)
      echo "Invalid migration cutoff while baselining: $cutoff_migration" >&2
      return 1
      ;;
  esac

  if [ ! -d "prisma/migrations/$cutoff_migration" ]; then
    echo "Migration cutoff not found while baselining: $cutoff_migration" >&2
    return 1
  fi

  for migration_dir in prisma/migrations/*; do
    if [ ! -d "$migration_dir" ]; then
      continue
    fi

    migration_name="$(basename "$migration_dir")"
    migrations_to_resolve="${migrations_to_resolve}${migration_name}
"
    if [ "$migration_name" = "$cutoff_migration" ]; then
      found_cutoff=1
      break
    fi
  done

  if [ "$found_cutoff" -ne 1 ]; then
    echo "Migration cutoff not found while baselining: $cutoff_migration" >&2
    return 1
  fi

  old_ifs="$IFS"
  IFS='
'
  for migration_name in $migrations_to_resolve; do
    run_with_retries "${PRISMA_BOOTSTRAP_ATTEMPTS:-30}" \
      npx prisma migrate resolve --applied "$migration_name"
  done
  IFS="$old_ifs"
}

migration_bootstrap_mode="$(run_with_retries "${PRISMA_BOOTSTRAP_ATTEMPTS:-30}" node dist/migrationBootstrap.js)"

case "$migration_bootstrap_mode" in
  fresh|ready)
    run_with_retries "${PRISMA_BOOTSTRAP_ATTEMPTS:-30}" npx prisma migrate deploy
    ;;
  baseline-*)
    resolve_migrations_through "${migration_bootstrap_mode#baseline-}"
    run_with_retries "${PRISMA_BOOTSTRAP_ATTEMPTS:-30}" npx prisma migrate deploy
    ;;
  partial)
    echo "Refusing to baseline a partially initialized database without Prisma migration history." >&2
    exit 1
    ;;
  *)
    echo "Unknown migration bootstrap mode: $migration_bootstrap_mode" >&2
    exit 1
    ;;
esac

run_with_retries "${BOOTSTRAP_ATTEMPTS:-5}" node dist/bootstrap.js

exec node dist/index.js
