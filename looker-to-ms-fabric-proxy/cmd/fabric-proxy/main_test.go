package main

import (
	"bytes"
	"encoding/binary"
	"net"
	"testing"
)

func TestTDSProtocol(t *testing.T) {
	// 1. PreLogin response + encryption parsing round-trip
	var preBuf bytes.Buffer
	if err := sendPreloginResponse(&preBuf, encryptOn); err != nil {
		t.Fatal(err)
	}
	pktType, _, payload, err := readTDSPacket(&preBuf)
	if err != nil || pktType != packReply || parsePreloginEncryption(payload) != encryptOn {
		t.Fatalf("prelogin mismatch: type=0x%02x enc=%d err=%v", pktType, parsePreloginEncryption(payload), err)
	}

	// 2. LOGIN7 parsing + password unmangling + username debug suffix stripping
	login := make([]byte, 94)
	putField := func(pos int, raw []byte) {
		binary.LittleEndian.PutUint16(login[pos:pos+2], uint16(len(login)))
		binary.LittleEndian.PutUint16(login[pos+2:pos+4], uint16(len(raw)/2))
		login = append(login, raw...)
	}
	mangle := func(s string) []byte {
		b := str2ucs2(s)
		for i, ch := range b {
			b[i] = (((ch << 4) & 0xff) | (ch >> 4)) ^ 0xA5
		}
		return b
	}
	putField(36, str2ucs2("myhost"))
	putField(40, str2ucs2("looker_user#debug"))
	putField(44, mangle("s3cr3t!"))
	putField(48, str2ucs2("Looker"))
	putField(68, str2ucs2("warehouse_db"))

	info, err := parseLogin7(login)
	if err != nil || info.CleanUser != "looker_user" || info.Password != "s3cr3t!" || info.Database != "warehouse_db" {
		t.Fatalf("parseLogin7 failed: %+v err=%v", info, err)
	}

	// 3. SQLBatch extraction + overflow safety
	sqlBytes := str2ucs2("SELECT 1")
	batch := make([]byte, 4+len(sqlBytes))
	binary.LittleEndian.PutUint32(batch[0:4], 4)
	copy(batch[4:], sqlBytes)
	if got := extractSQLFromBatch(batch); got != "SELECT 1" {
		t.Fatalf("extractSQLFromBatch got %q", got)
	}
	binary.LittleEndian.PutUint32(batch[0:4], 0xFFFFFFFF)
	if got := extractSQLFromBatch(batch); got != "" {
		t.Fatalf("expected empty on overflow header length, got %q", got)
	}

	// 4. tdsHandshakeConn preserves non-handshake packet header
	c1, c2 := net.Pipe()
	defer c1.Close()
	defer c2.Close()
	go func() {
		_ = writeTDSPacket(c2, packLogin7, 0x01, []byte("ABCD"))
	}()
	hc := newTdsHandshakeConn(c1)
	out := make([]byte, 12)
	n, err := hc.Read(out)
	if err != nil || n != 12 || out[0] != packLogin7 || string(out[8:12]) != "ABCD" || hc.handshake {
		t.Fatalf("tdsHandshakeConn corrupted non-handshake packet: n=%d out=%x err=%v", n, out[:n], err)
	}
}
