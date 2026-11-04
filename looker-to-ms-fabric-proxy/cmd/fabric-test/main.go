package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/microsoft/go-mssqldb/azuread"
)

type Config struct {
	Host         string
	Port         int
	Database     string
	ClientID     string
	TenantID     string
	ClientSecret string
	Table        string
	Timeout      time.Duration
}

func loadEnvFile(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	loadedCount := 0
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "export "))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok {
			key := strings.TrimSpace(k)
			if _, exists := os.LookupEnv(key); !exists {
				os.Setenv(key, strings.TrimSpace(strings.Trim(strings.TrimSpace(v), "\"'")))
				loadedCount++
			}
		}
	}
	if loadedCount > 0 {
		fmt.Printf("[INFO] Loaded %d configuration variables from %s\n", loadedCount, path)
	}
}

func getEnvOrDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return strings.TrimSpace(val)
	}
	return fallback
}

func parseFlags() (*Config, error) {
	loadEnvFile(".env")

	cfg := &Config{}
	portDefault := 1433
	if p, err := strconv.Atoi(os.Getenv("FABRIC_PORT")); err == nil && p > 0 {
		portDefault = p
	}

	flag.StringVar(&cfg.Host, "host", getEnvOrDefault("FABRIC_HOST", ""), "Fabric DW host endpoint (e.g., xxx.datawarehouse.fabric.microsoft.com)")
	flag.IntVar(&cfg.Port, "port", portDefault, "Port number (default 1433)")
	flag.StringVar(&cfg.Database, "database", getEnvOrDefault("FABRIC_DATABASE", ""), "Fabric DW database/warehouse name")
	flag.StringVar(&cfg.ClientID, "client-id", getEnvOrDefault("AZURE_CLIENT_ID", ""), "Entra Application (Client) ID")
	flag.StringVar(&cfg.TenantID, "tenant-id", getEnvOrDefault("AZURE_TENANT_ID", ""), "Entra Directory (Tenant) ID")
	flag.StringVar(&cfg.ClientSecret, "client-secret", getEnvOrDefault("AZURE_CLIENT_SECRET", ""), "Entra Application (Client) Secret (defaults to AZURE_CLIENT_SECRET env var)")
	flag.StringVar(&cfg.Table, "table", getEnvOrDefault("FABRIC_TABLE", ""), "Optional table name for SELECT COUNT(*) test")
	timeoutSec := flag.Int("timeout", 30, "Connection and query timeout in seconds")

	flag.Parse()
	cfg.Timeout = time.Duration(*timeoutSec) * time.Second

	var missing []string
	for _, req := range []struct{ val, name string }{
		{cfg.Host, "-host or FABRIC_HOST"},
		{cfg.Database, "-database or FABRIC_DATABASE"},
		{cfg.ClientID, "-client-id or AZURE_CLIENT_ID"},
		{cfg.TenantID, "-tenant-id or AZURE_TENANT_ID"},
		{cfg.ClientSecret, "-client-secret or AZURE_CLIENT_SECRET"},
	} {
		if req.val == "" {
			missing = append(missing, req.name)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing required configuration parameters:\n  - %s", strings.Join(missing, "\n  - "))
	}

	return cfg, nil
}

func buildConnectionString(cfg *Config) string {
	// go-mssqldb/azuread format:
	// For ActiveDirectoryServicePrincipal, user id is clientID@tenantID, and password is clientSecret.
	// We build a standard URL DSN:
	// sqlserver://clientID%40tenantID:clientSecret@host:port?database=...&fedauth=ActiveDirectoryServicePrincipal
	query := url.Values{}
	query.Add("database", cfg.Database)
	query.Add("fedauth", "ActiveDirectoryServicePrincipal")
	query.Add("encrypt", "true")
	query.Add("TrustServerCertificate", "false")

	// Microsoft Entra SP user is clientID@tenantID
	username := fmt.Sprintf("%s@%s", cfg.ClientID, cfg.TenantID)

	u := &url.URL{
		Scheme:   "sqlserver",
		User:     url.UserPassword(username, cfg.ClientSecret),
		Host:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		RawQuery: query.Encode(),
	}

	return u.String()
}

func main() {
	cfg, err := parseFlags()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Configuration error: %v\n\n", err)
		fmt.Fprintf(os.Stderr, "Usage example:\n")
		fmt.Fprintf(os.Stderr, "  go run main.go \\\n")
		fmt.Fprintf(os.Stderr, "    -host \"<workspace-id>.datawarehouse.fabric.microsoft.com\" \\\n")
		fmt.Fprintf(os.Stderr, "    -database \"<warehouse_name>\" \\\n")
		fmt.Fprintf(os.Stderr, "    -client-id \"<application_id>\" \\\n")
		fmt.Fprintf(os.Stderr, "    -tenant-id \"<directory_id>\" \\\n")
		fmt.Fprintf(os.Stderr, "    -client-secret \"<secret>\" \\\n")
		fmt.Fprintf(os.Stderr, "    [-table \"<schema.table>\"]\n")
		os.Exit(1)
	}

	dsn := buildConnectionString(cfg)

	fmt.Println("==================================================")
	fmt.Println("Microsoft Fabric DW Connectivity Verification")
	fmt.Println("==================================================")
	fmt.Printf("Host:        %s:%d\n", cfg.Host, cfg.Port)
	fmt.Printf("Database:    %s\n", cfg.Database)
	fmt.Printf("Client ID:   %s\n", cfg.ClientID)
	fmt.Printf("Tenant ID:   %s\n", cfg.TenantID)
	fmt.Println("Auth Method: ActiveDirectoryServicePrincipal")
	if cfg.Table != "" {
		fmt.Printf("Test Table:  %s\n", cfg.Table)
	} else {
		fmt.Printf("Test Query:  SELECT 1\n")
	}
	fmt.Println("--------------------------------------------------")

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout)
	defer cancel()

	fmt.Print("Connecting to database... ")
	startTime := time.Now()

	// Driver "azuresql" is registered by github.com/microsoft/go-mssqldb/azuread
	db, err := sql.Open("azuresql", dsn)
	if err != nil {
		fmt.Printf("FAILED\n")
		fmt.Fprintf(os.Stderr, "Error creating connection pool: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// Ping database to establish the connection and verify authentication
	if err := db.PingContext(ctx); err != nil {
		fmt.Printf("FAILED (elapsed: %v)\n", time.Since(startTime).Round(time.Millisecond))
		fmt.Fprintf(os.Stderr, "\nConnection/Authentication Error: %v\n", err)
		printTroubleshootingTips(err)
		os.Exit(1)
	}
	connectDuration := time.Since(startTime).Round(time.Millisecond)
	fmt.Printf("SUCCESS (%v)\n", connectDuration)

	// Execute test query
	query := "SELECT 1, @@VERSION"
	if cfg.Table != "" {
		query = fmt.Sprintf("SELECT COUNT(*) FROM %s", sanitizeIdentifier(cfg.Table))
	}
	fmt.Printf("Executing query: %s... ", query)
	queryStart := time.Now()

	var count int64
	var val int
	var version string
	if cfg.Table != "" {
		err = db.QueryRowContext(ctx, query).Scan(&count)
	} else {
		err = db.QueryRowContext(ctx, query).Scan(&val, &version)
	}
	queryDuration := time.Since(queryStart).Round(time.Millisecond)
	if err != nil {
		fmt.Printf("FAILED (elapsed: %v)\n", queryDuration)
		fmt.Fprintf(os.Stderr, "Query execution error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("SUCCESS (%v)\n", queryDuration)
	if cfg.Table != "" {
		fmt.Printf("Result row count: %d\n", count)
	} else {
		fmt.Printf("Ping response: %d\n", val)
		fmt.Printf("Server version: %s\n", strings.TrimSpace(strings.Split(version, "\n")[0]))
	}

	fmt.Println("==================================================")
	fmt.Println("Status: Connectivity and authentication succeeded!")
	fmt.Println("==================================================")
}

func sanitizeIdentifier(tbl string) string {
	// If already brackets or quotes are provided, return as is
	tbl = strings.TrimSpace(tbl)
	if strings.Contains(tbl, "[") || strings.Contains(tbl, "\"") {
		return tbl
	}
	parts := strings.Split(tbl, ".")
	for i, p := range parts {
		parts[i] = "[" + strings.TrimSpace(p) + "]"
	}
	return strings.Join(parts, ".")
}

func printTroubleshootingTips(err error) {
	fmt.Fprintln(os.Stderr, "\nTroubleshooting Tips for Microsoft Fabric DW:")
	msg := err.Error()

	if strings.Contains(msg, "Login failed") || strings.Contains(msg, "AADSTS") || strings.Contains(msg, "authentication") {
		fmt.Fprintln(os.Stderr, "1. Ensure the Service Principal (App ID) has been granted access to the Fabric Workspace:")
		fmt.Fprintln(os.Stderr, "   - Add the App ID as a Member/Contributor/Viewer in the Fabric Workspace.")
		fmt.Fprintln(os.Stderr, "   - Or grant SELECT permissions in the SQL endpoint / warehouse.")
		fmt.Fprintln(os.Stderr, "2. Ensure Fabric Tenant Settings allow Service Principals:")
		fmt.Fprintln(os.Stderr, "   - In Fabric Admin Portal -> Tenant Settings -> Developer settings:")
		fmt.Fprintln(os.Stderr, "     'Service principals can use Fabric APIs' must be Enabled.")
		fmt.Fprintln(os.Stderr, "3. Check if Client Secret has expired or Application (Client) ID / Tenant ID are mistyped.")
	} else if strings.Contains(msg, "no such host") || strings.Contains(msg, "network") || strings.Contains(msg, "dial") {
		fmt.Fprintln(os.Stderr, "1. Verify the SQL connection string host name from the Fabric portal:")
		fmt.Fprintln(os.Stderr, "   - Fabric Workspace -> Warehouse / Lakehouse -> Settings -> SQL connection string.")
		fmt.Fprintln(os.Stderr, "2. Ensure outbound port 1433 TCP is permitted on your network/firewall.")
	}
}
