package gamedataapi

import (
	"fmt"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/wdb"
)

const maxWDBFileSize = 50 * 1024 * 1024 // 50 MB

func (h *Handler) UploadWDB(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "compare"
	}
	if mode != "compare" && mode != "upsert" && mode != "insert" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid mode, must be 'compare', 'upsert', or 'insert'",
		})
		return
	}

	file, header, err := r.FormFile("wdb_file")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get wdb_file from form",
			Detail:  err.Error(),
		})
		return
	}
	defer func() { _ = file.Close() }()

	if header.Size > maxWDBFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("File too large (%d bytes), maximum is %d bytes", header.Size, maxWDBFileSize),
		})
		return
	}

	wdbHeader, records, err := wdb.Parse(file)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to parse WDB file",
			Detail:  err.Error(),
		})
		return
	}

	switch wdbHeader.Signature {
	case wdb.SigItem:
		h.handleItemUpload(ctx, w, mode, wdbHeader, records)
	case wdb.SigCreature:
		h.handleCreatureUpload(ctx, w, mode, wdbHeader, records)
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("Unsupported WDB signature %q, expected item (%q) or creature (%q)", wdbHeader.Signature, wdb.SigItem, wdb.SigCreature),
		})
	}
}
