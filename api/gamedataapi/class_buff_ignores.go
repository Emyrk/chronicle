package gamedataapi

import (
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
)

func (h *Handler) SetClassBuffIgnore(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.SetClassBuffIgnoreRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	req.SpellName = strings.TrimSpace(req.SpellName)
	if req.SpellName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "spell_name is required"})
		return
	}

	q := database.New(h.pool)
	var err error
	if req.Ignored {
		err = q.UpsertClassBuffIgnore(ctx, req.SpellName)
	} else {
		err = q.DeleteClassBuffIgnore(ctx, req.SpellName)
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
