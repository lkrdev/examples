#!/usr/bin/env bash
set -euo pipefail

export PATH="${JAVA_HOME:+${JAVA_HOME}/bin:}/usr/local/buildtools/java/jdk/bin:${PATH}"
for bin in java javac; do
    command -v "$bin" >/dev/null 2>&1 || { echo "[ERROR] $bin not found. Please install JDK or set JAVA_HOME."; exit 1; }
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${SCRIPT_DIR}"

# Download mssql-jdbc jar if not present
JAR_PATH="test/lib/mssql-jdbc.jar"
if [ ! -f "${JAR_PATH}" ]; then
    echo "[INFO] Downloading Microsoft JDBC driver (mssql-jdbc.jar)..."
    mkdir -p test/lib
    curl -sSL -o "${JAR_PATH}" https://repo1.maven.org/maven2/com/microsoft/sqlserver/mssql-jdbc/12.8.1.jre11/mssql-jdbc-12.8.1.jre11.jar
fi

javac -cp "${JAR_PATH}" -d test test/MockLookerClient.java
java -cp "test:${JAR_PATH}" test.MockLookerClient "$@"
